import { authMiddleware } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

const edgeAuthCache = new Map<string, { isAdmin: boolean, expiresAt: number }>();

export default authMiddleware({
  authorizedParties: [
    'capacitor://localhost',
    'http://localhost',
    'https://sa-kipd.vercel.app',
    'capacitor://com.kipd.android'
  ],
  publicRoutes: [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/book/(.*)',
    '/menu/(.*)',
    '/onboarding',
  ],

  async afterAuth(auth, req) {
    // If not authenticated and not on public route, redirect to sign-in
    if (!auth.userId && !auth.isPublicRoute) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Allow access to onboarding page for authenticated users
    if (req.nextUrl.pathname === '/onboarding') {
      return NextResponse.next();
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔒 Middleware - Path:`, req.nextUrl.pathname);
    console.log(`[${timestamp}] 🔒 Middleware - User authenticated:`, !!auth.userId);

    // NOTE: Session claims don't include public_metadata by default in Clerk.
    // Authorization checks are done in API routes via requirePlatformAdmin() 
    // which fetches user data directly from Clerk API.

    // Simply ensure user is authenticated for protected routes
    if (req.nextUrl.pathname.startsWith('/admin')) {
      if (!auth.userId) {
        console.log(`[${timestamp}] 🔒 Middleware - Redirecting to sign-in (no auth)`);
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }
      console.log(`[${timestamp}] 🔒 Middleware - Allowing /admin access (authorization checked in API routes)`);
    }

    if (req.nextUrl.pathname.startsWith('/dashboard')) {
      if (!auth.userId) {
        console.log(`[${timestamp}] 🔒 Middleware - Redirecting to sign-in (no auth)`);
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }

      // Note: We deliberately removed the synchronous Platform Admin redirection check from the middleware
      // because making a network request to Clerk's API here causes massive 3-5 second latency spikes 
      // on every single dashboard page transition natively in Vercel Edge Serverless functions.

      console.log(`[${timestamp}] 🔒 Middleware - Allowing /dashboard access`);
    }

    return NextResponse.next();
  },
});

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)"
  ],
};
