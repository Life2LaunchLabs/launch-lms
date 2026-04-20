const { withSentryConfig } = require("@sentry/nextjs");

const devPublicHost = process.env.LAUNCHLMS_DEV_PUBLIC_HOST
const devPublicHostWildcard = devPublicHost ? `*.${devPublicHost}` : null

/** @type {import('common.next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const rewrites = [
      {
        source: '/umami/script.js',
        destination: `https://eu.umami.is/script.js`,
      },
      {
        source: '/umami/api/send',
        destination: `https://eu.umami.is/api/send`,
      },
    ]

    return rewrites
  },
  async headers() {
    return [
      {
        source: '/embed/:orgslug/course/:courseuuid/activity/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors *',
          },
        ],
      },
    ]
  },
  reactStrictMode: false,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1.sslip.io',
    '*.sslip.io',
    ...(devPublicHost ? [devPublicHost] : []),
    ...(devPublicHostWildcard ? [devPublicHostWildcard] : []),
  ],
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', 'framer-motion', 'lucide-react', '@emoji-mart/react', '@emoji-mart/data', 'dayjs', 'highlight.js', 'recharts', '@radix-ui/react-icons', '@hello-pangea/dnd', 'react-i18next'],
  },
  // Ensure consistent build IDs across multiple pods in Kubernetes
  generateBuildId: async () => {
    return process.env.BUILD_ID || 'launch-lms-production'
  },
}

// Generate runtime config for development
if (process.env.NODE_ENV === 'development') {
  const fs = require('fs')
  const path = require('path')
  const runtimeConfig = {}

  Object.keys(process.env).forEach((key) => {
    if (key.startsWith('NEXT_PUBLIC_')) {
      runtimeConfig[key] = process.env[key]
    }
  })

  const publicDir = path.join(__dirname, 'public')
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

  fs.writeFileSync(
    path.join(publicDir, 'runtime-config.js'),
    `window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`,
    'utf8'
  )
}

// Always wrap with Sentry — DSN is resolved at runtime, not build time
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
  sourcemaps: {
    disable: !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
