import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './apiClient.js';
import { useErrorBanner } from '../stores/errorBanner.js';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          if (error instanceof ApiError && error.status < 500) return false;
          return count < 1;
        },
      },
      mutations: {
        onError: (error) => {
          useErrorBanner.getState().show(error instanceof Error ? error : String(error));
        },
      },
    },
  });
}
