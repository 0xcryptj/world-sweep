import type { NextConfig } from 'next';

const authUrl = process.env.AUTH_URL;
const allowedDevOrigins = authUrl ? [new URL(authUrl).host] : [];

const nextConfig: NextConfig = {
  images: {
    domains: [
      'static.usernames.app-backend.toolsforhumanity.com',
      'static.alchemyapi.io',
      'assets.smold.app',
      'raw.githubusercontent.com',
    ],
  },
  allowedDevOrigins,
  reactStrictMode: false,
};

export default nextConfig;
