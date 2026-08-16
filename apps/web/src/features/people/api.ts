import { apiRequest } from '../../lib/apiClient.js';

export interface WorkspaceUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface ProjectMember {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly roleId: string;
  readonly roleName: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
  readonly isSystem: boolean;
}

export interface MembersPayload {
  readonly members: readonly ProjectMember[];
  readonly roles: readonly RoleOption[];
}

export interface CreateUserInput {
  readonly projectId: string;
  readonly email: string;
  readonly fullName: string;
  readonly password: string;
  readonly roleId?: string;
  readonly createResource?: boolean;
  readonly sendWelcomeEmail?: boolean;
}

export interface NotifyResult {
  readonly emailed: readonly { delivered: boolean; to: string }[];
  readonly smtpConfigured: boolean;
}

export function listUsers(projectId: string): Promise<WorkspaceUser[]> {
  const qs = new URLSearchParams({ projectId });
  return apiRequest<WorkspaceUser[]>(`/api/users?${qs}`);
}

export function createUser(input: CreateUserInput): Promise<WorkspaceUser> {
  return apiRequest<WorkspaceUser>('/api/users', { method: 'POST', body: input });
}

export function listMembers(projectId: string): Promise<MembersPayload> {
  return apiRequest<MembersPayload>(`/api/projects/${projectId}/members`);
}

export function addMember(
  projectId: string,
  input: { userId: string; roleId: string },
): Promise<ProjectMember> {
  return apiRequest<ProjectMember>(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: input,
  });
}

export function updateMemberRole(
  projectId: string,
  userId: string,
  roleId: string,
): Promise<ProjectMember> {
  return apiRequest<ProjectMember>(`/api/projects/${projectId}/members/${userId}`, {
    method: 'PATCH',
    body: { roleId },
  });
}

export function removeMember(projectId: string, userId: string): Promise<void> {
  return apiRequest<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
}

export function notifyMemberTasks(
  projectId: string,
  userId: string,
  note?: string,
): Promise<NotifyResult> {
  return apiRequest<NotifyResult>(`/api/projects/${projectId}/members/${userId}/notify-tasks`, {
    method: 'POST',
    body: note ? { note } : {},
  });
}

export function notifyTaskAssignees(taskId: string, note?: string): Promise<NotifyResult> {
  return apiRequest<NotifyResult>(`/api/tasks/${taskId}/notify`, {
    method: 'POST',
    body: note ? { note } : {},
  });
}
