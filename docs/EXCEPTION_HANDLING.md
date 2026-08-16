# Exception & error responses (API)

Server-side exception paths for the Fastify API. Clients always receive RFC 7807 **problem+json** without stack traces. Full stacks stay in structured server logs only.

## Request errors

Handler: `registerErrorHandler()` in `apps/api/src/middleware/errors.ts`.

| Case | Client | Server log |
|------|--------|------------|
| `AppError` / subclasses | `status`, `code`, `detail` from the domain error | `request_error` (warn) with `err`, `reqId`, method, url |
| Zod / schema validation | 400 `validation_error` | warn |
| Fastify 4xx (e.g. bad JSON) | 4xx, short safe `detail` | warn |
| Unexpected `Error` / throw | **500** — detail always `An unexpected error occurred` | `unhandled_request_error` (error) **with stack** |
| Unknown route | 404 `not_found` problem+json | — |

Helpers: `problemFromUnknownError()`, `assertNoStackLeak()` (tests).

Tests: `apps/api/test/errors.test.ts` — 500 body has no stack / no raw message leak; AppError and 404 shapes; `/health` liveness.

## Process-level handlers

`apps/api/src/server.ts`:

| Signal / event | Behavior |
|----------------|----------|
| `unhandledRejection` | Log `unhandled_rejection` with `err` (stack server-side); process keeps running |
| `uncaughtException` | Log `uncaught_exception` (fatal), then graceful `app.close()` and exit 1 |
| `SIGTERM` / `SIGINT` | Graceful close, exit 0 |
| `listen` failure | Fatal log, non-zero `process.exitCode` |

## Health vs readiness

| Endpoint | Meaning |
|----------|---------|
| `GET /health` | Liveness — process up (no DB) |
| `GET /ready` | Readiness — `select 1` against Postgres; **503** problem+json `not_ready` if DB down |

Compose / k8s should probe liveness on `/health` and readiness on `/ready`.

## What this does *not* cover

Frontend API-down UX (opaque Vite proxy 500 when the API is dead) is **§6 Error Handling** — separate from these server guarantees.
