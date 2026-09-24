const rawBaseUrl = process.argv[2];

if (!rawBaseUrl) {
  console.error('Usage: node scripts/verify-security-headers.mjs <base-url>');
  process.exit(2);
}

const baseUrl = new URL(rawBaseUrl);
const paths = ['/', '/join', '/auth/confirm'];

function requireExact(headers, name, expected) {
  const actual = headers.get(name);
  if (actual !== expected) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireCsp(headers) {
  const csp = headers.get('content-security-policy');
  if (!csp) throw new Error('Content-Security-Policy is missing');

  const requiredFragments = [
    "default-src 'self'",
    'https://challenges.cloudflare.com',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://syllonaut-live-control.vaclav-loubek.workers.dev',
    'wss://syllonaut-live-control.vaclav-loubek.workers.dev',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];

  for (const fragment of requiredFragments) {
    if (!csp.includes(fragment)) {
      throw new Error(`Content-Security-Policy is missing ${JSON.stringify(fragment)}`);
    }
  }
}

for (const path of paths) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, { redirect: 'manual' });

  if (response.status >= 500) {
    throw new Error(`${url}: unexpected HTTP ${response.status}`);
  }

  requireCsp(response.headers);
  requireExact(response.headers, 'strict-transport-security', 'max-age=63072000');
  requireExact(response.headers, 'x-content-type-options', 'nosniff');
  requireExact(response.headers, 'x-frame-options', 'DENY');
  requireExact(response.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
  requireExact(response.headers, 'permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  requireExact(response.headers, 'x-permitted-cross-domain-policies', 'none');

  if (response.headers.has('x-powered-by')) {
    throw new Error(`${url}: X-Powered-By must not be exposed`);
  }

  console.log(`${url} -> ${response.status}: security headers OK`);
}
