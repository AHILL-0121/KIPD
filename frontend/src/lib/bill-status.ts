import type { StatusTone } from '@/lib/order-status';

/** How a bill's status reads on screen: unpaid is the one to act on, paid is calm green. Nothing here is red. */
export const BILL_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Unpaid', tone: 'amber' },
  partial: { label: 'Part paid', tone: 'amber' },
  paid: { label: 'Paid', tone: 'sage' },
  void: { label: 'Cancelled', tone: 'stone' }, // the bill of a cancelled booking; not listed, but named if one ever shows
};

export function billStatus(status: string) {
  return BILL_STATUS[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), tone: 'stone' as StatusTone };
}
