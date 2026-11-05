'use client';

import { useEffect, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GST_STATES, ROOM_GST_SLABS, roomTax, splitGst, taxSettingsSchema, type TaxSettings } from '@/lib/gst';
import { formatCurrency } from '@/lib/currency';

const EMPTY: TaxSettings = taxSettingsSchema.parse({});
const MODES = [
  { value: 'none', label: 'No GST on rooms' },
  { value: 'slab', label: 'Standard slabs, by room price' },
  { value: 'flat', label: 'One fixed rate for every room' },
];

/** Settings > Tax & invoices: the hotel's GST details, how room GST is charged, and what the A4 invoice carries. */
export function TaxSettingsCard() {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [s, setS] = useState<TaxSettings>(EMPTY);
  const [flat, setFlat] = useState('0');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (d: TaxSettings) => { setS(d); setFlat(String(d.flatPercent)); };

  useEffect(() => {
    fetch('/api/settings/tax')
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then((d: TaxSettings) => { apply({ ...EMPTY, ...d }); setLoaded(true); })
      .catch(() => setLoadFailed(true));
  }, []);

  const set = <K extends keyof TaxSettings>(key: K, value: TaxSettings[K]) => { setMessage(null); setS(prev => ({ ...prev, [key]: value })); };

  // Typing a GSTIN fills in the state it belongs to.
  const onGstin = (v: string) => {
    const gstin = v.toUpperCase().replace(/\s/g, '').slice(0, 15);
    setMessage(null);
    setS(prev => ({ ...prev, gstin, stateCode: GST_STATES.some(st => st.code === gstin.slice(0, 2)) ? gstin.slice(0, 2) : prev.stateCode }));
  };

  const candidate = { ...s, flatPercent: Number(flat) };
  const check = taxSettingsSchema.safeParse(candidate);
  const problem = check.success ? '' : check.error.issues[0]?.message ?? '';

  // A worked example, using the same maths the bills use.
  const example = (price: number) => {
    const t = roomTax({ pricePaise: price * 100 * 2, nights: 2, settings: candidate });
    const sp = splitGst(t.taxPaise, false);
    return { t, sp };
  };
  const showExample = s.roomGst !== 'none' && !problem;

  const save = async () => {
    if (!check.success) { setMessage({ ok: false, text: problem }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/tax', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(check.data) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not save. Nothing was changed, please try again.' });
        return;
      }
      apply({ ...EMPTY, ...data });
      setMessage({ ok: true, text: 'Tax and invoice settings saved. They apply to bookings billed from now on.' });
    } catch {
      setMessage({ ok: false, text: 'Could not reach the server. Nothing was changed, please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card hover={false}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-ink rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>Tax &amp; invoices</CardTitle>
          <CardDescription>Your GST details, how room GST is charged, and what the A4 invoice shows</CardDescription>
        </div>
      </div>

      {loadFailed && (
        <p role="alert" className="mb-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">Could not load your tax settings. Refresh the page to try again.</p>
      )}

      <fieldset disabled={!loaded || saving} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Business name on invoices" placeholder="Registered name of the hotel" value={s.legalName} onChange={(e) => set('legalName', e.target.value)} />
          <Input label="GSTIN" placeholder="29ABCDE1234F1Z5" value={s.gstin} onChange={(e) => onGstin(e.target.value)} />
          <Select
            label="State"
            value={s.stateCode}
            onChange={(e) => set('stateCode', e.target.value)}
            options={[{ value: '', label: 'Choose a state' }, ...GST_STATES.map(st => ({ value: st.code, label: `${st.name} (${st.code})` }))]}
          />
          <Input label="Invoice number prefix" placeholder="INV" value={s.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().slice(0, 4))} />
        </div>
        <Textarea label="Address on invoices" rows={3} value={s.address} onChange={(e) => set('address', e.target.value)} />

        <div className="space-y-4">
          <div className="max-w-sm">
            <Select label="GST on rooms" value={s.roomGst} onChange={(e) => set('roomGst', e.target.value as TaxSettings['roomGst'])} options={MODES} />
          </div>
          {s.roomGst === 'slab' && (
            <p className="text-sm text-ink-muted">
              By the price of one room for one night, before tax:{' '}
              {ROOM_GST_SLABS.map((sl, i) => {
                const from = i === 0 ? 0 : ROOM_GST_SLABS[i - 1].upTo;
                return `${i ? '; ' : ''}${sl.upTo === Infinity ? `above ${formatCurrency(from)}` : `up to ${formatCurrency(sl.upTo)}`} is ${sl.rate === 0 ? 'no GST' : `${sl.rate}%`}`;
              }).join('') + '. '}
              Rates change, so check them with your accountant, or use one fixed rate.
            </p>
          )}
          {s.roomGst === 'flat' && (
            <div className="max-w-xs">
              <Input label="GST rate (%)" type="number" inputMode="decimal" min={0} max={28} step="0.5" value={flat} onChange={(e) => { setMessage(null); setFlat(e.target.value); }} />
            </div>
          )}
          {s.roomGst !== 'none' && (
            <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-700" checked={s.ratesIncludeTax} onChange={(e) => set('ratesIncludeTax', e.target.checked)} />
              <span>
                <span className="font-semibold">Room prices already include GST</span>
                <span className="block text-ink-muted mt-0.5">The guest pays the listed price and the GST is shown inside it. Leave this off to add GST on top.</span>
              </span>
            </label>
          )}
          {showExample && (() => {
            const lo = example(5000), hi = example(10000);
            const line = (price: number, e: ReturnType<typeof example>) =>
              `A ${formatCurrency(price)} room for 2 nights: ${e.t.rate ? `${e.t.rate}% GST = ${formatCurrency(e.t.taxPaise / 100)} (CGST ${formatCurrency(e.sp.cgstPaise / 100)} + SGST ${formatCurrency(e.sp.sgstPaise / 100)}), guest pays ${formatCurrency(e.t.totalPaise / 100)}` : `no GST, guest pays ${formatCurrency(e.t.totalPaise / 100)}`}.`;
            return (
              <div role="status" className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-ink-soft space-y-1">
                <p className="font-medium text-ink">Example</p>
                <p>{line(5000, lo)}</p>
                <p>{line(10000, hi)}</p>
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea label="Bank details (printed on invoices)" rows={3} placeholder="Account name, number, IFSC" value={s.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} />
          <Textarea label="Terms (printed on invoices)" rows={3} placeholder="Check-out time, cancellation policy" value={s.terms} onChange={(e) => set('terms', e.target.value)} />
        </div>
      </fieldset>

      {(message || (problem && loaded)) && (
        <p role={message?.ok ? 'status' : 'alert'} className={`mt-6 rounded-lg px-4 py-3 text-sm ${message?.ok ? 'bg-sage-pale text-sage font-medium' : 'bg-terra-pale text-terra'}`}>{message?.text ?? problem}</p>
      )}

      <div className="flex justify-end mt-6 pt-6 border-t border-stone-200">
        <Button onClick={save} isLoading={saving} disabled={!loaded || !!problem}>
          <Save className="w-4 h-4" aria-hidden="true" />
          Save tax settings
        </Button>
      </div>
    </Card>
  );
}
