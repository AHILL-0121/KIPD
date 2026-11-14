import { authMiddleware } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

const isProduction = process.env.NODE_ENV === 'production';

// Origins allowed to present a session token. The Android app loads the deployed site, so in
// production only the site itself and the app's own scheme are listed. Local origins and a
// generous clock tolerance (for emulators whose clock drifts) exist only in development.
const authorizedParties = Array.from(new Set([
  'https://sa-kipd.vercel.app',
  ...(process.env.NEXT_PUBLIC_APP_URL ? [new URL(process.env.NEXT_PUBLIC_APP_URL).origin] : []),
  'capacitor://com.kipd.android',
  ...(isProduction ? [] : ['capacitor://localhost', 'http://localhost', 'http://localhost:3000']),
]));

export default authMiddleware({
  ...(isProduction ? {} : { clockSkewInMs: 1000 * 60 * 5 }),
  authorizedParties,
  publicRoutes: [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/book/(.*)',
    '/menu/(.*)',
    '/onboarding',
    // Razorpay calls this without a Clerk session. The route verifies Razorpay's signature itself.
    '/api/webhooks/razorpay',
    // Guest-facing: the QR menu, ordering and hotel booking. These routes resolve the tenant from the
    // slug in the link, are rate limited, and expose nothing except the public menu / room types.
    '/api/public/(.*)',
    // The "request access" form on the sign-up page. Rate limited in the route.
    '/api/contact-admin',
    // Uptime checks. Reveals only whether the app and its database answer.
    '/api/health',
  ],

  async afterAuth(auth, req) {
    const path = req.nextUrl.pathname;

    // Not signed in and not on a public route: send to sign-in (APIs get a 401 from their own guards).
    if (!auth.userId && !auth.isPublicRoute) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Signed-in users skip the marketing page and the auth pages.
    if (auth.userId && (path === '/' || path === '/sign-in' || path === '/sign-up')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // Role and tenant checks happen in the API routes and the dashboard layout. A Clerk
    // lookup here added several seconds to every page transition on the edge runtime.
    return NextResponse.next();
  },
});

export const config = {
  matcher: [
    '/((?!.+\\.[\\w]+$|_next).*)',
    '/',
    '/(api|trpc)(.*)',
  ],
};
