/**
 * Pure utilities for generating NPCI-compliant UPI payment deep links and QR codes.
 * Kept free of database dependencies so it can be safely used in client components and browser contexts.
 */

/**
 * Format timestamp for UPI transaction note: DD-MM-YY-HH:mm (e.g. 22-11-26-17:58)
 */
export function formatUpiTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yy = String(date.getFullYear()).slice(-2);
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${dd}-${mm}-${yy}-${hh}:${min}`;
}

/**
 * Transaction note: "{TenantName} {DD-MM-YY-HH:mm}" (e.g. "Grand Hotel 22-11-26-17:58")
 */
export function buildUpiNote(tenantName: string, date: Date = new Date()): string {
  const name = tenantName.trim() || 'KIPD';
  return `${name} ${formatUpiTimestamp(date)}`;
}

/**
 * Constructs standard NPCI UPI payment deep link:
 * upi://pay?pa={UPI_ID}&pn={NAME}&am={AMOUNT}&cu=INR&tn={NOTE}
 */
export function buildUpiPaymentUrl(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  tenantName: string;
  date?: Date;
}): string {
  const pa = encodeURIComponent(params.upiId.trim());
  const pn = encodeURIComponent(params.payeeName.trim() || params.tenantName.trim());
  const am = (Math.round(params.amount * 100) / 100).toString();
  const tn = encodeURIComponent(buildUpiNote(params.tenantName, params.date));
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}
