import { authMiddleware } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

export default authMiddleware({
  clockSkewInMs: 1000 * 60 * 5, // 5 minutes
  authorizedParties: [
    'capacitor://localhost',
    'http://localhost',
    'http://localhost:3000',
    'https://sa-kipd.vercel.app',
    'capacitor://com.kipd.android',
  ],
  publicRoutes: [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/book/(.*)',
    '/menu/(.*)',
    '/onboarding',
    // Stripe calls this without a Clerk session. The route verifies Stripe's signature itself.
    '/api/webhooks/stripe',
    // Guest-facing: the QR menu, ordering and hotel booking. These routes resolve the tenant from the
    // slug in the link, are rate limited, and expose nothing except the public menu / room types.
    '/api/public/(.*)',
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
