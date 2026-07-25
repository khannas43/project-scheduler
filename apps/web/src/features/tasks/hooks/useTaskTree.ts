import { useQuery } from '@tanstack/react-query';

import * as tasksApi from '../api.js';

export function tasksQueryKey(projectId: string) {
  return ['tasks', projectId] as const;
}

export function useTaskTree(projectId: string) {
  return useQuery({
    queryKey: tasksQueryKey(projectId),
    queryFn: () => tasksApi.getTaskTree(projectId),
    enabled: Boolean(projectId),
  });
}
