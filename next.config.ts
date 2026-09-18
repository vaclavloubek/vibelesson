import type { NextConfig } from 'next';

const isPreview = process.env.VERCEL_ENV === 'preview';

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  'https://challenges.cloudflare.com',
  'https://www.googletagmanager.com',
  ...(isPreview ? ['https://vercel.live'] : []),
];

const styleSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isPreview ? ['https://vercel.live'] : []),
];

const imageSources = [
  "'self'",
  'data:',
  'blob:',
  ...(isPreview ? ['https://vercel.live', 'https://vercel.com'] : []),
];

const fontSources = [
  "'self'",
  'data:',
  ...(isPreview ? ['https://assets.vercel.com'] : []),
];

const connectSources = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://challenges.cloudflare.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  ...(isPreview ? ['https://vercel.live', 'wss://ws-us3.pusher.com'] : []),
];

const frameSources = [
  "'self'",
  'https://challenges.cloudflare.com',
  ...(isPreview ? ['https://vercel.live'] : []),
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(' ')}`,
  "script-src-attr 'none'",
  `style-src ${styleSources.join(' ')}`,
  `img-src ${imageSources.join(' ')}`,
  `font-src ${fontSources.join(' ')}`,
  `connect-src ${connectSources.join(' ')}`,
  `frame-src ${frameSources.join(' ')}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
