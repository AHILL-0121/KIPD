/** Whole rupees, never more than the total: the amount to suggest for a first payment. 0 means "no suggestion". */
export function suggestedDeposit(total: number, percent: number): number {
  if (!(percent > 0) || !(total > 0)) return 0;
  return Math.min(total, Math.round((total * percent) / 100));
}
