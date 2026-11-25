const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type and lint errors fail the build. They used to be switched off, which is how
  // broken code (a column that does not exist, 22 undefined CSS classes) reached production.
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  disableLogger: true,
  sourcemaps: {
    // Only upload source maps when a Sentry auth token is provided (e.g., Vercel / CI release builds).
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  // Route browser Sentry events through /monitoring to avoid ad-blocker drops.
  tunnelRoute: '/monitoring',
  automaticVercelMonitors: true,
});
