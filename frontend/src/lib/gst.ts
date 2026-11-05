import { z } from 'zod';

/**
 * GST for hotel rooms: the tax profile a property saves in Settings, and the arithmetic that turns a room price
 * into taxable value + tax. Pure (no database), so the Settings page can preview with the same code the server bills with.
 * All money maths is done in whole paise so CGST + SGST always add up to exactly the tax.
 */

/** GST state codes, as printed on an invoice (the first two digits of a GSTIN). */
export const GST_STATES: { code: string; name: string }[] = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['26', 'Dadra & Nagar Haveli and Daman & Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman & Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'],
].map(([code, name]) => ({ code, name }));

export const stateName = (code: string | undefined | null) => GST_STATES.find((s) => s.code === code)?.name ?? '';

/** SAC (service accounting code) for hotel accommodation. */
export const ROOM_SAC = '9963';

/**
 * The standard room-tariff slabs: GST is decided by the price of one room for one night, before tax.
 * These are the rates in force when this was written. They change, so confirm with your accountant, and use the
 * "one fixed rate" setting to override them without waiting for an update.
 */
export const ROOM_GST_SLABS: { upTo: number; rate: number }[] = [
  { upTo: 1000, rate: 0 },
  { upTo: 7500, rate: 5 },
  { upTo: Infinity, rate: 18 },
];

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isGstin = (v: string) => GSTIN.test(v);

export const taxSettingsSchema = z.object({
  legalName: z.string().trim().max(120).default(''),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || GSTIN.test(v), 'That does not look like a GSTIN (15 characters, like 29ABCDE1234F1Z5)').default(''),
  address: z.string().trim().max(300).default(''),
  stateCode: z.string().trim().refine((v) => v === '' || GST_STATES.some((s) => s.code === v), 'Choose a state from the list').default(''),
  /** none: no GST on rooms (not registered, or you add it yourself). slab: by room price. flat: one rate for every room. */
  roomGst: z.enum(['none', 'slab', 'flat']).default('none'),
  flatPercent: z.number().min(0).max(28).default(0),
  /** The prices you enter for room types already include GST, so GST is taken out of them instead of added on top. */
  ratesIncludeTax: z.boolean().default(false),
  /** Up to four letters or digits. The full number is PREFIX/26-27/0001, which stays within the 16 characters GST allows. */
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, 'Use 1 to 4 letters or digits, like INV').default('INV'),
  bankDetails: z.string().trim().max(300).default(''),
  terms: z.string().trim().max(600).default(''),
}).superRefine((s, ctx) => {
  if (s.gstin && s.stateCode && s.gstin.slice(0, 2) !== s.stateCode) {
    ctx.addIssue({ code: 'custom', path: ['stateCode'], message: `Your GSTIN starts with ${s.gstin.slice(0, 2)} (${stateName(s.gstin.slice(0, 2)) || 'unknown state'}), so the state must match.` });
  }
  if (s.roomGst !== 'none' && !s.gstin) {
    ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Add your GSTIN before charging GST on rooms.' });
  }
  if (s.roomGst === 'flat' && s.flatPercent <= 0) {
    ctx.addIssue({ code: 'custom', path: ['flatPercent'], message: 'Enter the GST rate to charge, like 12.' });
  }
});
export type TaxSettings = z.infer<typeof taxSettingsSchema>;

export const DEFAULT_TAX_SETTINGS: TaxSettings = taxSettingsSchema.parse({});

/** Stored settings, with the defaults for anything missing or invalid, so a bad row can never stop a booking. */
export function parseTaxSettings(stored: unknown): TaxSettings {
  const parsed = taxSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_TAX_SETTINGS;
}

export const slabRate = (perNight: number) => ROOM_GST_SLABS.find((s) => perNight <= s.upTo)!.rate;

export interface RoomTax {
  /** Percent, 0 when no GST applies. */
  rate: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * Splits a stay's price into taxable value and GST.
 * `pricePaise` is what the booking says the stay costs. If prices include GST it is the total the guest pays,
 * otherwise GST is added on top. The slab is decided by one night's price before tax.
 */
export function roomTax(i: { pricePaise: number; nights: number; settings: Pick<TaxSettings, 'roomGst' | 'flatPercent' | 'ratesIncludeTax'> }): RoomTax {
  const { pricePaise, nights, settings: s } = i;
  const none: RoomTax = { rate: 0, taxablePaise: pricePaise, taxPaise: 0, totalPaise: pricePaise };
  if (s.roomGst === 'none' || pricePaise <= 0) return none;
  const n = Math.max(1, nights);

  let rate: number;
  if (s.roomGst === 'flat') rate = s.flatPercent;
  else if (s.ratesIncludeTax) {
    // The slab depends on the price BEFORE tax, so find the first slab whose own rate leaves a pre-tax price inside it.
    // (A tax-inclusive price just above a slab edge, like 1,040, fits no slab exactly; the lower rate is used.)
    const night = pricePaise / n / 100;
    rate = (ROOM_GST_SLABS.find((sl) => night / (1 + sl.rate / 100) <= sl.upTo) ?? ROOM_GST_SLABS[ROOM_GST_SLABS.length - 1]).rate;
  } else rate = slabRate(pricePaise / n / 100);

  if (rate <= 0) return none;
  if (s.ratesIncludeTax) {
    const taxable = Math.round(pricePaise / (1 + rate / 100));
    return { rate, taxablePaise: taxable, taxPaise: pricePaise - taxable, totalPaise: pricePaise };
  }
  const tax = Math.round((pricePaise * rate) / 100);
  return { rate, taxablePaise: pricePaise, taxPaise: tax, totalPaise: pricePaise + tax };
}

/** CGST and SGST (equal halves, to the paisa) for a sale inside the state, or IGST for one across states. */
export function splitGst(taxPaise: number, interState: boolean) {
  if (interState) return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgst = Math.round(taxPaise / 2);
  return { cgstPaise: cgst, sgstPaise: taxPaise - cgst, igstPaise: 0 };
}

/** The Indian financial year (April to March) a date falls in, in the hotel's time zone, as "26-27". */
export function financialYear(timeZone: string, at: Date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(at).map((p) => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month);
  const start = month >= 4 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${below100(n % 100)}`;

/** 12345.5 -> "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" (lakh and crore, as on Indian invoices). */
export function amountInWords(rupees: number): string {
  const paiseTotal = Math.round(rupees * 100);
  const r = Math.floor(paiseTotal / 100), p = paiseTotal % 100;
  const parts: string[] = [];
  const crore = Math.floor(r / 10_000_000), lakh = Math.floor((r % 10_000_000) / 100_000), thousand = Math.floor((r % 100_000) / 1000), rest = r % 1000;
  if (crore) parts.push(`${below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  const rupeeWords = parts.length ? parts.join(' ') : 'Zero';
  return `Rupees ${rupeeWords}${p ? ` and ${below100(p)} Paise` : ''} Only`;
}

export interface TaxGroup { rate: number; taxable: number; tax: number }

/** The tax groups of a stay bill (one per GST rate): the stored ones, or for an older bill its single room rate. */
export function taxGroups(b: { taxSummary?: TaxGroup[]; subtotal?: number; total?: number; cgst?: number; sgst?: number; igst?: number; gstRate?: number } | null | undefined): TaxGroup[] {
  if (!b) return [];
  if (b.taxSummary?.length) return b.taxSummary;
  const tax = (b.cgst ?? 0) + (b.sgst ?? 0) + (b.igst ?? 0);
  return [{ rate: b.gstRate ?? 0, taxable: b.subtotal ?? b.total ?? 0, tax }];
}
