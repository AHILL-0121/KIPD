export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  close?(): Promise<void>;
}

/**
 * Attempts direct ESC/POS printing when a Web Serial thermal printer is already granted or selected,
 * otherwise invokes the Android WebView PrintManager bridge or standard browser `window.print()`.
 */
export async function printEscPosOrDialog(bytes: Uint8Array, opts?: { preferSerial?: boolean }): Promise<'serial' | 'android' | 'browser'> {
  if (typeof window === 'undefined') return 'browser';

  const nav = navigator as Navigator & {
    serial?: {
      getPorts?: () => Promise<SerialPortLike[]>;
      requestPort?: () => Promise<SerialPortLike>;
    };
  };

  if (opts?.preferSerial && nav.serial?.getPorts) {
    try {
      const existing = await nav.serial.getPorts();
      let port: SerialPortLike | undefined = existing[0];
      if (!port && nav.serial.requestPort) {
        port = await nav.serial.requestPort();
      }
      if (port) {
        await port.open({ baudRate: 9600 }).catch(() => {});
        if (port.writable) {
          const writer = port.writable.getWriter();
          await writer.write(bytes);
          writer.releaseLock();
          return 'serial';
        }
      }
    } catch {
      // User cancelled port picker or device unavailable; fall through cleanly to native/browser print.
    }
  }

  const androidBridge = (window as unknown as { AndroidPrinter?: { print?: () => void } }).AndroidPrinter;
  if (androidBridge?.print) {
    androidBridge.print();
    return 'android';
  }

  window.print();
  return 'browser';
}

/** Prints a standalone formatted KOT window so KDS / Orders pages don't lose board layout in @media print. */
export function printKotSlip(textBody: string, escPosBytes: Uint8Array, preferSerial = false) {
  if (typeof window === 'undefined') return;
  if (preferSerial) {
    void printEscPosOrDialog(escPosBytes, { preferSerial: true }).then((mode) => {
      if (mode === 'browser') openBrowserKotPrint(textBody);
    });
    return;
  }
  const androidBridge = (window as unknown as { AndroidPrinter?: { print?: () => void } }).AndroidPrinter;
  if (androidBridge?.print) {
    androidBridge.print();
    return;
  }
  openBrowserKotPrint(textBody);
}

function openBrowserKotPrint(textBody: string) {
  const escaped = textBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const win = window.open('', '_blank', 'width=360,height=600');
  if (!win) {
    window.print();
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head><title>KOT</title><style>
    @page { margin: 4mm; size: 80mm auto; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.4; margin: 0; padding: 8px; white-space: pre-wrap; color: #000; }
  </style></head><body>${escaped}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  win.close();
}
