export const AI_GRADING_ALLOWANCES = {
  teacher_pro: 60,
  school: 300,
  campus: 750,
} as const;

export type AiGradingPlanCode = keyof typeof AI_GRADING_ALLOWANCES;
