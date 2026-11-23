'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Printing shows only the sheet, on A4, so the sidebar and the page around it never reach the paper.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#a4-print-root) { display: none !important; }
  #a4-print-root > article { width: 100% !important; min-height: 0 !important; padding: 0 !important; }
}
`;

/**
 * The page around an A4 document: a toolbar to go back and print, the sheet on screen, and a second copy of the sheet
 * that is the only thing printed. `fileTitle` becomes the page title, which browsers offer as the PDF file name.
 */
export function A4Frame({ fileTitle, backHref, backLabel, actions, sheet, below }: {
  fileTitle: string;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
  sheet: ReactNode;
  below?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const before = document.title;
    document.title = fileTitle;
    return () => { document.title = before; };
  }, [fileTitle]);

  const handlePrint = () => {
    // 1. Android Capacitor WebView native printer bridge
    if (typeof window !== 'undefined' && (window as any).AndroidPrinter?.print) {
      try {
        (window as any).AndroidPrinter.print();
        return;
      } catch (err) {
        console.warn('Native Android printer failed:', err);
      }
    }

    // 2. Browser print dialog
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      try {
        window.print();
        return;
      } catch (err) {
        console.warn('window.print failed:', err);
      }
    }
  };

  const handleDownload = () => {
    const el = document.getElementById('a4-print-root') || document.querySelector('article');
    if (!el) return;
    const cleanTitle = fileTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fileTitle}</title>
<style>
  ${PRINT_CSS}
  body { margin: 0; padding: 14mm; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #1c1917; }
  article { width: 100%; max-width: 210mm; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; }
</style>
</head>
<body>
  ${el.outerHTML}
  <script>
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  </script>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-2 rounded text-sm font-medium text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="hidden text-sm text-ink-muted lg:block">To save a PDF, choose &ldquo;Save as PDF&rdquo; as the printer.</p>
          {actions}
          <Button variant="ghost" className="border border-stone-200 bg-white hover:bg-stone-50" onClick={handleDownload} title="Download file to view or print anytime">
            <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Download
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Print or save as PDF
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto print:hidden w-full">
        <div className="mx-auto w-full max-w-[210mm] border border-stone-200 shadow-lg bg-white rounded-lg overflow-hidden">{sheet}</div>
      </div>
      {below && <div className="print:hidden">{below}</div>}
      {mounted && createPortal(<div id="a4-print-root" className="hidden print:block">{sheet}</div>, document.body)}
    </>
  );
}
