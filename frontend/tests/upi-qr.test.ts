import { describe, expect, it } from 'vitest';
import {
  formatUpiTimestamp,
  buildUpiNote,
  buildUpiPaymentUrl,
} from '@/lib/upi-qr';
import {
  paymentSettingsSchema,
  parsePaymentSettings,
} from '@/lib/payment-settings';

describe('UPI QR Code generation and formatting', () => {
  it('formats timestamp as DD-MM-YY-HH:mm with 2-digit padding', () => {
    // 22nd Nov 2026, 17:58:00
    const date = new Date(2026, 10, 22, 17, 58, 0);
    expect(formatUpiTimestamp(date)).toBe('22-11-26-17:58');

    // Single-digit day, month, hour, minute (5th Jan 2027, 09:05:00)
    const singleDigitDate = new Date(2027, 0, 5, 9, 5, 0);
    expect(formatUpiTimestamp(singleDigitDate)).toBe('05-01-27-09:05');
  });

  it('builds transaction note with tenant name and DD-MM-YY-HH:mm timestamp', () => {
    const date = new Date(2026, 10, 22, 17, 58, 0);
    const note = buildUpiNote('Grand Hotel', date);
    expect(note).toBe('Grand Hotel 22-11-26-17:58');
  });

  it('builds standard NPCI upi://pay deep link with all parameters', () => {
    const date = new Date(2026, 10, 22, 17, 58, 0);
    const url = buildUpiPaymentUrl({
      upiId: 'grandhotel@okhdfcbank',
      payeeName: 'Grand Hotel & Restaurant',
      amount: 100,
      tenantName: 'Grand Hotel',
      date,
    });

    expect(url).toBe(
      'upi://pay?pa=grandhotel%40okhdfcbank&pn=Grand%20Hotel%20%26%20Restaurant&am=100&cu=INR&tn=Grand%20Hotel%2022-11-26-17%3A58'
    );
  });

  it('handles decimal amounts and custom payee names properly', () => {
    const date = new Date(2026, 10, 22, 17, 58, 0);
    const url = buildUpiPaymentUrl({
      upiId: 'owner@icici',
      payeeName: 'John Doe',
      amount: 1250.50,
      tenantName: 'KIPD Restaurant',
      date,
    });

    expect(url).toContain('pa=owner%40icici');
    expect(url).toContain('pn=John%20Doe');
    expect(url).toContain('am=1250.5');
    expect(url).toContain('cu=INR');
    expect(url).toContain('tn=KIPD%20Restaurant%2022-11-26-17%3A58');
  });

  it('paymentSettingsSchema provides default values for UPI QR', () => {
    const parsed = paymentSettingsSchema.parse({});
    expect(parsed.directUpiQr).toBe(false);
    expect(parsed.upiId).toBe('');
    expect(parsed.upiName).toBe('');
  });

  it('parsePaymentSettings backward-compatible with legacy stored records', () => {
    const legacy = {
      manualMethods: ['cash', 'upi'],
      onlinePayments: false,
      depositPercent: 10,
    };
    const parsed = parsePaymentSettings(legacy);
    expect(parsed.manualMethods).toEqual(['cash', 'upi']);
    expect(parsed.directUpiQr).toBe(false);
    expect(parsed.upiId).toBe('');
    expect(parsed.upiName).toBe('');
  });

  it('parses valid UPI QR configuration', () => {
    const input = {
      manualMethods: ['cash', 'upi', 'card'],
      onlinePayments: false,
      depositPercent: 0,
      directUpiQr: true,
      upiId: 'hotel@okaxis',
      upiName: 'Sunrise Hotel',
    };
    const parsed = paymentSettingsSchema.parse(input);
    expect(parsed.directUpiQr).toBe(true);
    expect(parsed.upiId).toBe('hotel@okaxis');
    expect(parsed.upiName).toBe('Sunrise Hotel');
  });
});
