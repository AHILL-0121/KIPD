'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { AlertCircle, Crown, Users } from 'lucide-react';

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for Clerk to finish loading
    if (!isLoaded) return;

    // If no user after loading, redirect to sign-in
    if (!user) {
      router.push('/sign-in');
      return;
    }

    const metadata = user.publicMetadata as { platform_admin?: boolean; tenant_id?: string };
    
    console.log('🔍 Onboarding - User metadata:', metadata);
    console.log('🔍 platform_admin:', metadata?.platform_admin, 'type:', typeof metadata?.platform_admin);
    console.log('🔍 tenant_id:', metadata?.tenant_id);
    
    // If user has platform_admin or tenant_id, redirect them
    if (metadata?.platform_admin === true) {
      console.log('✅ Redirecting to /admin/tenants');
      router.push('/admin/tenants');
    } else if (metadata?.tenant_id) {
      console.log('✅ Redirecting to /dashboard');
      router.push('/dashboard');
    } else {
      // User has no permissions, show onboarding
      console.log('ℹ️ No permissions, showing onboarding');
      setLoading(false);
    }
  }, [user, isLoaded, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="animate-pulse text-ink-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full p-8 text-center">
        <KipdIllustration scene="empty" size="lg" className="mx-auto mb-6" />
        
        <h1 className="text-3xl font-display font-bold text-ink mb-4">
          Welcome to Kipd! 👋
        </h1>
        
        <p className="text-lg text-ink-muted mb-8">
          Your account is ready, but you need to be set up by an administrator.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="p-6 border-2 border-stone-200">
            <Crown className="h-8 w-8 text-amber mx-auto mb-3" />
            <h3 className="font-semibold text-ink mb-2">Platform Admin</h3>
            <p className="text-sm text-ink-muted">
              If you're setting up Kipd for the first time, you need platform admin access.
            </p>
          </Card>

          <Card className="p-6 border-2 border-stone-200">
            <Users className="h-8 w-8 text-sage mx-auto mb-3" />
            <h3 className="font-semibold text-ink mb-2">Staff Member</h3>
            <p className="text-sm text-ink-muted">
              If you're joining an existing hotel/restaurant, ask your manager to invite you.
            </p>
          </Card>
        </div>

        <Card className="p-4 bg-amber-pale border border-amber-light mb-6">
          <div className="flex items-start gap-3 text-left">
            <AlertCircle className="h-5 w-5 text-amber-deep mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-ink mb-1">Setting up as Platform Admin?</p>
              <ol className="text-ink-muted space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://dashboard.clerk.com" target="_blank" rel="noopener" className="text-amber-deep hover:underline">Clerk Dashboard</a></li>
                <li>Select your Kipd app → <strong>Users</strong></li>
                <li>Click your user (email: <strong>{user?.primaryEmailAddress?.emailAddress}</strong>)</li>
                <li>Add to <strong>Public metadata</strong>: <code className="bg-white px-2 py-0.5 rounded">{"{"}"platform_admin": true{"}"}</code></li>
                <li>Save and refresh this page</li>
              </ol>
            </div>
          </div>
        </Card>

        <div className="flex gap-3 justify-center">
          <Button 
            variant="primary" 
            onClick={() => window.location.reload()}
          >
            I've Updated My Permissions
          </Button>
          
          <Button 
            variant="ghost" 
            asChild
          >
            <a href="https://dashboard.clerk.com" target="_blank" rel="noopener">
              Open Clerk Dashboard
            </a>
          </Button>
        </div>

        <p className="text-xs text-ink-muted mt-6">
          User ID: <code className="bg-stone-100 px-2 py-0.5 rounded">{user?.id}</code>
        </p>
      </Card>
    </div>
  );
}
