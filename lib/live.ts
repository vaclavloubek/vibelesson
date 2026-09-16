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

export function participantCookieName(sessionId: string) {
  return `ep_participant_${sessionId.replaceAll('-', '')}`;
}
