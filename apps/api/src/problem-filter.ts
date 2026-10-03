import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { apiProblemSchema } from '@auditsphere/contracts';
import type { ApiProblemCode } from '@auditsphere/contracts';

const API_ERROR_CODE_BY_STATUS: Partial<Record<number, ApiProblemCode>> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED', 406: 'NOT_ACCEPTABLE', 408: 'REQUEST_TIMEOUT', 409: 'CONFLICT',
  410: 'GONE', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS', 502: 'BAD_GATEWAY', 503: 'SERVICE_UNAVAILABLE', 504: 'GATEWAY_TIMEOUT',
};

export function apiErrorCodeForStatus(status: number): ApiProblemCode {
  return API_ERROR_CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR');
}

export class ApiProblemExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const candidateStatus = error instanceof HttpException ? error.getStatus() : 500;
    const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
    const request = host.switchToHttp().getRequest();
    const problem = apiProblemSchema.parse({
      error: {
        code: apiErrorCodeForStatus(status),
        status,
        message: status >= 500 ? 'Internal server error' : (error as HttpException).getResponse(),
        correlationId: request.id,
      },
    });
    host.switchToHttp().getResponse().status(status).send(problem);
    // Keep correlation IDs for diagnosis, but never log arbitrary exception text or parameters.
    if (status === 500) request.log.error({ status, correlationId: request.id }, 'Unhandled API exception');
  }
}

Catch()(ApiProblemExceptionFilter);
