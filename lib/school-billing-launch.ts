export function isPublicSchoolBillingEnabled() {
  return process.env.STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED === 'true';
}
