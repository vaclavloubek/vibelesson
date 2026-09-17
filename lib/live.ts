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

export type PublicScoreboardState = {
  score: number;
  maxPoints: number;
  rank: number;
};

export const SessionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('next') }),
  z.object({ action: z.literal('previous') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('reveal_results') }),
  z.object({ action: z.literal('reveal_scoreboard') }),
  z.object({ action: z.literal('hide_scoreboard') }),
  z.object({ action: z.literal('timer_start') }),
  z.object({ action: z.literal('timer_pause') }),
  z.object({ action: z.literal('timer_reset') }),
]);
export type SessionAction = z.infer<typeof SessionActionSchema>;

export const PublicLessonBlockSchema = LessonBlockSchema.omit({
  teacherNote: true,
  correctAnswer: true,
  gradingRubric: true,
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
});

export const TeamCreateSchema = z.object({
  count: z.number().int().min(2).max(12),
});

export const StudentTeamChoiceSchema = z.object({
  teamId: z.string().uuid(),
});

export const TeamResponseSubmissionSchema = z.object({
  blockId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(4000),
});

export const TeamEditRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('claim'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('heartbeat'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('release'), blockId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('save'), blockId: z.string().min(1).max(200), text: z.string().trim().min(1).max(4000) }),
]);
export type TeamEditRequest = z.infer<typeof TeamEditRequestSchema>;

export function participantCookieName(sessionId: string) {
  return `ep_participant_${sessionId.replaceAll('-', '')}`;
}
