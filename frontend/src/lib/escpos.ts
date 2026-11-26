const ESC = 0x1b;
const GS = 0x1d;

const CMD_INIT = [ESC, 0x40];
const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00];
const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];
const CMD_BOLD_ON = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
const CMD_DOUBLE_ON = [GS, 0x21, 0x11];
const CMD_DOUBLE_OFF = [GS, 0x21, 0x00];
const CMD_CUT = [GS, 0x56, 0x42, 0x00];

const encoder = new TextEncoder();

export interface KotTicketData {
  propertyName?: string;
  outletName?: string;
  orderNumber?: string;
  orderId: string;
  tableNumber?: string | null;
  roomNumber?: string | null;
  type?: string;
  source?: string | null;
  createdAt: string | Date;
  specialInstructions?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    variantName?: string | null;
    notes?: string | null;
  }>;
}

export interface ReceiptTicketData {
  header: string;
  subtext?: string | null;
  footer?: string | null;
  billId: string;
  guestName?: string | null;
  date: string | Date;
  lines: Array<{ label: string; qty: number; total: string }>;
  total: string;
  paid?: string;
  balance?: string;
}

function padRow(left: string, right: string, width = 32): string {
  const cleanLeft = left.replace(/[\r\n]+/g, ' ').trim();
  const cleanRight = right.replace(/[\r\n]+/g, ' ').trim();
  const space = Math.max(1, width - cleanLeft.length - cleanRight.length);
  if (cleanLeft.length + cleanRight.length + 1 > width) {
    return `${cleanLeft.slice(0, Math.max(4, width - cleanRight.length - 1))} ${cleanRight}`;
  }
  return `${cleanLeft}${' '.repeat(space)}${cleanRight}`;
}

function buildBytes(chunks: (number[] | string)[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const c of chunks) {
    parts.push(typeof c === 'string' ? encoder.encode(c) : Uint8Array.from(c));
  }
  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Builds formatted 80mm plain text for a Kitchen Order Ticket (KOT). */
export function formatKotText(kot: KotTicketData, width = 32): string {
  const divider = '-'.repeat(width);
  const dest = kot.tableNumber
    ? `TABLE ${kot.tableNumber}`
    : kot.roomNumber
      ? `ROOM ${kot.roomNumber}`
      : (kot.type || 'TAKEAWAY').toUpperCase().replace('_', ' ');
  const timeStr = new Date(kot.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const lines: string[] = [];
  if (kot.propertyName) lines.push(kot.propertyName.toUpperCase());
  if (kot.outletName) lines.push(kot.outletName);
  lines.push(`*** KOT: ${dest} ***`);
  if (kot.source === 'guest') lines.push('[GUEST QR ORDER]');
  lines.push(`Ticket: #${kot.orderNumber || kot.orderId.slice(0, 6).toUpperCase()}`);
  lines.push(`Time: ${timeStr}`);
  lines.push(divider);

  for (const item of kot.items) {
    const label = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    lines.push(`${item.quantity}x ${label}`);
    if (item.notes) lines.push(`   Note: ${item.notes}`);
  }

  if (kot.specialInstructions) {
    lines.push(divider);
    lines.push(`ORDER NOTE: ${kot.specialInstructions}`);
  }
  lines.push(divider);
  return lines.join('\n');
}

/** Generates raw ESC/POS commands for an 80mm/58mm KOT thermal printer. */
export function formatKotEscPos(kot: KotTicketData): Uint8Array {
  const divider = '-'.repeat(32) + '\n';
  const dest = kot.tableNumber
    ? `TABLE ${kot.tableNumber}`
    : kot.roomNumber
      ? `ROOM ${kot.roomNumber}`
      : (kot.type || 'TAKEAWAY').toUpperCase().replace('_', ' ');
  const timeStr = new Date(kot.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const chunks: (number[] | string)[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_BOLD_ON,
    kot.propertyName ? `${kot.propertyName.toUpperCase()}\n` : 'KIPD KITCHEN\n',
    kot.outletName ? `${kot.outletName}\n` : '',
    CMD_DOUBLE_ON,
    `${dest}\n`,
    CMD_DOUBLE_OFF,
    kot.source === 'guest' ? 'GUEST QR ORDER\n' : '',
    CMD_BOLD_OFF,
    CMD_ALIGN_LEFT,
    `KOT #${kot.orderNumber || kot.orderId.slice(0, 6).toUpperCase()}  ${timeStr}\n`,
    divider,
  ];

  for (const item of kot.items) {
    const label = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    chunks.push(CMD_BOLD_ON, `${item.quantity}x ${label}\n`, CMD_BOLD_OFF);
    if (item.notes) chunks.push(`  Note: ${item.notes}\n`);
  }

  if (kot.specialInstructions) {
    chunks.push(divider, CMD_BOLD_ON, `NOTE: ${kot.specialInstructions}\n`, CMD_BOLD_OFF);
  }

  chunks.push(divider, '\n\n\n', CMD_CUT);
  return buildBytes(chunks);
}

/** Generates raw ESC/POS bytes for a customer receipt. */
export function formatReceiptEscPos(receipt: ReceiptTicketData): Uint8Array {
  const divider = '-'.repeat(32) + '\n';
  const dateStr = new Date(receipt.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const chunks: (number[] | string)[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_BOLD_ON,
    `${receipt.header}\n`,
    CMD_BOLD_OFF,
    receipt.subtext ? `${receipt.subtext}\n` : '',
    CMD_ALIGN_LEFT,
    divider,
    `Bill: #${receipt.billId.slice(0, 8).toUpperCase()}\n`,
    receipt.guestName ? `Guest: ${receipt.guestName}\n` : '',
    `Date: ${dateStr}\n`,
    divider,
  ];

  for (const line of receipt.lines) {
    chunks.push(`${padRow(`${line.qty}x ${line.label}`, line.total)}\n`);
  }

  chunks.push(divider, CMD_BOLD_ON, `${padRow('TOTAL', receipt.total)}\n`, CMD_BOLD_OFF);
  if (receipt.paid) chunks.push(`${padRow('PAID', receipt.paid)}\n`);
  if (receipt.balance) chunks.push(`${padRow('BALANCE', receipt.balance)}\n`);
  chunks.push(divider, CMD_ALIGN_CENTER);
  if (receipt.footer) chunks.push(`${receipt.footer}\n`);
  chunks.push('\n\n\n', CMD_CUT);
  return buildBytes(chunks);
}
