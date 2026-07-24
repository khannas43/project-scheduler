import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod';
import type { FastifyInstance } from 'fastify';

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

/** RFC 7807 problem+json error responses (§5.1). Never swallow an error (§12.3). */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ConflictError) {
      reply
        .code(error.status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: error.name,
          status: error.status,
          detail: error.message,
          code: error.code,
          ...(error.current !== undefined ? { current: error.current } : {}),
        });
      return;
    }

    if (error instanceof SchedulingConflictError) {
      reply
        .code(error.status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: error.name,
          status: error.status,
          detail: error.message,
          code: error.code,
          taskIds: error.taskIds,
        });
      return;
    }

    if (error instanceof AppError) {
      reply
        .code(error.status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: error.name,
          status: error.status,
          detail: error.message,
          code: error.code,
        });
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      reply
        .code(400)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: 'ValidationError',
          status: 400,
          detail: 'Request failed schema validation',
          code: 'validation_error',
          errors: error.validation,
        });
      return;
    }

    request.log.error(error);
    reply
      .code(500)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: 'InternalServerError',
        status: 500,
        detail: 'An unexpected error occurred',
        code: 'internal_server_error',
      });
  });
}
