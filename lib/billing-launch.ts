export function isPublicLiveBillingEnabled() {
  return process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED !== 'false';
}
