# ADR 001: Stateless refresh token rotation in v1

## Status
Accepted

## Context
§5.1 calls for a JWT access token plus an httpOnly-cookie refresh token, with
rotation on refresh. Real rotation with replay detection requires tracking
issued refresh tokens server-side (e.g. a `refresh_tokens` table recording
each token's `jti`, and revoking the row it replaces on every refresh) so a
captured old token can be rejected before its natural expiry. §3's schema —
the authoritative list of tables — has no such table, and adding one is a
schema decision, not something to smuggle in while building the API
skeleton.

## Decision
`POST /api/auth/refresh` verifies the incoming refresh JWT and, if valid,
issues a brand new access + refresh pair, overwriting the httpOnly cookie.
This is "rotation" in the literal sense — the client's refresh token changes
on every call — but nothing is revoked server-side. A captured refresh token
remains cryptographically valid until its own `exp`, even after the
legitimate client has rotated past it.

## Consequences
- No new table, no migration, no Redis dependency introduced for this alone.
- A stolen refresh token is a real exposure window (up to `JWT_REFRESH_TTL`,
  default 7 days) rather than a single-use window.
- If this risk becomes unacceptable, the fix is additive: a `refresh_tokens`
  table keyed by `jti`, checked in `authService.refresh` before trusting the
  token, and marked revoked once its replacement issues.
