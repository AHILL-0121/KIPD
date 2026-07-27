'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { LoadingState } from '@/components/ui/loading-state';

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
    const router = useRouter();
    const { user, isLoaded, isSignedIn } = useUser();
    const { openSignIn, openSignUp } = useClerk();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inviteDetails, setInviteDetails] = useState<any>(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        // 1. Fetch invite details safely without requiring authentication first
        fetch(`/api/staff/invite/validate?token=${params.token}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setInviteDetails(data.staff);
            })
            .catch(err => {
                setError(err.message || 'Invalid or Expired Invitation Link.');
            })
            .finally(() => setLoading(false));
    }, [params.token]);

    const handleAccept = async () => {
        if (!isSignedIn) {
            // Force them to create a staff account or log in!
            openSignUp({ redirectUrl: `/accept-invite/${params.token}` });
            return;
        }

        setAccepting(true);
        try {
            const res = await fetch(`/api/staff/invite/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: params.token }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');

            // Success! Reroute them to the dashboard immediately.
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Something went wrong while accepting.');
            setAccepting(false);
        }
    };

    if (!isLoaded || loading) {
        return <LoadingState message="Validating your invitation..." />;
    }

    if (error) {
        return (
            <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
                <KipdIllustration scene="error" size="xl" />
                <h1 className="font-serif text-3xl font-bold text-ink mt-8">Invalid Invitation</h1>
                <p className="text-stone-500 mt-2">{error}</p>
                <Button onClick={() => router.push('/')} variant="ghost" className="mt-8">Return to Home</Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl max-w-lg w-full text-center border-4 border-amber-pale">
                <div className="bg-amber-pale w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-3xl">🎉</span>
                </div>

                <h1 className="font-serif text-3xl font-bold text-ink mb-2">You've been invited!</h1>
                <p className="text-stone-500 mb-8">
                    You have been formally invited to join the management platform as a <span className="font-bold text-amber">{inviteDetails?.role}</span>.
                </p>

                <div className="space-y-4">
                    <Button
                        className="w-full py-6 text-lg"
                        variant="terra"
                        onClick={handleAccept}
                        disabled={accepting}
                    >
                        {accepting ? 'Configuring your account...' : (isSignedIn ? 'Accept & Join Dashboard' : 'Create Account to Accept')}
                    </Button>

                    {!isSignedIn && (
                        <p className="text-sm text-stone-400 mt-4">
                            Already have an account? <button onClick={() => openSignIn({ redirectUrl: `/accept-invite/${params.token}` })} className="text-amber font-bold hover:underline">Sign In</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
