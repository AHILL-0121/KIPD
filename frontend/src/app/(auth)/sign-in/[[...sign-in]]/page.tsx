'use client';

import { SignIn, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { kipd_clerkAppearance } from "@/lib/clerk-appearance";
import { KipAuthMascot } from '@/components/mascot/KipAuthMascot';

export default function SignInPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  // Redirect to admin or dashboard when authentication completes
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const isPlatformAdmin = user.publicMetadata?.platform_admin === true;

      if (isPlatformAdmin) {
        router.push('/admin/tenants');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isLoaded, isSignedIn, user, router]);
  return (
    <div className="kipd-auth-root">

      {/* ── LEFT PANEL ── */}
      <aside className="kipd-left">
        <div className="kipd-left-glow" />
        <div className="kipd-left-grain" />

        {/* Logo */}
        <div className="kipd-logo">
          <span className="kipd-logo-dot" />
          <span className="kipd-logo-text">Kipd</span>
        </div>

        {/* Kip mascot */}
        <div className="kipd-mascot-wrap">
          <KipAuthMascot />
          <div className="kipd-mascot-shadow" />
        </div>

        {/* Quote */}
        <blockquote className="kipd-quote">
          <blockquote>
            &quot;The best hospitality is when guests feel{" "}
            <em>expected</em> — not just welcomed.&quot;
          </blockquote>
          <cite>— Kipd, Hotel &amp; Restaurant OS</cite>
        </blockquote>

        {/* Feature pills */}
        <div className="kipd-pills">
          {["Rooms & Bookings", "Restaurant & KDS", "Unified Billing", "Live Dashboard"].map(f => (
            <span key={f} className="kipd-pill">
              <span className="kipd-pill-dot" />{f}
            </span>
          ))}
        </div>
      </aside>

      {/* ── RIGHT PANEL — Clerk drops here ── */}
      <main className="kipd-right">
        <div className="kipd-form-header">
          <p className="kipd-eyebrow">Welcome back</p>
          <h1 className="kipd-title">Sign in to<br /><em>your workspace</em></h1>
          <p className="kipd-subtitle">Your team is waiting. Let&apos;s get you in.</p>
        </div>

        {/* Clerk SignIn — fully styled via appearance prop */}
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <SignIn
            appearance={kipd_clerkAppearance}
          />
        </div>

        {/* Admin note */}
        <div className="kipd-admin-note">
          <span>🔑</span>
          <p>
            <strong>No account?</strong> Access is managed by invitation.{' '}
            <a href="/sign-up" className="text-amber hover:underline">
              Request access here
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
