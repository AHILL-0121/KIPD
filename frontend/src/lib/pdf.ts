/**
 * Lightweight, zero-dependency A4 PDF 1.4 generator for invoices and receipts.
 * Uses standard PDF Type1 fonts (Helvetica / Helvetica-Bold) with WinAnsi encoding
 * and exact byte-offset tracking so generated PDFs open cleanly in Gmail, Chrome,
 * Acrobat, and mobile viewers.
 */

export interface PdfLineItem {
  description: string;
  sublabel?: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface PdfTaxLine {
  label: string;
  amount: number;
}

export interface PdfPaymentLine {
  date: string;
  method: string;
  reference?: string | null;
  amount: number;
}

export interface PdfCreditLine {
  number: string;
  date: string;
  reason: string;
  amount: number;
}

export interface InvoicePdfInput {
  title: string;
  documentNumber: string;
  issuedDate: string;
  seller: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    stateLabel?: string | null;
  };
  buyer: {
    name: string;
    address?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
    placeOfSupply?: string | null;
  };
  stay?: {
    roomNumber: string;
    checkIn: string;
    checkOut: string;
    nights: number;
  };
  lines: PdfLineItem[];
  taxableLabel?: string;
  taxableAmount?: number;
  taxLines?: PdfTaxLine[];
  total: number;
  totalInWords?: string;
  payments?: PdfPaymentLine[];
  credits?: PdfCreditLine[];
  paidTotal: number;
  balanceDue: number;
  footer?: string | null;
}

/** Sanitize text to WinAnsi-safe printable ASCII (replaces ₹ with Rs. so Type1 Helvetica renders cleanly). */
function safePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/₹/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '|')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .trim();
}

function money(n: number): string {
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out.length ? out : [''];
}

