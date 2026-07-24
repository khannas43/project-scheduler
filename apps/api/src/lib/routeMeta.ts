/**
 * Route registration metadata used by app.ts's onRoute collector and the
 * route-guard drift test (§6.4) that reads it back.
 */
export interface RegisteredRouteInfo {
  readonly method: string;
  readonly path: string;
  readonly preHandlers: readonly unknown[];
  readonly config: unknown;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every route registered so far, one entry per (method, path) pair. Populated by app.ts. */
    routeTable: RegisteredRouteInfo[];
  }

  interface FastifyContextConfig {
    /** Pre-auth routes (login/refresh) — drift test skips permission check. */
    public?: boolean;
    /** Authenticated but project-unscoped mutators (POST /api/projects). */
    authOnly?: boolean;
  }
}

/**
 * Route config marker for routes that are intentionally guardless — pre-auth
 * endpoints (login, refresh) chief among them, since you can't check a
 * permission for a user that isn't authenticated yet. The drift test skips
 * routes carrying this; everything else non-GET must have a real guard.
 */
export const PUBLIC_ROUTE_CONFIG = { public: true } as const;

/**
 * Authenticated but project-unscoped mutating routes (e.g. POST /api/projects).
 * There is no project yet to resolve a permission against — membership is
 * established by the handler itself. Drift test skips these the same way as
 * PUBLIC_ROUTE_CONFIG; requireAuth still applies via preHandler.
 */
export const AUTH_ONLY_ROUTE_CONFIG = { authOnly: true } as const;
