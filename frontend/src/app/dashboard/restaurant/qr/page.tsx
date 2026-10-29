'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';

interface Table { id: string; tableNumber: string; qrCode?: string }
interface Card { id: string; tableNumber: string; url: string; image: string }

/**
 * Printable QR cards, one per table. Each code opens that table's menu, so a guest can scan and order.
 * Codes are drawn in the browser; nothing about the tables leaves this page.
 */
export default function QrSheetPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tablesRes, infoRes] = await Promise.all([fetch('/api/tables', { cache: 'no-store' }), fetch('/api/tenant/info')]);
        if (!tablesRes.ok) throw new Error('Could not load your tables.');
        const tables: Table[] = await tablesRes.json();
        if (infoRes.ok) setName((await infoRes.json()).name ?? '');
        const withLink = tables.filter((t) => t.qrCode);
        setCards(await Promise.all(withLink.map(async (t) => {
          const url = `${window.location.origin}${t.qrCode}`;
          // High error correction survives a scuff or a wet table; the margin keeps phones' scanners happy.
          const image = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 2, width: 600 });
          return { id: t.id, tableNumber: t.tableNumber, url, image };
        })));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build the QR codes.');
      }
    })();
  }, []);

  if (error) return <div className="p-8"><p role="alert" className="text-terra">{error}</p></div>;
  if (!cards) return <LoadingState />;

  return (
    <div className="p-4 md:p-8">
      {/* Print: show only the cards, two per row, never splitting a card across pages. */}
      <style>{`
        @media print {
          aside, nav, header, .no-print { display: none !important; }
          body, main { background: #fff !important; }
          .qr-grid { gap: 8mm !important; }
          .qr-card { break-inside: avoid; border: 1px solid #000 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/dashboard/restaurant" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Restaurant</Link>
          <h1 className="section-title mt-2">Table QR codes</h1>
          <p className="section-sub">Print these and place one on each table. Guests scan to see the menu and order.</p>
        </div>
        <Button onClick={() => window.print()} disabled={cards.length === 0}><Printer className="w-4 h-4" /> Print all</Button>
      </div>

      {cards.length === 0 ? (
        <p className="no-print text-ink-muted">You have no tables yet. Add tables on the Restaurant screen first.</p>
      ) : (
        <div className="qr-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c) => (
            <div key={c.id} className="qr-card rounded-2xl border border-stone-200 bg-white p-6 text-center">
              {name && <div className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{name}</div>}
              <div className="text-3xl font-bold text-ink mt-1">Table {c.tableNumber}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt={`QR code for table ${c.tableNumber}`} className="mx-auto my-3 w-56 h-56" />
              <div className="text-base font-medium text-ink">Scan to see the menu and order</div>
              <div className="text-[10px] text-ink-muted mt-2 break-all">{c.url}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
