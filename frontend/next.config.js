/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['vercel-blob.com'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
