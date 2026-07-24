import { Navigate, Outlet } from '@tanstack/react-router';

import { useAuth } from '../hooks/useAuth.js';

/** Redirects to /login when there is no in-memory access token. */
export function RequireAuth() {
  const { isAuthenticated, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return (
      <div className="boot-screen" role="status">
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <Outlet />;
}
