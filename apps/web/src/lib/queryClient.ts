import { MutationCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from './apiClient.js';
import { formatApiErrorMessage } from './apiErrors.js';
import { useErrorBanner } from '../stores/errorBanner.js';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
          if (error instanceof ApiError && error.code === 'api_unreachable') return false;
          return count < 1;
        },
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (mutation.meta?.suppressErrorBanner) return;
        // Per-mutation onError already owns banner / recovery UX.
        if (mutation.options.onError) return;
        if (error instanceof ApiError) {
          useErrorBanner.getState().show(error);
          return;
        }
        useErrorBanner.getState().show(formatApiErrorMessage(error));
      },
    }),
  });
}