export function buildInvoicePdf(data: InvoicePdfInput): Buffer {
  // A4 page in PDF points (72 dpi): 595.28 x 841.89
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 42;
  const RIGHT = PAGE_W - MARGIN;
  const CONTENT_W = RIGHT - MARGIN;

  const ops: string[] = [];
  let y = PAGE_H - 46;

  const text = (x: number, py: number, str: string, size = 10, bold = false, rgb = '0.11 0.10 0.09') => {
    ops.push(`${rgb} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${py.toFixed(2)} Td (${safePdfText(str)}) Tj ET`);
  };

  // Approximate right-aligned text using character width estimation (~0.52 * fontSize)
  const textRight = (rx: number, py: number, str: string, size = 10, bold = false, rgb = '0.11 0.10 0.09') => {
    const clean = str.replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E]/g, ' ').trim();
    const estWidth = clean.length * size * (bold ? 0.54 : 0.50);
    text(Math.max(MARGIN, rx - estWidth), py, str, size, bold, rgb);
  };

  const rule = (py: number, thickness = 0.75, rgb = '0.85 0.84 0.82') => {
    ops.push(`${rgb} RG ${thickness} w ${MARGIN.toFixed(2)} ${py.toFixed(2)} m ${RIGHT.toFixed(2)} ${py.toFixed(2)} l S`);
  };

  const fillRect = (x: number, py: number, w: number, h: number, rgb = '0.96 0.96 0.95') => {
    ops.push(`${rgb} rg ${x.toFixed(2)} ${py.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };

  // Header: Seller left, Document Title & Meta right
  const headerTop = y;
  text(MARGIN, y, data.seller.name.toUpperCase(), 15, true, '0.11 0.10 0.09');
  y -= 16;
  if (data.seller.address) {
    for (const line of data.seller.address.split('\n')) {
      for (const wrapped of wrapText(line, 48)) {
        text(MARGIN, y, wrapped, 9, false, '0.35 0.33 0.31');
        y -= 12;
      }
    }
  }
  const contact = [data.seller.phone, data.seller.email].filter(Boolean).join(' | ');
  if (contact) {
    text(MARGIN, y, contact, 9, false, '0.35 0.33 0.31');
    y -= 12;
  }
  if (data.seller.gstin) {
    const gstLine = `GSTIN: ${data.seller.gstin}${data.seller.stateLabel ? ` (${data.seller.stateLabel})` : ''}`;
    text(MARGIN, y, gstLine, 9, true, '0.11 0.10 0.09');
    y -= 12;
  }

  // Right side header
  textRight(RIGHT, headerTop, data.title.toUpperCase(), 17, true, '0.04 0.42 0.44');
  textRight(RIGHT, headerTop - 18, `No: ${data.documentNumber}`, 10, true);
  textRight(RIGHT, headerTop - 32, `Date: ${data.issuedDate}`, 9, false, '0.35 0.33 0.31');

  y = Math.min(y, headerTop - 48);
  rule(y, 1.5, '0.04 0.42 0.44');
  y -= 20;

  // Buyer & Stay block
  const blockStartY = y;
  let leftY = blockStartY;
  text(MARGIN, leftY, 'BILLED TO', 8, true, '0.47 0.44 0.42');
  leftY -= 14;
  text(MARGIN, leftY, data.buyer.name || 'Guest', 11, true);
  leftY -= 13;
  if (data.buyer.address) {
    for (const wrapped of wrapText(data.buyer.address, 42)) {
      text(MARGIN, leftY, wrapped, 9, false, '0.35 0.33 0.31');
      leftY -= 12;
    }
  }
  if (data.buyer.gstin) {
    text(MARGIN, leftY, `GSTIN: ${data.buyer.gstin}`, 9, false);
    leftY -= 12;
  }
  const buyerContact = [data.buyer.phone, data.buyer.email].filter(Boolean).join(' | ');
  if (buyerContact) {
    text(MARGIN, leftY, buyerContact, 9, false, '0.35 0.33 0.31');
    leftY -= 12;
  }
  if (data.buyer.placeOfSupply) {
    text(MARGIN, leftY, `Place of supply: ${data.buyer.placeOfSupply}`, 9, false, '0.35 0.33 0.31');
    leftY -= 12;
  }

  let rightY = blockStartY;
  if (data.stay) {
    const stayX = MARGIN + 290;
    text(stayX, rightY, 'STAY DETAILS', 8, true, '0.47 0.44 0.42');
    rightY -= 14;
    text(stayX, rightY, `Room: ${data.stay.roomNumber}`, 9, true);
    rightY -= 12;
    text(stayX, rightY, `Check-in: ${data.stay.checkIn}`, 9, false, '0.35 0.33 0.31');
    rightY -= 12;
    text(stayX, rightY, `Check-out: ${data.stay.checkOut}`, 9, false, '0.35 0.33 0.31');
    rightY -= 12;
    text(stayX, rightY, `Nights: ${data.stay.nights}`, 9, false, '0.35 0.33 0.31');
    rightY -= 12;
  }

  y = Math.min(leftY, rightY) - 14;

  // Table Header
  fillRect(MARGIN, y - 6, CONTENT_W, 20, '0.95 0.95 0.94');
  rule(y + 14, 0.75, '0.80 0.79 0.77');
  rule(y - 6, 0.75, '0.80 0.79 0.77');
  text(MARGIN + 6, y, '#', 8, true, '0.35 0.33 0.31');
  text(MARGIN + 26, y, 'DESCRIPTION', 8, true, '0.35 0.33 0.31');
  textRight(RIGHT - 175, y, 'QTY', 8, true, '0.35 0.33 0.31');
  textRight(RIGHT - 90, y, 'RATE', 8, true, '0.35 0.33 0.31');
  textRight(RIGHT - 6, y, 'AMOUNT', 8, true, '0.35 0.33 0.31');
  y -= 22;

  // Line items (render up to page space cleanly)
  data.lines.forEach((line, idx) => {
    if (y < 140) return; // guard overflow on standard single-page bills
    const descLines = wrapText(line.description, 46);
    text(MARGIN + 6, y, String(idx + 1), 9, false, '0.47 0.44 0.42');
    textRight(RIGHT - 175, y, String(line.qty), 9);
    textRight(RIGHT - 90, y, money(line.rate), 9);
    textRight(RIGHT - 6, y, money(line.amount), 9, true);

    let lineY = y;
    for (const dl of descLines) {
      text(MARGIN + 26, lineY, dl, 9.5, false);
      lineY -= 12;
    }
    if (line.sublabel) {
      text(MARGIN + 26, lineY, line.sublabel, 8, false, '0.47 0.44 0.42');
      lineY -= 11;
    }

    y = lineY - 4;
    rule(y + 2, 0.5, '0.90 0.89 0.88');
    y -= 12;
  });

  // Totals block (Right aligned)
  y -= 4;
  const totalsX = RIGHT - 210;
  if (data.taxableAmount !== undefined) {
    text(totalsX, y, data.taxableLabel || 'Taxable value', 9.5, false, '0.35 0.33 0.31');
    textRight(RIGHT - 6, y, money(data.taxableAmount), 9.5);
    y -= 14;
  }
  for (const tx of data.taxLines || []) {
    text(totalsX, y, tx.label, 9.5, false, '0.35 0.33 0.31');
    textRight(RIGHT - 6, y, money(tx.amount), 9.5);
    y -= 14;
  }
  rule(y + 8, 1.2, '0.11 0.10 0.09');
  y -= 4;
  text(totalsX, y, 'Total', 11, true);
  textRight(RIGHT - 6, y, money(data.total), 11, true);
  y -= 18;

  if (data.totalInWords) {
    text(MARGIN, y, `Amount in words: ${data.totalInWords}`, 8.5, false, '0.35 0.33 0.31');
    y -= 18;
  }

  // Payments & Credits summary
  if (data.payments && data.payments.length > 0 && y > 130) {
    text(MARGIN, y, 'PAYMENTS RECEIVED', 8, true, '0.47 0.44 0.42');
    y -= 14;
    for (const p of data.payments) {
      if (y < 90) break;
      const desc = `${p.date} | ${p.method}${p.reference ? ` (${p.reference})` : ''}`;
      text(MARGIN, y, desc, 9, false, '0.35 0.33 0.31');
      textRight(RIGHT - 6, y, money(p.amount), 9);
      y -= 13;
    }
    y -= 4;
  }

  if (data.credits && data.credits.length > 0 && y > 100) {
    text(MARGIN, y, 'CREDIT NOTES', 8, true, '0.47 0.44 0.42');
    y -= 14;
    for (const c of data.credits) {
      if (y < 80) break;
      text(MARGIN, y, `${c.number} (${c.date}) - ${c.reason}`, 9, false, '0.35 0.33 0.31');
      textRight(RIGHT - 6, y, `- ${money(c.amount)}`, 9);
      y -= 13;
    }
    y -= 4;
  }

  text(totalsX, y, 'Total Paid', 9.5, false, '0.02 0.47 0.34');
  textRight(RIGHT - 6, y, money(data.paidTotal), 9.5, true, '0.02 0.47 0.34');
  y -= 14;
  text(totalsX, y, 'Balance Due', 10, true, data.balanceDue > 0 ? '0.68 0.14 0.11' : '0.11 0.10 0.09');
  textRight(RIGHT - 6, y, money(data.balanceDue), 10, true, data.balanceDue > 0 ? '0.68 0.14 0.11' : '0.11 0.10 0.09');

  // Footer
  rule(58, 0.5, '0.88 0.87 0.86');
  text(MARGIN, 42, data.footer || 'Thank you for your business. Generated via Kipd Hospitality Platform.', 8, false, '0.47 0.44 0.42');

  const stream = ops.join('\n');
  const streamLen = Buffer.byteLength(stream, 'latin1');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let cursor = chunks[0].length;

  for (const obj of objects) {
    offsets.push(cursor);
    const buf = Buffer.from(obj, 'latin1');
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefOffset = cursor;
  const xrefLines = [
    'xref\n',
    `0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.map((off) => `${String(off).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ];
  chunks.push(Buffer.from(xrefLines.join(''), 'latin1'));

  return Buffer.concat(chunks);
}
