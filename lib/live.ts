import { z } from 'zod';
import { LessonBlockSchema } from '@/lib/schema';

export const SessionStatusSchema = z.enum(['lobby', 'live', 'ended']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TimerStatusSchema = z.enum(['idle', 'running', 'paused']);
export type TimerStatus = z.infer<typeof TimerStatusSchema>;

export type LiveTimerState = {
  status: TimerStatus;
  remainingSeconds: number;
  syncedAt: string;
};

export type RevealedChoiceResults = {
  type: 'poll' | 'quiz';
  counts: Array<{ option: string; count: number }>;
  total: number;
  correctAnswer?: string;
  myAnswer?: string | null;
  isCorrect?: boolean | null;
};

/**
 * A teacher-confirmed evaluation of the student's own (or own team's) answer.
 * `source: 'ai'` means the teacher confirmed the AI proposal unchanged, so the
 * AI summary is shown; otherwise the teacher's points are shown. Integrity
 * signals are never part of this payload.
 */
export type StudentEvaluation = {
  blockId: string;
  blockTitle: string;
  blockType: string;
  team: boolean;
  score: number;
  maxPoints: number;
  source: 'ai' | 'teacher';
  summary: string | null;
  teacherNote: string | null;
  outdated: boolean;
};

export type PublicScoreboardState = {
  score: number;
  maxPoints: number;
  rank: number;
};

export const SessionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('next'), expectedActiveBlockId: z.string().min(1).max(200).optional(), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('previous'), expectedActiveBlockId: z.string().min(1).max(200).optional(), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('end'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('reveal_results'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('reveal_scoreboard'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('hide_scoreboard'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('timer_start'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('timer_pause'), operationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('timer_reset'), operationId: z.string().uuid().optional() }),
]);
export type SessionAction = z.infer<typeof SessionActionSchema>;

export const PublicLessonBlockSchema = LessonBlockSchema.omit({
  teacherNote: true,
  correctAnswer: true,
  gradingRubric: true,
  modelAnswer: true,
});
export type PublicLessonBlock = z.infer<typeof PublicLessonBlockSchema>;

export const StudentAnswerSchema = z.union([
  z.object({ choice: z.string().min(1).max(1000) }).strict(),
  z.object({ text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({
    ranking: z.array(z.string().min(1).max(1000)).min(2).max(12),
    text: z.string().trim().min(1).max(2000),
  }).strict(),
]);
export type StudentAnswer = z.infer<typeof StudentAnswerSchema>;

export const TeamAnswerSchema = z.object({
  text: z.string().trim().min(1).max(4000),
}).strict();
export type TeamAnswer = z.infer<typeof TeamAnswerSchema>;

export const StudentResponseSubmissionSchema = z.object({
  blockId: z.string().min(1).max(200),
  answer: StudentAnswerSchema,
  responseAction: z.enum(['save', 'submit']).default('save'),
  operationId: z.string().uuid().optional(),
});

export const TeamCreateSchema = z.object({
  count: z.number().int().min(2).max(12),
});

export const StudentTeamChoiceSchema = z.object({
  teamId: z.string().uuid(),
  operationId: z.string().uuid().optional(),
});

export const TeamResponseSubmissionSchema = z.object({
  blockId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(4000),
});

const TeamEditTextActionSchema = z.object({
  blockId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(4000),
  operationId: z.string().uuid().optional(),
});

export const TeamEditRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('claim'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('heartbeat'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('release'), blockId: z.string().min(1).max(200) }),
  TeamEditTextActionSchema.extend({ action: z.literal('save') }),
  TeamEditTextActionSchema.extend({ action: z.literal('submit') }),
]);
export type TeamEditRequest = z.infer<typeof TeamEditRequestSchema>;

export function participantCookieName(sessionId: string) {
  return `ep_participant_${sessionId.replaceAll('-', '')}`;
}
