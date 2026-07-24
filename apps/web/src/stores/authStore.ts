import { create } from 'zustand';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /** False until the initial silent-refresh attempt finishes. */
  bootstrapped: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string | null) => void;
  clearSession: () => void;
  setBootstrapped: (value: boolean) => void;
}

/**
 * Access token lives in memory only (ADR 001) — never localStorage.
 * Refresh token is httpOnly cookie set by the API.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapped: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => set({ accessToken: null, user: null }),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
}));
