import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as peopleApi from '../api.js';
import type { CreateUserInput } from '../api.js';

export function membersQueryKey(projectId: string) {
  return ['members', projectId] as const;
}

export function usersQueryKey(projectId: string) {
  return ['users', projectId] as const;
}

function showError(showBanner: (err: Error) => void, err: unknown): void {
  if (err instanceof ApiError || err instanceof Error) showBanner(err);
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: membersQueryKey(projectId),
    queryFn: () => peopleApi.listMembers(projectId),
    enabled: Boolean(projectId),
  });
}

export function useUsers(projectId: string) {
  return useQuery({
    queryKey: usersQueryKey(projectId),
    queryFn: () => peopleApi.listUsers(projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateUser(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: CreateUserInput) => peopleApi.createUser(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['resources', projectId] }),
      ]);
    },
    onError: (err) => showError(showBanner, err),
  });
}

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: { userId: string; roleId: string }) => peopleApi.addMember(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
    },
    onError: (err) => showError(showBanner, err),
  });
}

export function useUpdateMemberRole(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: { userId: string; roleId: string }) =>
      peopleApi.updateMemberRole(projectId, input.userId, input.roleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
    },
    onError: (err) => showError(showBanner, err),
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (userId: string) => peopleApi.removeMember(projectId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
    },
    onError: (err) => showError(showBanner, err),
  });
}

export function useNotifyMemberTasks(projectId: string) {
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: { userId: string; note?: string }) =>
      peopleApi.notifyMemberTasks(projectId, input.userId, input.note),
    onError: (err) => showError(showBanner, err),
  });
}

export function useNotifyTaskAssignees() {
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: { taskId: string; note?: string }) =>
      peopleApi.notifyTaskAssignees(input.taskId, input.note),
    onError: (err) => showError(showBanner, err),
  });
}
