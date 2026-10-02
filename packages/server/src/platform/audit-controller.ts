import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import { db } from './db.js';
import { requireCapability } from './authorization.js';
import { captureAuditCheckpoint, verifyAuditChain } from './audit-chain.js';

@ApiTags('Audit') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/audit')
export class AuditController {
  @Get('checkpoint') checkpoint(@Param('engagementId') engagementId: string) { return captureAuditCheckpoint(engagementId); }
  @Get('verify') verify(@Param('engagementId') engagementId: string) { return verifyAuditChain(engagementId); }
  @Get('events')
  async events(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    const engagement = await db.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true, clientId: true } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(db, actorId, 'ENGAGEMENT_READ', { firmId: engagement.firmId, clientId: engagement.clientId, engagementId });
    return db.auditEvent.findMany({
      where: { engagementId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, actorKind: true, actorId: true, action: true, resourceType: true, resourceId: true, resourceVersion: true, correlationId: true, payload: true, beforeState: true, afterState: true, createdAt: true },
    });
  }
}
