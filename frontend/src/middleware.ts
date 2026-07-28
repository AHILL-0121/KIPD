import { authMiddleware } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

const edgeAuthCache = new Map<string, { isAdmin: boolean, expiresAt: number }>();

export default authMiddleware({
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

      // Redirect platform admins to admin panel
      try {
        // Check cache first
        const cached = edgeAuthCache.get(auth.userId);
        if (cached && cached.expiresAt > Date.now()) {
          if (cached.isAdmin) {
            console.log(`[${timestamp}] 🔒 Middleware - Redirecting platform admin to admin panel [CACHED]`);
            return NextResponse.redirect(new URL('/admin/tenants', req.url));
          }
        } else {
          // Cache miss - Fetch from clerk
          const clerkSecretKey = process.env.CLERK_SECRET_KEY;
          if (!clerkSecretKey) {
            throw new Error('CLERK_SECRET_KEY is not defined');
          }

          const { createClerkClient } = await import('@clerk/nextjs/server');
          const clerk = createClerkClient({ secretKey: clerkSecretKey });
          const user = await clerk.users.getUser(auth.userId);

          const isAdmin = user.publicMetadata?.platform_admin === true;
          edgeAuthCache.set(auth.userId, { isAdmin, expiresAt: Date.now() + 60000 });

          if (isAdmin) {
            console.log(`[${timestamp}] 🔒 Middleware - Redirecting platform admin to admin panel`);
            return NextResponse.redirect(new URL('/admin/tenants', req.url));
          }
        }
      } catch (error) {
        console.error(`[${timestamp}] 🔒 Middleware - Error checking admin status:`, error);
        // Continue to dashboard if check fails
      }

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
