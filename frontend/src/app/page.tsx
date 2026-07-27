'use client';

import Link from 'next/link';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { Button } from '@/components/ui/button';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Hotel, Coffee, QrCode, BarChart3, Zap, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif text-2xl font-bold text-ink flex items-center gap-2">
            Kipd
            <motion.span
              className="w-2 h-2 rounded-full bg-amber"
              animate={{ scale: [1, 1.4, 1], backgroundColor: ['#E8A020', '#C8573A', '#E8A020'] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </Link>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/sign-up">Request Access</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <div className="grain-overlay" />
        
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="section-label mb-4">
              <span>Modern Hospitality Platform</span>
            </div>
            
            <h1 className="font-serif text-5xl md:text-6xl font-bold text-ink mb-6 leading-tight">
              Run your <em className="italic text-terra relative">hotel</em> with ease
            </h1>
            
            <p className="text-lg text-ink-muted mb-8 leading-relaxed">
              All-in-one SaaS for boutique hotels: rooms, bookings, restaurant, QR ordering, 
              kitchen display, and unified billing — all in real-time.
            </p>
            
            <div className="flex gap-4">
              <Button variant="primary" size="lg" asChild>
                <Link href="/sign-up">Request Access</Link>
              </Button>
              <Button variant="ghost" size="lg" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex justify-center"
          >
            <KipdMascot size="xl" />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="section-label justify-center mb-4">
              <span>Features</span>
            </div>
            <h2 className="section-title">Everything you need</h2>
            <p className="section-sub mx-auto">
              Powerful tools designed for modern hospitality
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardIcon variant="amber">
                <Hotel className="w-5 h-5" />
              </CardIcon>
              <CardTitle>Room Management</CardTitle>
              <CardDescription>
                Full inventory control, booking engine, and real-time availability tracking.
              </CardDescription>
            </Card>
            
            <Card>
              <CardIcon variant="terra">
                <Coffee className="w-5 h-5" />
              </CardIcon>
              <CardTitle>Restaurant & F&B</CardTitle>
              <CardDescription>
                Menu management, table ordering, and kitchen display system in one place.
              </CardDescription>
            </Card>
            
            <Card>
              <CardIcon variant="sage">
                <QrCode className="w-5 h-5" />
              </CardIcon>
              <CardTitle>QR Ordering</CardTitle>
              <CardDescription>
                Contactless menu access and ordering for tables and room service.
              </CardDescription>
            </Card>
            
            <Card>
              <CardIcon variant="amber">
                <Zap className="w-5 h-5" />
              </CardIcon>
              <CardTitle>Real-time Updates</CardTitle>
              <CardDescription>
                Live dashboard, KDS, and order tracking with zero page refreshes.
              </CardDescription>
            </Card>
            
            <Card>
              <CardIcon variant="terra">
                <BarChart3 className="w-5 h-5" />
              </CardIcon>
              <CardTitle>Analytics & Reports</CardTitle>
              <CardDescription>
                Track occupancy, revenue, popular items, and guest patterns.
              </CardDescription>
            </Card>
            
            <Card>
              <CardIcon variant="sage">
                <Shield className="w-5 h-5" />
              </CardIcon>
              <CardTitle>Secure & Isolated</CardTitle>
              <CardDescription>
                Multi-tenant architecture with complete data isolation per hotel.
              </CardDescription>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-amber-pale to-cream">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-4xl font-bold text-ink mb-6">
            Ready to modernize your hotel?
          </h2>
          <p className="text-lg text-ink-muted mb-8">
            Join leading boutique hotels already using Kipd
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="terra" size="lg" asChild>
              <Link href="/sign-in">Get Started</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link href="/#features">Learn More</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-ink text-white/70 py-12">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="font-serif text-xl font-bold text-white">Kipd</div>
          <p className="text-sm">© 2026 Kipd. Built for hospitality.</p>
        </div>
      </footer>
    </div>
  );
}
