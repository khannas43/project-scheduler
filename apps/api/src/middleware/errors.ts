import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** §12.3: domain errors extend AppError with a stable code and HTTP status. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('unauthorized', 401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Permission denied') {
    super('forbidden', 403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('not_found', 404, message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super('bad_request', 400, message);
    this.name = 'BadRequestError';
  }
}

/** §9.1: 409 with the current server state attached for the client reload prompt. */
export class ConflictError extends AppError {
  readonly current: unknown;

  constructor(message = 'Conflict', current?: unknown) {
    super('conflict', 409, message);
    this.name = 'ConflictError';
    this.current = current;
  }
}

/** Maps @pkg/scheduler SchedulingError → 409 with taskIds for UI highlighting. */
export class SchedulingConflictError extends AppError {
  readonly taskIds: readonly string[];

  constructor(message: string, taskIds: readonly string[]) {
    super('scheduling_conflict', 409, message);
    this.name = 'SchedulingConflictError';
    this.taskIds = taskIds;
  }
}

/** RFC 7807 problem+json body — never includes stack or internal exception messages for 5xx. */
export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly current?: unknown;
  readonly taskIds?: readonly string[];
  readonly errors?: unknown;
}

function sendProblem(reply: FastifyReply, body: ProblemBody): void {
  reply.code(body.status).type('application/problem+json').send(body);
}

function isFastifyHttpError(error: unknown): error is FastifyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as FastifyError).statusCode === 'number'
  );
}

/**
 * Map an unexpected / framework error to a client-safe problem body.
 * Exported for unit tests — must never put `stack` or raw Error.message into 5xx detail.
 */
export function problemFromUnknownError(error: unknown): ProblemBody {
  if (error instanceof ConflictError) {
    return {
      type: 'about:blank',
      title: error.name,
      status: error.status,
      detail: error.message,
      code: error.code,
      ...(error.current !== undefined ? { current: error.current } : {}),
    };
  }

  if (error instanceof SchedulingConflictError) {
    return {
      type: 'about:blank',
      title: error.name,
      status: error.status,
      detail: error.message,
      code: error.code,
      taskIds: error.taskIds,
    };
  }

  if (error instanceof AppError) {
    return {
      type: 'about:blank',
      title: error.name,
      status: error.status,
      detail: error.message,
      code: error.code,
    };
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      type: 'about:blank',
      title: 'ValidationError',
      status: 400,
      detail: 'Request failed schema validation',
      code: 'validation_error',
      errors: error.validation,
    };
  }

  if (isFastifyHttpError(error)) {
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Client/framework 4xx (malformed JSON, etc.) — safe short message, no stack.
      const detail =
        typeof error.message === 'string' && error.message.length > 0 && error.message.length < 200
          ? error.message
          : 'Bad request';
      return {
        type: 'about:blank',
        title: error.name || 'BadRequest',
        status,
        detail,
        code: typeof error.code === 'string' ? error.code : 'bad_request',
      };
    }
  }

  return {
    type: 'about:blank',
    title: 'InternalServerError',
    status: 500,
    detail: 'An unexpected error occurred',
    code: 'internal_server_error',
  };
}

function logServerError(request: FastifyRequest, error: unknown, problem: ProblemBody): void {
  const errObj =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'non_error_throw');

  if (problem.status >= 500) {
    request.log.error(
      {
        err: errObj,
        reqId: request.id,
        method: request.method,
        url: request.url,
        code: problem.code,
      },
      'unhandled_request_error',
    );
    return;
  }

  request.log.warn(
    {
      err: errObj,
      reqId: request.id,
      method: request.method,
      url: request.url,
      code: problem.code,
      status: problem.status,
    },
    'request_error',
  );
}

/** Assert a problem body never leaks stack traces (used by tests + defensive check). */
export function assertNoStackLeak(body: unknown): void {
  const text = JSON.stringify(body);
  if (text.includes('"stack"') || /\bat\s+\S+\s+\(/.test(text)) {
    throw new Error('problem body appears to contain a stack trace');
  }
}

/** RFC 7807 problem+json error responses (§5.1). Never swallow an error (§12.3). */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, request, reply) => {
    const problem = problemFromUnknownError(error);
    logServerError(request, error, problem);
    sendProblem(reply, problem);
    return reply;
  });

  fastify.setNotFoundHandler((request, reply) => {
    sendProblem(reply, {
      type: 'about:blank',
      title: 'NotFoundError',
      status: 404,
      detail: `Route ${request.method}:${request.url} not found`,
      code: 'not_found',
    });
    return reply;
  });
}
