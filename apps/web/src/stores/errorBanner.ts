import { create } from 'zustand';

import type { ApiError } from '../lib/apiClient.js';

interface ErrorBannerState {
  message: string | null;
  code: string | null;
  actionLabel: string | null;
  onAction: (() => void) | null;
  show: (
    error: ApiError | Error | string,
    options?: { actionLabel?: string; onAction?: () => void },
  ) => void;
  clear: () => void;
}

export const useErrorBanner = create<ErrorBannerState>((set) => ({
  message: null,
  code: null,
  actionLabel: null,
  onAction: null,
  show: (error, options) => {
    const actionLabel = options?.actionLabel ?? null;
    const onAction = options?.onAction ?? null;
    if (typeof error === 'string') {
      set({ message: error, code: null, actionLabel, onAction });
      return;
    }
    if ('code' in error && 'detail' in error) {
      set({ message: error.detail, code: error.code, actionLabel, onAction });
      return;
    }
    set({ message: error.message, code: null, actionLabel, onAction });
  },
  clear: () => set({ message: null, code: null, actionLabel: null, onAction: null }),
}));
