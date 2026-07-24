import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { configureApiClient } from '../../../lib/apiClient.js';
import { readAccessTokenClaims } from '../../../lib/jwtDisplay.js';
import { useAuthStore } from '../../../stores/authStore.js';
import * as authApi from '../api.js';

function applyAccessToken(token: string): void {
  const claims = readAccessTokenClaims(token);
  if (claims) {
    useAuthStore.getState().setSession(token, {
      id: claims.id,
      email: claims.email,
      fullName: claims.email,
    });
  } else {
    useAuthStore.getState().setAccessToken(token);
  }
}

/**
 * On app load: wire the API client to the in-memory store, then attempt one
 * silent refresh so a valid httpOnly cookie restores the session after reload.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const clearSession = useAuthStore((s) => s.clearSession);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    configureApiClient({
      accessToken: useAuthStore.getState().accessToken,
      getAccessToken: () => useAuthStore.getState().accessToken,
      setAccessToken: (token) => {
        if (token) applyAccessToken(token);
        else useAuthStore.getState().setAccessToken(null);
      },
      onAuthFailure: () => useAuthStore.getState().clearSession(),
    });

    let cancelled = false;

    void (async () => {
      if (useAuthStore.getState().accessToken) {
        if (!cancelled) setBootstrapped(true);
        return;
      }

      try {
        const result = await authApi.refreshRequest();
        if (!cancelled) {
          applyAccessToken(result.accessToken);
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession, setBootstrapped]);

  if (!bootstrapped) {
    return (
      <div className="boot-screen" role="status">
        Restoring session…
      </div>
    );
  }

  return children;
}
