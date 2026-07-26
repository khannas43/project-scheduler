import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { projectQueryKey } from '../../tasks/hooks/useTaskEdit.js';
import * as projectsApi from '../api.js';
import type { UpdateProjectInput } from '../api.js';
import { projectsQueryKey } from './useProjects.js';

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: UpdateProjectInput) => projectsApi.updateProject(projectId, input),

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKey(projectId), project);
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
