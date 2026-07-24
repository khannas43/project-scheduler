import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { useAuthStore } from '../../../stores/authStore.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as authApi from '../api.js';

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const showError = useErrorBanner((s) => s.show);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.loginRequest(email, password);
      setSession(result.accessToken, result.user);
      await navigate({ to: '/projects' });
    },
    [navigate, setSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logoutRequest();
    } catch (error) {
      // Still clear local state even if the network call fails.
      showError(error instanceof Error ? error : String(error));
    } finally {
      clearSession();
      await navigate({ to: '/login' });
    }
  }, [clearSession, navigate, showError]);

  return {
    accessToken,
    user,
    bootstrapped,
    isAuthenticated: Boolean(accessToken),
    login,
    logout,
  };
}
