import { z } from 'zod';

export const BoardColumnCreateFieldsSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  wipLimit: z.number().int().positive().nullable().optional(),
});

export const BoardColumnCreateInputSchema = BoardColumnCreateFieldsSchema;

/** Body for POST /api/projects/:id/board-columns — projectId comes from the path. */
export const BoardColumnCreateBodySchema = BoardColumnCreateFieldsSchema.omit({ projectId: true });

export const BoardColumnUpdateInputSchema = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  wipLimit: z.number().int().positive().nullable().optional(),
});

/** Body for POST /api/tasks/:id/board-column. */
export const TaskBoardColumnInputSchema = z.object({
  boardColumnId: z.uuid().nullable(),
});

export type BoardColumnCreateInput = z.infer<typeof BoardColumnCreateInputSchema>;
export type BoardColumnCreateBody = z.infer<typeof BoardColumnCreateBodySchema>;
export type BoardColumnUpdateInput = z.infer<typeof BoardColumnUpdateInputSchema>;
export type TaskBoardColumnInput = z.infer<typeof TaskBoardColumnInputSchema>;
