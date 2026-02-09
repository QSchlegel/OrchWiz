const path = require('path')

// App lives in node/; ensure module resolution uses this directory so node_modules is found
const appRoot = path.resolve(__dirname)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  turbopack: {
    root: appRoot,
    // Force resolution from app directory when parent repo has its own lockfile
    resolveAlias: {
      tailwindcss: path.join(appRoot, 'node_modules', 'tailwindcss'),
      '@tailwindcss/postcss': path.join(appRoot, 'node_modules', '@tailwindcss/postcss'),
    },
  },
}

module.exports = nextConfig
