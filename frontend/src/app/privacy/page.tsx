import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Kipd',
  description: 'How Kipd collects, protects, and manages hospitality and guest data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="text-lg font-bold tracking-tight text-ink">Kipd</Link>
          <div className="flex items-center gap-4 text-sm text-ink-soft">
            <Link href="/terms" className="hover:text-ink">Terms of Service</Link>
            <Link href="/sign-in" className="font-medium text-amber-deep hover:underline">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 space-y-6 text-sm leading-relaxed text-ink-soft">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Privacy Policy</h1>
          <p className="mt-2 text-xs text-ink-muted">Last updated: November 2026</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">1. Who We Are & Scope</h2>
          <p>
            Kipd provides hotel, restaurant, and billing software for independent hospitality businesses. Each property
            acts as the data fiduciary/controller for its own guests, reservations, and orders, with strict tenant isolation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">2. Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Guest booking &amp; dining details:</strong> Name, phone number, email address, check-in/out dates, and special requests provided when booking or ordering.</li>
            <li><strong>Staff account details:</strong> Name, email, role, and area permissions used for secure sign-in via Clerk.</li>
            <li><strong>Financial &amp; tax records:</strong> Invoices, receipts, credit notes, and refund records required for accounting and GST compliance.</li>
            <li><strong>Payment processing:</strong> Online payments are handled directly by the property&apos;s connected Razorpay account; Kipd never stores card numbers or banking credentials.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">3. Essential Cookies &amp; Storage</h2>
          <p>
            Kipd uses strictly necessary authentication and session cookies so staff remain signed in across the web app
            and Android Capacitor shell, plus local browser preferences (such as sidebar state). We do not use third-party advertising cookies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">4. Your Rights (DPDP Act / GDPR)</h2>
          <p>
            Guests may request access to, export of, or deletion/anonymization of their personal contact information from the
            property they visited. Property managers can export or anonymize a guest profile directly while retaining legally mandated tax invoices.
          </p>
        </section>
      </main>
    </div>
  );
}
