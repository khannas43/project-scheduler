import { create } from 'zustand';

import type { ApiError } from '../lib/apiClient.js';

export type BannerSeverity = 'error' | 'info';

interface ErrorBannerState {
  message: string | null;
  code: string | null;
  severity: BannerSeverity;
  actionLabel: string | null;
  onAction: (() => void) | null;
  show: (
    error: ApiError | Error | string,
    options?: {
      actionLabel?: string;
      onAction?: () => void;
      severity?: BannerSeverity;
    },
  ) => void;
  /** Informational notice (e.g. CONSTRAINT_OVERRIDES_DEPENDENCY) — not a failure. */
  showInfo: (message: string, code?: string | null) => void;
  clear: () => void;
}

export const useErrorBanner = create<ErrorBannerState>((set) => ({
  message: null,
  code: null,
  severity: 'error',
  actionLabel: null,
  onAction: null,
  show: (error, options) => {
    const actionLabel = options?.actionLabel ?? null;
    const onAction = options?.onAction ?? null;
    const severity = options?.severity ?? 'error';
    if (typeof error === 'string') {
      set({ message: error, code: null, actionLabel, onAction, severity });
      return;
    }
    if ('code' in error && 'detail' in error) {
      set({ message: error.detail, code: error.code, actionLabel, onAction, severity });
      return;
    }
    set({ message: error.message, code: null, actionLabel, onAction, severity });
  },
  showInfo: (message, code = null) =>
    set({
      message,
      code,
      severity: 'info',
      actionLabel: null,
      onAction: null,
    }),
  clear: () =>
    set({ message: null, code: null, severity: 'error', actionLabel: null, onAction: null }),
}));
