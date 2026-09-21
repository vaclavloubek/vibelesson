export const CURRENT_TERMS_REQUIRED_HEADER = 'x-syllonaut-require-current-terms';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ORGANIZATION_BILLING_EXEMPT_PREFIXES = [
  '/api/organizations/cancellation',
  '/api/organizations/subscription',
  '/api/organizations/payment',
  '/api/organizations/quote',
  '/api/organizations/invoices/',
];

export function requestRequiresCurrentTerms(pathname: string, method: string) {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;

  if (
    pathname === '/api/generate'
    || pathname === '/api/billing/stripe/subscription/change'
    || pathname === '/api/revise'
    || pathname === '/api/revise-block'
    || pathname.startsWith('/api/folders')
    || pathname.startsWith('/api/lessons')
    || pathname.startsWith('/api/lesson-shares/')
    || pathname.startsWith('/api/sessions')
  ) {
    return true;
  }

  if (pathname === '/api/organizations' || pathname.startsWith('/api/organizations/')) {
    return !ORGANIZATION_BILLING_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  }

  return false;
}

export function normalizeTermsReturnTo(value: string | null | undefined) {
  const fallback = '/lessons';
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;

  const pathname = value.split('?', 1)[0] ?? '';
  const allowed = (
    pathname === '/new'
    || pathname === '/lessons'
    || pathname.startsWith('/lessons/')
    || pathname === '/school'
    || pathname.startsWith('/school/')
    || pathname.startsWith('/sessions/')
    || pathname.startsWith('/s/')
  );

  return allowed ? value : fallback;
}

export function termsReconsentPath(returnTo: string) {
  return `/terms/accept?returnTo=${encodeURIComponent(normalizeTermsReturnTo(returnTo))}`;
}
