import { bills } from '@/db/schema';
import { todayInZone } from '@/lib/tz';
import { DEFAULT_TAX_SETTINGS, ROOM_SAC, roomTax, splitGst, taxGroups, type TaxGroup, type TaxSettings } from '@/lib/gst';

/**
 * Nights between arrival and departure: the number of calendar dates from one to the other in the hotel's own time zone,
 * never less than one. The time of day does not matter (a 15:00 check-out is not an extra night) and neither do 23 or 25
 * hour days when the clocks change. This is the rule the booking price and the bill both use.
 */
export const nightsBetween = (checkIn: Date, checkOut: Date, timeZone: string = DEFAULT_TIME_ZONE) => {
  const day = (d: Date) => Date.parse(`${todayInZone(timeZone, d)}T00:00:00Z`);
  return Math.max(1, Math.round((day(checkOut) - day(checkIn)) / 86_400_000));
};

interface StayBillInput {
  tenantId: string;
  bookingId: string;
  guestId: string;
  roomNumber: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  /** The hotel's time zone, which decides where one night ends and the next begins. */
  timeZone?: string;
  /** The booking's price: nights x the room type's rate. */
  total: string;
  /** The hotel's tax profile. Left out (or "No GST"), the bill is just the booking price, as before. */
  tax?: TaxSettings;
}

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const rupees = (paise: number) => paise / 100;

/**
 * The bill for a hotel stay: one line (room, type, nights) and, when the hotel charges room GST, the tax split.
 * With "No GST" nothing is added and the bill equals the booking price. Otherwise the booking price is either the
 * taxable value (GST is added on top) or already includes GST (it is taken out), per the hotel's setting, and the
 * tax is shown as CGST + SGST. IGST, for a guest in another state, is decided when the invoice is issued.
 * Insert it with onConflictDoNothing(): a booking can only have one live stay bill, so confirming twice is harmless.
 */
export function stayBillValues(i: StayBillInput): typeof bills.$inferInsert {
  const nights = nightsBetween(i.checkIn, i.checkOut, i.timeZone);
  const settings = i.tax ?? DEFAULT_TAX_SETTINGS;
  const description = `Room ${i.roomNumber} (${i.roomTypeName}), ${nights} ${nights === 1 ? 'night' : 'nights'}`;

  if (settings.roomGst === 'none') {
    const total = Number(i.total);
    return {
      tenantId: i.tenantId,
      bookingId: i.bookingId,
      kind: 'stay',
      guestId: i.guestId,
      totalAmount: i.total,
      status: 'open',
      itemsBreakdown: {
        items: [{ name: description, qty: nights, rate: Math.round((total / nights) * 100) / 100, amt: total }],
        subtotal: total, cgst: 0, sgst: 0, total,
      },
    };
  }

  const t = roomTax({ pricePaise: Math.round(Number(i.total) * 100), nights, settings });
  const { cgstPaise, sgstPaise } = splitGst(t.taxPaise, false);
  return {
    tenantId: i.tenantId,
    bookingId: i.bookingId,
    kind: 'stay',
    guestId: i.guestId,
    totalAmount: rupees(t.totalPaise).toFixed(2),
    status: 'open',
    itemsBreakdown: {
      items: [{ name: description, qty: nights, rate: Math.round(t.taxablePaise / nights) / 100, amt: rupees(t.taxablePaise), sac: ROOM_SAC, gstRate: t.rate }],
      subtotal: rupees(t.taxablePaise), cgst: rupees(cgstPaise), sgst: rupees(sgstPaise), igst: 0, gstRate: t.rate, total: rupees(t.totalPaise),
      taxSummary: [{ rate: t.rate, taxable: rupees(t.taxablePaise), tax: rupees(t.taxPaise) }],
    },
  };
}

/** Restaurant service (SAC 996331): the code for food and drink lines posted onto a stay bill. */
export const RESTAURANT_SAC = '996331';

export interface BillLine { name: string; qty: number; rate: number; amt: number; sac?: string; gstRate?: number }
export interface StayBreakdown {
  items: BillLine[];
  subtotal: number; cgst: number; sgst: number; igst?: number; gstRate?: number; total: number;
  taxSummary?: TaxGroup[];
  /** Restaurant bills charged to this room, kept so the front desk can see where the lines came from. */
  postings?: { billId: string; at: string; by: string; amount: number }[];
}

const toPaise = (n: number | undefined) => Math.round((n ?? 0) * 100);

/** The GST rate a restaurant bill was charged at, from its own tax lines (5 for 2.5% + 2.5%). */
export function restaurantRate(b: { subtotal?: number; cgst?: number; sgst?: number } | null | undefined): number {
  const subtotal = b?.subtotal ?? 0;
  if (!(subtotal > 0)) return 0;
  return Math.round((((b?.cgst ?? 0) + (b?.sgst ?? 0)) / subtotal) * 10000) / 100;
}

/**
 * Adds a restaurant bill's lines to a stay bill. Each line keeps its own GST rate, so the invoice can show room GST and
 * food GST separately. Works in whole paise: the food is charged at its own rate on its own value, so the stay's total
 * can differ by a few paise from the restaurant bill's whole-rupee total, which is replaced by this.
 */
