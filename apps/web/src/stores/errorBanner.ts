import { create } from 'zustand';

import type { ApiError } from '../lib/apiClient.js';

interface ErrorBannerState {
  message: string | null;
  code: string | null;
  show: (error: ApiError | Error | string) => void;
  clear: () => void;
}

export const useErrorBanner = create<ErrorBannerState>((set) => ({
  message: null,
  code: null,
  show: (error) => {
    if (typeof error === 'string') {
      set({ message: error, code: null });
      return;
    }
    if ('code' in error && 'detail' in error) {
      set({ message: error.detail, code: error.code });
      return;
    }
    set({ message: error.message, code: null });
  },
  clear: () => set({ message: null, code: null }),
}));
