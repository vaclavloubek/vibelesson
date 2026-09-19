export type IndividualPlanCode = 'teacher' | 'teacher_pro';
export type BillingPeriod = 'monthly' | 'annual';

export type SubscriptionChangeKind = 'none' | 'immediate_upgrade' | 'scheduled';

export function classifySubscriptionChange(
  currentPlan: IndividualPlanCode,
  currentPeriod: BillingPeriod,
  targetPlan: IndividualPlanCode,
  targetPeriod: BillingPeriod,
): SubscriptionChangeKind {
  if (currentPlan === targetPlan && currentPeriod === targetPeriod) return 'none';

  if (
    currentPeriod === targetPeriod
    && currentPlan === 'teacher'
    && targetPlan === 'teacher_pro'
  ) {
    return 'immediate_upgrade';
  }

  return 'scheduled';
}

export function stripePlanMetadata(plan: IndividualPlanCode) {
  return plan === 'teacher_pro' ? 'teacher_pro' : 'teacher';
}

export function publicPlanId(plan: IndividualPlanCode) {
  return plan === 'teacher_pro' ? 'teacher-pro' : 'teacher';
}
