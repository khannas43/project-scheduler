import { PROJECT_CATEGORIES, PROJECT_TEMPLATES } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { portfolioDashboardQueryKey } from '../../dashboard/hooks/useDashboard.js';
import { projectQueryKey } from '../../tasks/hooks/useTaskEdit.js';
import { tasksQueryKey } from '../../tasks/hooks/useTaskTree.js';
import * as projectsApi from '../api.js';
import type {
  CreateProjectFromSpreadsheetInput,
  CreateProjectFromTemplateInput,
  CreateProjectInput,
  ProjectTemplateCatalog,
} from '../api.js';

export const projectsQueryKey = ['projects'] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: projectsApi.listProjects,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: CreateProjectInput) => projectsApi.createProject(input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });
}

/** Catalog is shipped in @pkg/schema — no network needed to pick a template. */
export function templateCatalog(): ProjectTemplateCatalog {
  return {
    categories: PROJECT_CATEGORIES,
    templates: PROJECT_TEMPLATES.map((t) => ({ ...t, taskCount: 0 })),
  };
}

export function useProjectTemplates() {
  return {
    data: templateCatalog(),
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useCreateProjectFromTemplate() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: CreateProjectFromTemplateInput) => projectsApi.createProjectFromTemplate(input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });
}

export function useCreateProjectFromSpreadsheet() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: CreateProjectFromSpreadsheetInput) =>
      projectsApi.createProjectFromSpreadsheet(input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });
}

async function invalidateProjectLists(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
    queryClient.invalidateQueries({ queryKey: portfolioDashboardQueryKey() }),
  ]);
}

export function useSetProjectArchived() {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { projectId: string; version: number; isArchived: boolean }) =>
      projectsApi.updateProject(input.projectId, {
        version: input.version,
        isArchived: input.isArchived,
      }),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async (project) => {
      queryClient.setQueryData(projectQueryKey(project.id), project);
      await invalidateProjectLists(queryClient);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (projectId: string) => projectsApi.deleteProject(projectId),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async (_void, projectId) => {
      queryClient.removeQueries({ queryKey: projectQueryKey(projectId) });
      await invalidateProjectLists(queryClient);
    },
  });
}

export function useImportSpreadsheetIntoProject(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: projectsApi.ImportSpreadsheetIntoProjectInput) =>
      projectsApi.importSpreadsheetIntoProject(projectId, input),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: projectQueryKey(projectId) }),
        queryClient.refetchQueries({ queryKey: tasksQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: portfolioDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ['resources', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'project', projectId] }),
      ]);
    },
  });
}

export function useDuplicateProject() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { projectId: string; name?: string }) =>
      projectsApi.duplicateProject(input.projectId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
      }),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async (project) => {
      await invalidateProjectLists(queryClient);
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });
}
