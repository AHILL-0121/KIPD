export type StatusTone = 'amber' | 'terra' | 'sage' | 'stone';

/**
 * How an order's status reads on every screen: new is highlighted, in progress is neutral, ready is green.
 * Red is kept for cancelled; a normal step in an order's life must never look like an error.
 */
export const ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  new: { label: 'New', tone: 'amber' },
  acknowledged: { label: 'New', tone: 'amber' },
  preparing: { label: 'Preparing', tone: 'stone' },
  ready: { label: 'Ready', tone: 'sage' },
  served: { label: 'Served', tone: 'stone' },
  closed: { label: 'Paid', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'terra' },
};

export function orderStatus(status: string) {
  return ORDER_STATUS[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), tone: 'stone' as StatusTone };
}
