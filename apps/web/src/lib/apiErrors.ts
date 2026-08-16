/** Shared FE error helpers — keep free of imports from apiClient to avoid cycles. */

/** Stable code when the browser/proxy cannot reach the API process. */
export const API_UNREACHABLE_CODE = 'api_unreachable';

export const API_UNREACHABLE_DETAIL =
  'Cannot reach the API. Is it running on port 3100? (Vite proxies /api there in local dev.)';

/** TanStack Query mutation meta — form-local errors set this to avoid the shell banner. */
export type AppMutationMeta = {
  readonly suppressErrorBanner?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: AppMutationMeta;
  }
}

export const FORM_ERROR_META: AppMutationMeta = { suppressErrorBanner: true };

export type ProblemLike = {
  readonly status: number;
  readonly detail?: string | undefined;
  readonly code?: string | undefined;
  readonly errors?: unknown;
  readonly type?: string | undefined;
  readonly title?: string | undefined;
};

/** Turn Fastify/Zod `problem.errors` into a short field-oriented sentence. */
export function formatValidationErrors(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const parts: string[] = [];
  for (const item of errors) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const message =
      typeof row.message === 'string'
        ? row.message
        : typeof row.msg === 'string'
          ? row.msg
          : null;
    if (!message) continue;

    const pathRaw =
      typeof row.instancePath === 'string'
        ? row.instancePath
        : typeof row.path === 'string'
          ? row.path
          : Array.isArray(row.path)
            ? row.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('.')
            : '';
    const path = pathRaw.replace(/^\//, '').replace(/\//g, '.');
    parts.push(path ? `${path}: ${message}` : message);
  }

  if (parts.length === 0) return null;
  return parts.slice(0, 5).join('; ');
}

function isApiErrorLike(
  error: unknown,
): error is { detail: string; code: string; status: number; problem: ProblemLike } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'detail' in error &&
    'code' in error &&
    'problem' in error
  );
}

/** Human-readable message for banners and form-error paragraphs. */
export function formatApiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (typeof error === 'string') return error;
  if (isApiErrorLike(error)) {
    const validation = formatValidationErrors(error.problem.errors);
    if (validation && error.code === 'validation_error') {
      return validation;
    }
    if (validation && error.status === 400) {
      return `${error.detail}. ${validation}`;
    }
    return error.detail || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export function isApiUnreachableError(error: unknown): boolean {
  return isApiErrorLike(error) && error.code === API_UNREACHABLE_CODE;
}

export function apiUnreachableProblem(status = 503): ProblemLike {
  return {
    type: 'about:blank',
    title: 'ServiceUnavailable',
    status,
    detail: API_UNREACHABLE_DETAIL,
    code: API_UNREACHABLE_CODE,
  };
}
