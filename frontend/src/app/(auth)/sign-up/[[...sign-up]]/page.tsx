'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { KipAuthMascot } from '@/components/mascot/KipAuthMascot';

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
                Access to Kipd is managed by invitation. Send us your details and we&apos;ll get you set up.
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
