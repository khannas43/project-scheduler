/** Decode JWT payload without verifying — display/bootstrap only; API verifies. */
export function readAccessTokenClaims(token: string): { id: string; email: string } | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = atob(padded);
    const payload = JSON.parse(json) as { sub?: unknown; email?: unknown };
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
