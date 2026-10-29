/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['vercel-blob.com'],
  },
  // Type and lint errors fail the build. They used to be switched off, which is how
  // broken code (a column that does not exist, 22 undefined CSS classes) reached production.
}

module.exports = nextConfig
