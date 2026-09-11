import type { NextConfig } from 'next';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '/world').replace(
  /\/$/,
  '',
);

const authUrl = process.env.AUTH_URL;
const allowedDevOrigins = authUrl ? [new URL(authUrl).host] : [];

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL ??
      (basePath ? `https://forag3r.app${basePath}` : 'https://forag3r.app/world'),
  },
  images: {
    domains: [
      'static.usernames.app-backend.toolsforhumanity.com',
      'static.alchemyapi.io',
      'assets.smold.app',
      'raw.githubusercontent.com',
      'assets.coingecko.com',
    ],
  },
  allowedDevOrigins,
  reactStrictMode: false,
  // Next 15.5: boolean false hides the N / settings-gear badge entirely.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators
  devIndicators: false,
  // Next 15.5 ships webpack 5 (compiled 5.98.0). Keep the hook current — no
  // webpack 4 plugins, no stale svg/file-loader rules.
  webpack: (config) => config,
  async headers() {
    // Intentionally conservative: no CSP / X-Frame-Options / frame-ancestors so
    // the World App webview and MiniKit are not broken. These headers are safe
    // hardening that does not affect embedding.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            value: 'browsing-topics=(), interest-cohort=()',
          },
          { key: 'x-vercel-skip-toolbar', value: '1' },
        ],
      },
    ];
  },
};

export default nextConfig;
