'use client';

import { useEffect, useState } from 'react';
import { Wallet, Save } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const MANUAL = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card (machine)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

interface Loaded { manualMethods: string[]; onlinePayments: boolean; depositPercent: number; razorpayConfigured: boolean }

/** Settings > Payments: how this property takes money. Saved on the server, so every staff member sees the same choices. */
export function PaymentSettingsCard() {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [methods, setMethods] = useState<string[]>(MANUAL.map(m => m.value));
  const [online, setOnline] = useState(false);
  const [deposit, setDeposit] = useState('0');
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (d: Loaded) => {
    setMethods(d.manualMethods);
    setOnline(d.onlinePayments);
    setDeposit(String(d.depositPercent));
    setConfigured(d.razorpayConfigured);
  };

  useEffect(() => {
    fetch('/api/settings/payments')
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then((d: Loaded) => { apply(d); setLoaded(true); })
      .catch(() => setLoadFailed(true));
  }, []);

  const toggle = (value: string) => {
    setMessage(null);
    setMethods(m => (m.includes(value) ? m.filter(x => x !== value) : [...m, value]));
  };

  const percent = Number(deposit);
  const percentOk = deposit.trim() !== '' && Number.isFinite(percent) && percent >= 0 && percent <= 100;

  const save = async () => {
    if (methods.length === 0) { setMessage({ ok: false, text: 'Keep at least one way to record a payment.' }); return; }
    if (!percentOk) { setMessage({ ok: false, text: 'The deposit must be a number from 0 to 100.' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualMethods: methods, onlinePayments: online, depositPercent: percent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ ok: false, text: res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not save. Nothing was changed, please try again.' });
        return;
      }
      apply(await res.json());
      setMessage({ ok: true, text: 'Payment settings saved.' });
    } catch {
      setMessage({ ok: false, text: 'Could not reach the server. Nothing was changed, please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card hover={false}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-sage rounded-lg flex items-center justify-center">
          <Wallet className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>Payments</CardTitle>
          <CardDescription>How guests pay, and the deposit to suggest</CardDescription>
        </div>
      </div>

      {loadFailed && (
        <p role="alert" className="mb-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">Could not load your payment settings. Refresh the page to try again.</p>
      )}

      <fieldset disabled={!loaded || saving} className="space-y-6">
        <div>
          <legend className="text-sm font-semibold text-ink mb-1">Ways staff can record a payment</legend>
          <p className="text-sm text-ink-muted mb-3">Only these appear in the Record payment box.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MANUAL.map(m => (
              <label key={m.value} className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-ink cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={methods.includes(m.value)} onChange={() => toggle(m.value)} />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-700" checked={online} onChange={(e) => { setMessage(null); setOnline(e.target.checked); }} />
            <span>
              <span className="font-semibold">Online payment links (Razorpay)</span>
              <span className="block text-ink-muted mt-0.5">Staff can send a guest a link to pay a hotel bill, or part of it. The payment is added to the bill by itself once it is paid.</span>
            </span>
          </label>
          {online && loaded && !configured && (
            <p role="status" className="mt-3 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
              Razorpay is not connected on the server yet, so links cannot be created. The administrator needs to add the Razorpay keys.
            </p>
          )}
        </div>

        <div className="max-w-xs">
          <Input
            label="Suggested deposit (% of the stay)"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="1"
            value={deposit}
            onChange={(e) => { setMessage(null); setDeposit(e.target.value); }}
          />
          <p className="mt-1.5 text-sm text-ink-muted">Fills in the amount when the first payment is recorded on a hotel stay. Staff can change it. Use 0 for no suggestion.</p>
        </div>
      </fieldset>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-6 rounded-lg px-4 py-3 text-sm ${message.ok ? 'bg-sage-pale text-sage font-medium' : 'bg-terra-pale text-terra'}`}>{message.text}</p>
      )}

      <div className="flex justify-end mt-6 pt-6 border-t border-stone-200">
        <Button onClick={save} isLoading={saving} disabled={!loaded}>
          <Save className="w-4 h-4" aria-hidden="true" />
          Save payment settings
        </Button>
      </div>
    </Card>
  );
}
