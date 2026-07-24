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

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('conflict', 409, message);
    this.name = 'ConflictError';
  }
}

/** RFC 7807 problem+json error responses (§5.1). Never swallow an error (§12.3). */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, request, reply) => {
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
