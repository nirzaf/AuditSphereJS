import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const ReqActor = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<{ actorId?: string }>();
  if (!request.actorId) throw new Error('Request actor is missing; InternalGuard must run first');
  return request.actorId;
});
