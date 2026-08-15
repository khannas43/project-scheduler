import { z } from 'zod';

export const UserCreateInputSchema = z.object({
  /** Project used only to authorize `user.manage`. */
  projectId: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  isActive: z.boolean().optional(),
  /** Also add the new user to this project. */
  roleId: z.uuid().optional(),
  createResource: z.boolean().optional(),
  sendWelcomeEmail: z.boolean().optional(),
});

export const UserUpdateInputSchema = z.object({
  projectId: z.uuid(),
  fullName: z.string().min(1).max(200).optional(),
  password: z.string().min(8).max(200).optional(),
  isActive: z.boolean().optional(),
});

export const ProjectMemberCreateInputSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

export const ProjectMemberUpdateInputSchema = z.object({
  roleId: z.uuid(),
});

export const TaskNotifyInputSchema = z.object({
  note: z.string().max(2000).optional(),
});

export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateInputSchema>;
export type ProjectMemberCreateInput = z.infer<typeof ProjectMemberCreateInputSchema>;
export type ProjectMemberUpdateInput = z.infer<typeof ProjectMemberUpdateInputSchema>;
export type TaskNotifyInput = z.infer<typeof TaskNotifyInputSchema>;
