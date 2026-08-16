# Frontend & API error UX

Companion to [`EXCEPTION_HANDLING.md`](EXCEPTION_HANDLING.md) (server-side). This doc covers how the **web app** presents failures.

## Channels

| Channel | When |
|---------|------|
| **Shell error banner** | Default for mutations that do not set `meta.suppressErrorBanner` and have no custom `onError` |
| **Form-local `form-error`** | Login, create project, role create/edit, custom report builder — `suppressErrorBanner: true` |
| **Custom banner** | e.g. task edit 409 with “Reload” action (`useTaskEdit`) |

Mutations that already define `onError` (banner) skip the global default so messages are not doubled.

## API unreachable

`apps/web/src/lib/apiClient.ts` maps:

- Browser `Failed to fetch` / network TypeErrors
- Vite proxy text containing `ECONNREFUSED` / `http proxy error`
- Empty or non-problem **502/504**

→ `ApiError` with `code: api_unreachable` and a message pointing at **port 3100**.

Login probes `GET /health` (proxied in Vite) and shows a hint when the API is down before submit.

## Validation

Server Zod failures return `code: validation_error` + `errors[]`.  
`formatApiErrorMessage()` / `formatValidationErrors()` turn those into field-oriented copy for forms and banners.

## Problem+json fields (client)

| Field | Use |
|-------|-----|
| `status` | HTTP status |
| `code` | Stable machine code (`unauthorized`, `conflict`, `api_unreachable`, …) |
| `detail` | Human summary |
| `errors` | Optional Zod/Fastify validation list |
| `current` / `taskIds` | Conflict / scheduling conflict extras |
