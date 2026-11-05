import Link from 'next/link';
import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { FrontDeskDemo } from '@/components/landing/FrontDeskDemo';
import { TableOrderDemo } from '@/components/landing/TableOrderDemo';

const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-amber px-6 py-3 text-base font-medium text-white transition-colors hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';
const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-stone-300 px-6 py-3 text-base font-medium text-ink-soft transition-colors hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? 'font-medium text-ink' : 'text-ink-soft'}`}>
      <span>{k}</span><span className="tabular-nums">{v}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-ink">
            <img src="/kipd-app-icon.svg" alt="" className="h-7 w-7" />
            Kipd
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#front-desk" className="hover:text-ink">Front desk</a>
            <a href="#restaurant" className="hover:text-ink">Restaurant</a>
            <a href="#billing" className="hover:text-ink">Billing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">Sign in</Link>
            <Link href="/sign-up" className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-white hover:bg-amber-deep">Request access</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 md:pt-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-amber">For hotels with a restaurant</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink md:text-5xl">
              One desk for the room and the table.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
              Take the booking, seat the guest, send the order to the kitchen and close two separate bills, without anyone
              retyping anything. Rooms and restaurant, kept in step.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className={btnPrimary}>Request access</Link>
              <a href="#front-desk" className={btnGhost}>Try it below</a>
            </div>
            <p className="mt-5 text-sm text-ink-muted">Priced in ₹. Pays via UPI, cash, card, bank transfer or Razorpay link.</p>
          </div>
          <FrontDeskDemo />
        </section>

        {/* Front desk */}
        <section id="front-desk" className="border-t border-stone-200 bg-white scroll-mt-16">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-amber">Front desk</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">A booking request is one tap from a guest in the house.</h2>
              <p className="mt-4 text-ink-muted leading-relaxed">
                Requests arrive from your public booking page. Each one moves through the same four states, and the button
                always says the next thing to do.
              </p>
              <ol className="mt-8 flex flex-wrap items-center gap-2 text-sm" aria-label="Booking states">
                {['Pending', 'Confirmed', 'In house', 'Checked out'].map((s, i, a) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className="rounded-full border border-stone-300 bg-cream px-3 py-1 text-ink-soft">{s}</span>
                    {i < a.length - 1 && <span aria-hidden className="text-stone-400">→</span>}
                  </li>
                ))}
              </ol>
            </div>
            <ul className="space-y-6">
              {[
                ['No double bookings', 'The database itself refuses an overlapping stay in the same room, so two staff members can’t both win the same night.'],
                ['Ask for a deposit, get a link', 'Set a deposit percentage once. Each booking suggests the amount and can send a Razorpay payment link to the guest.'],
                ['Room status that matches reality', 'Check-in and check-out move the booking along as you go, so the grid is today’s truth, not last night’s spreadsheet.'],
              ].map(([t, d]) => (
                <li key={t} className="border-l-2 border-amber pl-4">
                  <h3 className="font-semibold text-ink">{t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Restaurant */}
        <section id="restaurant" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-widest text-amber">Restaurant</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">The guest scans. The kitchen sees it. Nobody walks a paper slip.</h2>
              <p className="mt-4 text-ink-muted leading-relaxed">
                Every table has a QR card. Guests order from their own phone, and the ticket appears on the kitchen display
                straight away. This is the real flow, so add a few dishes and send them.
              </p>
            </div>
            <div className="mt-10">
              <TableOrderDemo />
            </div>
            <dl className="mt-12 grid gap-x-10 gap-y-6 text-sm sm:grid-cols-3">
              {[
                ['Menu you can safely edit', 'Retire a dish that’s already been ordered and it’s hidden, not deleted, so past bills stay intact.'],
                ['Each person sees their screen', 'Waiters get Orders, the kitchen gets the display, front desk gets billing. Owners and managers see everything.'],
                ['Live without refreshing', 'New orders and status changes show up on every device while they’re open.'],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="font-semibold text-ink">{t}</dt>
                  <dd className="mt-1 leading-relaxed text-ink-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Billing */}
        <section id="billing" className="border-t border-stone-200 bg-white scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-widest text-amber">Billing</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Two bills, because they’re two businesses.</h2>
              <p className="mt-4 text-ink-muted leading-relaxed">
                A guest’s stay and a table’s dinner are settled separately, each with the payments that were really made.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <article className="rounded-xl border border-stone-200 bg-cream p-5">
                <header className="flex items-baseline justify-between border-b border-stone-200 pb-3">
                  <h3 className="font-semibold text-ink">Hotel · Room 204</h3>
                  <span className="rounded-full bg-amber-pale px-2.5 py-0.5 text-xs font-medium text-amber-deep">Part paid</span>
                </header>
                <div className="py-3">
                  <Row k="Room · 2 nights × ₹4,200" v="₹8,400" />
                  <Row k="Extra bed" v="₹600" />
                  <Row k="Total" v="₹9,000" strong />
                </div>
                <div className="border-t border-dashed border-stone-300 py-3">
                  <Row k="Deposit · UPI (payment link)" v="− ₹2,700" />
                  <Row k="Part payment · cash" v="− ₹3,000" />
                  <Row k="Balance due at check-out" v="₹3,300" strong />
                </div>
              </article>
              <article className="rounded-xl border border-stone-200 bg-cream p-5">
                <header className="flex items-baseline justify-between border-b border-stone-200 pb-3">
                  <h3 className="font-semibold text-ink">Restaurant · Table 4</h3>
                  <span className="rounded-full bg-sage-pale px-2.5 py-0.5 text-xs font-medium text-sage">Paid</span>
                </header>
                <div className="py-3">
                  <Row k="2 × Masala dosa" v="₹240" />
                  <Row k="2 × Filter coffee" v="₹120" />
                  <Row k="Total" v="₹360" strong />
                </div>
                <div className="border-t border-dashed border-stone-300 py-3">
                  <Row k="Settled · UPI" v="₹360" />
                  <Row k="Balance" v="₹0" strong />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-20 md:flex-row md:justify-between">
          <div className="max-w-xl text-center md:text-left">
            <h2 className="text-3xl font-semibold tracking-tight text-ink">See your own rooms and menu in it.</h2>
            <p className="mt-3 text-ink-muted leading-relaxed">
              Request access and we’ll get your property set up.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link href="/sign-up" className={btnPrimary}>Request access</Link>
              <Link href="/sign-in" className={btnGhost}>Sign in</Link>
            </div>
          </div>
          <KipdIllustration scene="booking-confirmed" size="md" />
        </section>
      </main>

      <footer className="border-t border-stone-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Kipd</span>
          <span>© 2026 Kipd. Made for hotels and the restaurants inside them.</span>
        </div>
      </footer>
    </div>
  );
}
