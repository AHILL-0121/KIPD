'use client';

import { SignIn, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { kipd_clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const router = useRouter();

  // Redirect to admin or dashboard when authentication completes
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const isPlatformAdmin = user.publicMetadata?.platform_admin === true;
      
      if (isPlatformAdmin) {
        console.log('✅ Sign-in complete, redirecting to admin panel...');
        router.push('/admin/tenants');
      } else {
        console.log('✅ Sign-in complete, redirecting to dashboard...');
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
          <KipMascot />
          <div className="kipd-mascot-shadow" />
        </div>

        {/* Quote */}
        <blockquote className="kipd-quote">
          <blockquote>
            "The best hospitality is when guests feel{" "}
            <em>expected</em> — not just welcomed."
          </blockquote>
          <cite>— Kipd, Hotel &amp; Restaurant OS</cite>
        </blockquote>

        {/* Feature pills */}
        <div className="kipd-pills">
          {["Rooms & Bookings","Restaurant & KDS","Unified Billing","Live Dashboard"].map(f => (
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
            redirectUrl="/dashboard"
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

/* ── Inline Kip SVG mascot ─────────────────────────── */
function KipMascot() {
  return (
    <svg className="kipd-kip" width="210" height="235" viewBox="0 0 120 130"
         xmlns="http://www.w3.org/2000/svg" fill="none">
      <defs>
        <radialGradient id="kg1" cx="38%" cy="30%" r="65%">
          <stop offset="0%"   stopColor="#FFE08A"/>
          <stop offset="55%"  stopColor="#F5C96A"/>
          <stop offset="100%" stopColor="#E8A020"/>
        </radialGradient>
        <radialGradient id="kg2" cx="50%" cy="40%" r="60%">
          <stop offset="0%"   stopColor="#FFFAF0"/>
          <stop offset="100%" stopColor="#FDF3DC"/>
        </radialGradient>
        <linearGradient id="kg3" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#D96645"/>
          <stop offset="100%" stopColor="#B84830"/>
        </linearGradient>
      </defs>
      <ellipse cx="31" cy="42" rx="12" ry="18" fill="url(#kg1)" transform="rotate(-12 31 42)"/>
      <ellipse cx="31" cy="42" rx="7"  ry="11" fill="#FFE08A" opacity=".85" transform="rotate(-12 31 42)"/>
      <ellipse cx="89" cy="42" rx="12" ry="18" fill="url(#kg1)" transform="rotate(12 89 42)"/>
      <ellipse cx="89" cy="42" rx="7"  ry="11" fill="#FFE08A" opacity=".85" transform="rotate(12 89 42)"/>
      <ellipse cx="60" cy="80" rx="44" ry="46" fill="url(#kg1)"/>
      <ellipse cx="60" cy="90" rx="26" ry="24" fill="url(#kg2)"/>
      <ellipse cx="36" cy="82" rx="8"  ry="5"  fill="#E07A60" opacity=".22"/>
      <ellipse cx="84" cy="82" rx="8"  ry="5"  fill="#E07A60" opacity=".22"/>
      <circle cx="47" cy="72" r="8"  fill="#1A1410"/>
      <circle cx="50" cy="69" r="3"  fill="white" opacity=".92"/>
      <circle cx="73" cy="72" r="8"  fill="#1A1410"/>
      <circle cx="76" cy="69" r="3"  fill="white" opacity=".92"/>
      <ellipse cx="60" cy="82" rx="4.5" ry="3.5" fill="#C8573A"/>
      <path d="M 49 89 Q 60 98 71 89" stroke="#C8573A" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="48" cy="103" r="5" stroke="#C8573A" strokeWidth="2" opacity=".65"/>
      <rect x="51" y="101" width="14" height="4" rx="2" fill="#C8573A" opacity=".65"/>
      <rect x="58" y="105" width="3"  height="5" rx="1" fill="#C8573A" opacity=".65"/>
      <path d="M 38 54 Q 50 14 60 4 Q 70 14 82 54 Q 68 46 60 48 Q 52 46 38 54 Z" fill="url(#kg3)"/>
      <ellipse cx="60" cy="54" rx="22" ry="8" fill="#B84830" opacity=".5"/>
      <circle cx="60" cy="4" r="7" fill="#FDF3DC"/>
    </svg>
  );
}
