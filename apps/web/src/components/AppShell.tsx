import { Link, Outlet } from '@tanstack/react-router';

import { useAuth } from '../features/auth/index.js';
import { useErrorBanner } from '../stores/errorBanner.js';

export function AppShell() {
  const { user, logout } = useAuth();
  const { message, code, actionLabel, onAction, clear } = useErrorBanner();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/projects" className="topbar-brand">
          Project Scheduler
        </Link>
        <div className="topbar-right">
          {user ? <span className="topbar-user">{user.fullName}</span> : null}
          <button type="button" className="btn-secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      {message ? (
        <div className="error-banner" role="alert">
          <span>
            {message}
            {code ? <code className="error-code">{code}</code> : null}
          </span>
          <span className="error-banner-actions">
            {actionLabel && onAction ? (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  onAction();
                  clear();
                }}
              >
                {actionLabel}
              </button>
            ) : null}
            <button type="button" className="btn-link" onClick={clear}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
