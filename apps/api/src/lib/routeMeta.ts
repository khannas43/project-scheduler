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
}

/**
 * Route config marker for routes that are intentionally guardless — pre-auth
 * endpoints (login, refresh) chief among them, since you can't check a
 * permission for a user that isn't authenticated yet. The drift test skips
 * routes carrying this; everything else non-GET must have a real guard.
 */
export const PUBLIC_ROUTE_CONFIG = { public: true } as const;
