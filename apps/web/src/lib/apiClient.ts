/** RFC 7807 problem+json (§5.1) as returned by apps/api. */
export interface ProblemDetails {
  readonly type?: string | undefined;
  readonly title?: string | undefined;
  readonly status: number;
  readonly detail?: string | undefined;
  readonly code?: string | undefined;
  readonly current?: unknown;
  readonly taskIds?: readonly string[] | undefined;
  readonly errors?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title ?? 'Request failed');
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code ?? 'unknown';
    this.detail = problem.detail ?? problem.title ?? 'Request failed';
    this.problem = problem;
  }
}

export type AuthTokens = {
  accessToken: string | null;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  /** Called when refresh fails — clear session and leave routing to the caller. */
  onAuthFailure: () => void;
};

let authBridge: AuthTokens | null = null;

/** Wire the in-memory auth store into the fetch wrapper (once at boot). */
export function configureApiClient(bridge: AuthTokens): void {
  authBridge = bridge;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip the 401→refresh→retry cycle (used by refresh itself). */
  skipAuthRetry?: boolean;
};

let refreshInFlight: Promise<boolean> | null = null;

async function parseProblem(response: Response): Promise<ProblemDetails> {
  try {
    const data = (await response.json()) as Partial<ProblemDetails>;
    return {
      type: data.type,
      title: data.title,
      status: data.status ?? response.status,
      detail: data.detail,
      code: data.code,
      current: data.current,
      taskIds: data.taskIds,
      errors: data.errors,
    };
  } catch {
    return { status: response.status, detail: response.statusText, code: 'http_error' };
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!authBridge) return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        authBridge?.onAuthFailure();
        return false;
      }
      const data = (await response.json()) as { accessToken: string };
      authBridge?.setAccessToken(data.accessToken);
      return true;
    } catch {
      authBridge?.onAuthFailure();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Thin fetch wrapper — Bearer access token from memory, cookies for refresh.
 * On 401: one silent refresh + single retry; refresh failure clears auth.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuthRetry, headers: initHeaders, ...rest } = options;

  const headers = new Headers(initHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = authBridge?.getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const init: RequestInit = {
    ...rest,
    headers,
    credentials: 'include',
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, init);

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipAuthRetry: true });
    }
    throw new ApiError(await parseProblem(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }

  return (await response.json()) as T;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Authenticated binary download — same Bearer/refresh cycle as apiRequest,
 * but returns a Blob (for CSV/Excel/PDF attachments).
 */
export async function apiRequestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const { body, skipAuthRetry, headers: initHeaders, ...rest } = options;

  const headers = new Headers(initHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = authBridge?.getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const init: RequestInit = {
    ...rest,
    headers,
    credentials: 'include',
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, init);

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiRequestBlob(path, { ...options, skipAuthRetry: true });
    }
    throw new ApiError(await parseProblem(response));
  }

  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
  };
}

/** Trigger a browser file download from a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Exported for unit tests. */
export const __testOnly = { tryRefresh, parseProblem, configureApiClient };
