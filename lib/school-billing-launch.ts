export function isPublicSchoolBillingEnabled() {
  const value = process.env.STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED
    ?.trim()
    .toLowerCase();

  // Public school billing is launched by default. Keep an explicit
  // environment-level emergency kill switch for fast rollback.
  return value !== 'false';
}