export function postCharges(existing: Partial<StayBreakdown> | null, add: { items: { name: string; qty: number; rate: number; amt: number }[]; ratePercent: number; billId: string; by: string; at: Date }): { breakdown: StayBreakdown; totalPaise: number } {
  const groups: TaxGroup[] = taxGroups(existing).map((g) => ({ ...g }));
  const lines: BillLine[] = add.items.map((i) => ({ name: `Restaurant: ${i.name}`, qty: i.qty, rate: i.rate, amt: i.amt, sac: RESTAURANT_SAC, gstRate: add.ratePercent }));
  const addTaxable = lines.reduce((s, l) => s + toPaise(l.amt), 0);
  const addTax = Math.round((addTaxable * add.ratePercent) / 100);

  const hit = groups.find((g) => g.rate === add.ratePercent);
  if (hit) { hit.taxable = (toPaise(hit.taxable) + addTaxable) / 100; hit.tax = (toPaise(hit.tax) + addTax) / 100; }
  else groups.push({ rate: add.ratePercent, taxable: addTaxable / 100, tax: addTax / 100 });

  // A stay with no tax lines at all (rate 0, nothing taxed) has an empty first group; drop it once real tax exists.
  const kept = groups.filter((g, _i, all) => !(g.rate === 0 && g.tax === 0 && g.taxable === 0 && all.length > 1));
  const taxablePaise = kept.reduce((s, g) => s + toPaise(g.taxable), 0);
  const taxPaise = kept.reduce((s, g) => s + toPaise(g.tax), 0);
  const { cgstPaise, sgstPaise } = splitGst(taxPaise, false);
  const totalPaise = taxablePaise + taxPaise;
  const breakdown: StayBreakdown = {
    items: [...(existing?.items ?? []), ...lines],
    subtotal: taxablePaise / 100, cgst: cgstPaise / 100, sgst: sgstPaise / 100, igst: 0, total: totalPaise / 100,
    taxSummary: kept,
    postings: [...(existing?.postings ?? []), { billId: add.billId, at: add.at.toISOString(), by: add.by, amount: (addTaxable + addTax) / 100 }],
  };
  return { breakdown, totalPaise };
}

/**
 * The stay bill after the booking's dates, room or price changed: the room line is replaced by `fresh` (what
 * stayBillValues() makes for the new stay) and every restaurant charge already posted to the room is kept exactly,
 * to the paisa. What the room used to cost is the old total minus the postings, so nothing is re-rounded.
 */
export function reviseStayBreakdown(existing: Partial<StayBreakdown> | null | undefined, fresh: StayBreakdown): { breakdown: StayBreakdown; totalPaise: number } {
  const extras = (existing?.items ?? []).filter((l) => l.sac === RESTAURANT_SAC);
  if (!existing || extras.length === 0) return { breakdown: fresh, totalPaise: toPaise(fresh.total) };

  const oldRoom = (existing.items ?? []).find((l) => l.sac !== RESTAURANT_SAC);
  const postedPaise = (existing.postings ?? []).reduce((s, p) => s + toPaise(p.amount), 0);
  const oldRoomTaxable = toPaise(oldRoom?.amt);
  const oldRoomTax = toPaise(existing.total) - postedPaise - oldRoomTaxable;
  const oldRoomRate = oldRoom?.gstRate ?? 0;

  // Take the old room out of the tax groups; what is left is the restaurant's share.
  const groups = taxGroups(existing).map((g) => ({ rate: g.rate, taxable: toPaise(g.taxable), tax: toPaise(g.tax) }));
  const was = groups.find((g) => g.rate === oldRoomRate);
  if (was) { was.taxable -= oldRoomTaxable; was.tax -= oldRoomTax; }
  const kept = groups.filter((g) => g.taxable > 0 || g.tax > 0);

  // Put the new room in.
  for (const g of taxGroups(fresh)) {
    const hit = kept.find((k) => k.rate === g.rate);
    if (hit) { hit.taxable += toPaise(g.taxable); hit.tax += toPaise(g.tax); }
    else kept.unshift({ rate: g.rate, taxable: toPaise(g.taxable), tax: toPaise(g.tax) });
  }
  const summary = kept.filter((g, _i, all) => !(g.rate === 0 && g.tax === 0 && g.taxable === 0 && all.length > 1));
  const taxablePaise = summary.reduce((s, g) => s + g.taxable, 0);
  const taxPaise = summary.reduce((s, g) => s + g.tax, 0);
  const { cgstPaise, sgstPaise } = splitGst(taxPaise, false);
  const totalPaise = taxablePaise + taxPaise;
  return {
    totalPaise,
    breakdown: {
      items: [...fresh.items, ...extras],
      subtotal: taxablePaise / 100, cgst: cgstPaise / 100, sgst: sgstPaise / 100, igst: 0, total: totalPaise / 100,
      taxSummary: summary.map((g) => ({ rate: g.rate, taxable: g.taxable / 100, tax: g.tax / 100 })),
      postings: existing.postings ?? [],
    },
  };
}
