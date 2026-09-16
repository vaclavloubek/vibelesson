import { z } from 'zod';

export const BlockTypeSchema = z.enum([
  'intro', 'team_task', 'poll', 'quiz', 'open_text', 'ranking', 'reveal', 'timer', 'exit_ticket',
]);

export const GradingCriterionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  maxPoints: z.number().int().min(1).max(20),
});

export const LessonBlockSchema = z.object({
  id: z.string().min(1),
  type: BlockTypeSchema,
  title: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(60),
  instructions: z.string().min(1),
  options: z.array(z.string()).max(10).optional(),
  items: z.array(z.string()).max(12).optional(),
  correctAnswer: z.string().optional(),
  revealText: z.string().optional(),
  teacherNote: z.string().optional(),
  points: z.number().int().min(0).max(20).optional(),
  gradingRubric: z.array(GradingCriterionSchema).min(1).max(6).optional(),
}).superRefine((block, ctx) => {
  if (!block.gradingRubric?.length) return;

  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) {
    ctx.addIssue({
      code: 'custom',
      path: ['gradingRubric'],
      message: 'gradingRubric je podporovaná pouze pro open_text, exit_ticket a team_task.',
    });
  }

  if (!block.points || block.points < 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['points'],
      message: 'Blok s gradingRubric musí mít kladný počet bodů.',
    });
    return;
  }

  const rubricPoints = block.gradingRubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  if (rubricPoints !== block.points) {
    ctx.addIssue({
      code: 'custom',
      path: ['gradingRubric'],
      message: 'Součet maxPoints v gradingRubric musí odpovídat points bloku.',
    });
  }
});

export const LessonSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  audience: z.string().min(1),
  totalMinutes: z.number().int().min(10).max(360),
  groupSize: z.string().min(1),
  learningObjectives: z.array(z.string()).min(2).max(6),
  blocks: z.array(LessonBlockSchema).min(3).max(16),
});

export type Lesson = z.infer<typeof LessonSchema>;
export type LessonBlock = z.infer<typeof LessonBlockSchema>;
export type GradingCriterion = z.infer<typeof GradingCriterionSchema>;
