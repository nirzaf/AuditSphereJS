import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { configuredEntraIdentity } from './entra.js';
export const fixtureUser = '00000000-0000-4000-8000-000000000001';
@Injectable()
export class InternalGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const configured = process.env.DEV_AUTH_TOKEN;
    const received = req.headers.authorization?.replace(/^Bearer /, '') || '';
    let actorId: string;
    if (process.env.AUTH_PROVIDER === 'entra' || process.env.NODE_ENV === 'production') {
      try {
        const identity = await configuredEntraIdentity().authenticate(received);
        const user = await db.user.findUnique({ where: { tenantId_entraObjectId: { tenantId: identity.tenantId, entraObjectId: identity.objectId } } });
        if (!user) throw new Error('User assignment missing');
        actorId = user.id;
      } catch { throw new UnauthorizedException('Internal authentication required'); }
    } else {
      if (process.env.DEV_AUTH_ENABLED !== 'true' || !configured || Buffer.byteLength(received) !== Buffer.byteLength(configured) || !timingSafeEqual(Buffer.from(received), Buffer.from(configured))) throw new UnauthorizedException('Internal authentication required');
      actorId = fixtureUser;
    }
    const membership = await db.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId: req.params.engagementId } }, include: { user: true, engagement: true } });
    if (!membership || membership.user.role !== 'PREPARER') throw new ForbiddenException('Engagement access denied');
    if (req.method !== 'GET' && membership.engagement.state !== 'FIELDWORK_EXECUTION') throw new ForbiddenException('Engagement is not editable');
    req.actorId = actorId;
    return true;
  }
}
