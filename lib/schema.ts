import { z } from 'zod';

export const BlockTypeSchema = z.enum([
  'intro', 'team_task', 'poll', 'quiz', 'open_text', 'ranking', 'reveal', 'timer', 'exit_ticket',
]);

export const GradingStrictnessSchema = z.enum(['lenient', 'neutral', 'strict']);

export const GradingCriterionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  maxPoints: z.number().int().min(1).max(20),
});

export const DataTableSchema = z.object({
  caption: z.string().min(1).max(200).optional(),
  columns: z.array(z.string().min(1).max(120)).min(2).max(8),
  rows: z.array(z.array(z.string().max(300)).min(2).max(8)).min(1).max(30),
}).superRefine((table, ctx) => {
  table.rows.forEach((row, index) => {
    if (row.length !== table.columns.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows', index],
        message: 'Každý řádek tabulky musí mít stejný počet buněk jako hlavička.',
      });
    }
  });
});

export const LessonBlockSchema = z.object({
  id: z.string().min(1),
  type: BlockTypeSchema,
  title: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(60),
  instructions: z.string().min(1),
  options: z.array(z.string()).max(10).optional(),
  items: z.array(z.string()).max(12).optional(),
  dataTable: DataTableSchema.optional(),
  correctAnswer: z.string().optional(),
  revealText: z.string().optional(),
  teacherNote: z.string().optional(),
  points: z.number().int().min(0).max(20).optional(),
  gradingRubric: z.array(GradingCriterionSchema).min(1).max(6).optional(),
});

export const LessonSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  audience: z.string().min(1),
  totalMinutes: z.number().int().min(10).max(360),
  groupSize: z.string().min(1),
  gradingStrictness: GradingStrictnessSchema.optional(),
  learningObjectives: z.array(z.string()).min(2).max(6),
  blocks: z.array(LessonBlockSchema).min(3).max(16),
});

export type Lesson = z.infer<typeof LessonSchema>;
export type LessonBlock = z.infer<typeof LessonBlockSchema>;
export type GradingCriterion = z.infer<typeof GradingCriterionSchema>;
export type GradingStrictness = z.infer<typeof GradingStrictnessSchema>;
export type LessonDataTable = z.infer<typeof DataTableSchema>;
