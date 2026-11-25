import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Kipd',
  description: 'Terms of service for using Kipd hospitality management platform.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="text-lg font-bold tracking-tight text-ink">Kipd</Link>
          <div className="flex items-center gap-4 text-sm text-ink-soft">
            <Link href="/privacy" className="hover:text-ink">Privacy Policy</Link>
            <Link href="/sign-in" className="font-medium text-amber-deep hover:underline">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 space-y-6 text-sm leading-relaxed text-ink-soft">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Terms of Service</h1>
          <p className="mt-2 text-xs text-ink-muted">Last updated: November 2026</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">1. Service Description</h2>
          <p>
            Kipd provides cloud-based property management, restaurant POS, kitchen display, and invoicing tools for
            hospitality properties. Bookings and food orders submitted through public links are agreements directly between the guest and the property.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">2. Property Responsibilities</h2>
          <p>
            Subscribing businesses are responsible for the accuracy of their room rates, menu pricing, GST/tax settings,
            staff access roles, and compliance with applicable local hospitality and tax laws.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">3. Payments &amp; Refunds</h2>
          <p>
            Online payments settle directly to the property&apos;s own Razorpay merchant account. Cancellations, deposits,
            and refunds are governed by each property&apos;s cancellation policy and recorded via the platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">4. Acceptable Use &amp; Availability</h2>
          <p>
            Accounts must not be used to transmit malicious payloads, attempt cross-tenant access, or abuse public APIs.
            We strive for continuous availability and perform regular database backups and health monitoring.
          </p>
        </section>
      </main>
    </div>
  );
}
