import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

const correlationIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const correlationContext = new AsyncLocalStorage<string>();

export function validCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && correlationIdPattern.test(value);
}

export function createCorrelationId(value?: unknown): string {
  return validCorrelationId(value) ? value : randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return correlationContext.getStore();
}

export function runWithCorrelationId<T>(value: unknown, callback: () => T): T {
  return correlationContext.run(createCorrelationId(value), callback);
}

/** Establishes the Fastify request identity for controller and downstream async work. */
@Injectable()
export class CorrelationContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: { handle(): Observable<unknown> }): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ id?: unknown }>();
    const correlationId = createCorrelationId(request.id);
    return new Observable(subscriber => runWithCorrelationId(correlationId, () => next.handle().subscribe(subscriber)));
  }
}
