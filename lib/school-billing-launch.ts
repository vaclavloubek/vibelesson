export function isPublicSchoolBillingEnabled() {
  const emergencyDisabled = process.env.STRIPE_LIVE_SCHOOL_BILLING_EMERGENCY_DISABLED
    ?.trim()
    .toLowerCase();

  // Team / School / Campus self-service is publicly launched.
  // Keep one explicit environment-level emergency kill switch for rollback.
  return emergencyDisabled !== 'true';
}
