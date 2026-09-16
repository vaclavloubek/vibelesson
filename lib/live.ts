import { z } from 'zod';
import { LessonBlockSchema } from '@/lib/schema';

export const SessionStatusSchema = z.enum(['lobby', 'live', 'ended']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('next') }),
  z.object({ action: z.literal('previous') }),
  z.object({ action: z.literal('end') }),
]);
export type SessionAction = z.infer<typeof SessionActionSchema>;

export const PublicLessonBlockSchema = LessonBlockSchema.omit({
  teacherNote: true,
  correctAnswer: true,
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

export function participantCookieName(sessionId: string) {
  return `ep_participant_${sessionId.replaceAll('-', '')}`;
}
