'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';

export default function ContactAdminPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setStatus('success');
      setFormData({ name: '', email: '', company: '', message: '' });
    } catch (error) {
      setStatus('error');
      setErrorMessage('Failed to send message. Please try emailing testsmtp20251@gmail.com directly.');
    }
  };

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
          {["Rooms & Bookings","Restaurant & KDS","Unified Billing","Live Dashboard","Multi-property"].map(f => (
            <span key={f} className="kipd-pill">
              <span className="kipd-pill-dot" />{f}
            </span>
          ))}
        </div>
      </aside>

      {/* ── RIGHT PANEL — Contact Form ── */}
      <main className="kipd-right">
        {status === 'success' ? (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-sage mx-auto mb-4" />
            <h1 className="text-3xl font-display font-bold text-ink mb-3">Message Sent!</h1>
            <p className="text-ink-muted mb-6">
              Our platform administrator will review your request and get back to you soon.
            </p>
            <Button 
              variant="ghost" 
              onClick={() => setStatus('idle')}
            >
              Send Another Message
            </Button>
          </div>
        ) : (
          <>
            <div className="kipd-form-header">
              <p className="kipd-eyebrow">Get Access</p>
              <h1 className="kipd-title">Contact<br /><em>Platform Admin</em></h1>
              <p className="kipd-subtitle">
                Access to Kipd is managed by invitation. Send us your details and we'll get you set up.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-[380px] space-y-4">
              <Input
                label="Your Name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />

              <Input
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="john@hotel.com"
              />

              <Input
                label="Hotel/Restaurant Name"
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                placeholder="Grand Palace Hotel"
              />

              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2">
                  Message (Optional)
                </label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Tell us about your property and what you need..."
                  rows={4}
                  className="w-full"
                />
              </div>

              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}

              <Button 
                type="submit" 
                variant="primary" 
                className="w-full" 
                disabled={status === 'sending'}
              >
                {status === 'sending' ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </form>

            <div className="kipd-admin-note mt-6">
              <span>📧</span>
              <p>
                <strong>Already have an account?</strong>{' '}
                <a href="/sign-in" className="text-amber hover:underline">Sign in here</a>{' '}
                or email us directly at{' '}
                <a href="mailto:testsmtp20251@gmail.com" className="text-amber hover:underline">
                  testsmtp20251@gmail.com
                </a>
              </p>
            </div>
          </>
        )}
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
        <radialGradient id="sg1" cx="38%" cy="30%" r="65%">
          <stop offset="0%"   stopColor="#FFE08A"/>
          <stop offset="55%"  stopColor="#F5C96A"/>
          <stop offset="100%" stopColor="#E8A020"/>
        </radialGradient>
        <radialGradient id="sg2" cx="50%" cy="40%" r="60%">
          <stop offset="0%"   stopColor="#FFFAF0"/>
          <stop offset="100%" stopColor="#FDF3DC"/>
        </radialGradient>
        <linearGradient id="sg3" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#D96645"/>
          <stop offset="100%" stopColor="#B84830"/>
        </linearGradient>
      </defs>
      <ellipse cx="31" cy="42" rx="12" ry="18" fill="url(#sg1)" transform="rotate(-12 31 42)"/>
      <ellipse cx="31" cy="42" rx="7"  ry="11" fill="#FFE08A" opacity=".85" transform="rotate(-12 31 42)"/>
      <ellipse cx="89" cy="42" rx="12" ry="18" fill="url(#sg1)" transform="rotate(12 89 42)"/>
      <ellipse cx="89" cy="42" rx="7"  ry="11" fill="#FFE08A" opacity=".85" transform="rotate(12 89 42)"/>
      <ellipse cx="60" cy="80" rx="44" ry="46" fill="url(#sg1)"/>
      <ellipse cx="60" cy="90" rx="26" ry="24" fill="url(#sg2)"/>
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
      <path d="M 38 54 Q 50 14 60 4 Q 70 14 82 54 Q 68 46 60 48 Q 52 46 38 54 Z" fill="url(#sg3)"/>
      <ellipse cx="60" cy="54" rx="22" ry="8" fill="#B84830" opacity=".5"/>
      <circle cx="60" cy="4" r="7" fill="#FDF3DC"/>
    </svg>
  );
}
