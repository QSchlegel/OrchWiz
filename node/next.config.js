const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure API routes are treated as dynamic to avoid build-time Prisma initialization
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    turbo: {
      root: path.join(__dirname),
    },
  },
}

module.exports = nextConfig
