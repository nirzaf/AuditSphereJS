import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { configuredEntraIdentity } from './entra.js';
import { requireCapability } from './authorization.js';
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
    const membership = await db.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId: req.params.engagementId } }, include: { engagement: true } });
    if (!membership) throw new ForbiddenException('Engagement access denied');
    // Membership alone is not authorization. An explicit, current, in-scope grant is required,
    // and the same rule is reapplied inside each write transaction.
    const scope = { firmId: membership.engagement.firmId, clientId: membership.engagement.clientId, engagementId: membership.engagement.id };
    await requireCapability(db, actorId, 'ENGAGEMENT_READ', scope);
    req.actorId = actorId;
    req.scope = scope;
    return true;
  }
}
