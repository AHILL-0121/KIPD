import { describe, expect, it } from 'vitest';
import { amountInWords, financialYear, parseTaxSettings, roomTax, slabRate, splitGst, taxSettingsSchema } from '@/lib/gst';

const rs = (n: number) => Math.round(n * 100);
const settings = (over: object = {}) => ({ roomGst: 'slab' as const, flatPercent: 0, ratesIncludeTax: false, ...over });

describe('room GST by price slab', () => {
  it('uses the price of one night to pick the rate', () => {
    expect(slabRate(1000)).toBe(0);
    expect(slabRate(1000.01)).toBe(5);
    expect(slabRate(7500)).toBe(5);
    expect(slabRate(7500.01)).toBe(18);
  });

  it('adds GST on top of a price that excludes it', () => {
    const t = roomTax({ pricePaise: rs(10000), nights: 2, settings: settings() }); // 5,000 a night
    expect(t).toEqual({ rate: 5, taxablePaise: rs(10000), taxPaise: rs(500), totalPaise: rs(10500) });
    const dear = roomTax({ pricePaise: rs(20000), nights: 2, settings: settings() }); // 10,000 a night
    expect(dear).toMatchObject({ rate: 18, taxPaise: rs(3600), totalPaise: rs(23600) });
  });

  it('takes GST out of a price that includes it, and the parts add back to the price', () => {
    const t = roomTax({ pricePaise: rs(10000), nights: 2, settings: settings({ ratesIncludeTax: true }) });
    expect(t.rate).toBe(5);
    expect(t.totalPaise).toBe(rs(10000));
    expect(t.taxablePaise + t.taxPaise).toBe(t.totalPaise);
    expect(t.taxablePaise).toBe(rs(9523.81));
  });

  it('picks the slab from the price before tax when GST is included', () => {
    // 7,800 including 5% is 7,428.57 before tax, which is a 5% room.
    expect(roomTax({ pricePaise: rs(7800), nights: 1, settings: settings({ ratesIncludeTax: true }) }).rate).toBe(5);
    // 8,000 including GST is above the slab even before tax, so it is an 18% room.
    expect(roomTax({ pricePaise: rs(8000), nights: 1, settings: settings({ ratesIncludeTax: true }) }).rate).toBe(18);
    // 900 is a no-GST room with or without tax included.
    expect(roomTax({ pricePaise: rs(900), nights: 1, settings: settings({ ratesIncludeTax: true }) })).toMatchObject({ rate: 0, taxPaise: 0 });
  });

  it('charges nothing when GST is off, and uses one rate for every room when it is flat', () => {
    expect(roomTax({ pricePaise: rs(10000), nights: 2, settings: settings({ roomGst: 'none' }) })).toMatchObject({ rate: 0, taxPaise: 0, totalPaise: rs(10000) });
    expect(roomTax({ pricePaise: rs(500), nights: 1, settings: settings({ roomGst: 'flat', flatPercent: 12 }) })).toMatchObject({ rate: 12, taxPaise: rs(60) });
  });
});

describe('CGST, SGST and IGST', () => {
  it('splits within the state into two halves that add up exactly, even for an odd number of paise', () => {
    expect(splitGst(47619, false)).toEqual({ cgstPaise: 23810, sgstPaise: 23809, igstPaise: 0 });
    for (const tax of [0, 1, 2, 3, 999, 47619]) {
      const s = splitGst(tax, false);
      expect(s.cgstPaise + s.sgstPaise).toBe(tax);
    }
  });
  it('is all IGST across states', () => {
    expect(splitGst(50000, true)).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 50000 });
  });
});

describe('the tax profile', () => {
  const valid = { gstin: '29ABCDE1234F1Z5', stateCode: '29', roomGst: 'slab' };

  it('defaults to no GST and nothing printed, even from an empty or broken row', () => {
    for (const stored of [{}, null, undefined, { gstin: 'nonsense' }, 'x']) {
      expect(parseTaxSettings(stored)).toMatchObject({ roomGst: 'none', gstin: '', invoicePrefix: 'INV', ratesIncludeTax: false });
    }
  });
  it('accepts a real-looking GSTIN and tidies its case', () => {
    expect(taxSettingsSchema.parse({ ...valid, gstin: ' 29abcde1234f1z5 ' }).gstin).toBe('29ABCDE1234F1Z5');
  });
  it('refuses a malformed GSTIN, a state that disagrees with it, and GST without a GSTIN', () => {
    expect(taxSettingsSchema.safeParse({ ...valid, gstin: '29ABCDE1234' }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...valid, stateCode: '27' }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ roomGst: 'slab' }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...valid, roomGst: 'flat', flatPercent: 0 }).success).toBe(false);
  });
  it('keeps the invoice prefix short enough that the full number stays within 16 characters', () => {
    expect(taxSettingsSchema.safeParse({ invoicePrefix: 'HOTEL' }).success).toBe(false);
    expect(taxSettingsSchema.parse({ invoicePrefix: 'ab1' }).invoicePrefix).toBe('AB1');
  });
});

describe('financial year', () => {
  it('runs April to March in the hotel\'s own time zone', () => {
    expect(financialYear('Asia/Kolkata', new Date('2026-04-01T00:00:00+05:30'))).toBe('26-27');
    expect(financialYear('Asia/Kolkata', new Date('2027-03-31T23:30:00+05:30'))).toBe('26-27');
    expect(financialYear('Asia/Kolkata', new Date('2026-03-31T23:59:00+05:30'))).toBe('25-26');
    // 20:00 UTC on 31 March is already 1 April in India.
    expect(financialYear('Asia/Kolkata', new Date('2026-03-31T20:00:00Z'))).toBe('26-27');
  });
});

describe('amount in words', () => {
  it('uses lakh and crore, and says paise only when there are some', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
    expect(amountInWords(10500)).toBe('Rupees Ten Thousand Five Hundred Only');
    expect(amountInWords(123456.5)).toBe('Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only');
    expect(amountInWords(25_000_000)).toBe('Rupees Two Crore Fifty Lakh Only');
    expect(amountInWords(1.05)).toBe('Rupees One and Five Paise Only');
  });
});
