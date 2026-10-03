import { Controller, Get, NotFoundException, Param, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiProblemSchema, auditCheckpointSchema, auditEventSchema, auditVerificationSchema } from '@auditsphere/contracts';
import { InternalGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import { db } from './db.js';
import { requireCapability } from './authorization.js';
import { captureAuditCheckpoint, verifyAuditChain } from './audit-chain.js';
import { toAuditEventView } from './audit-response.js';

async function requireAuditReadScope(engagementId: string, actorId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true, clientId: true } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', { firmId: engagement.firmId, clientId: engagement.clientId, engagementId });
}

@ApiTags('Audit') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/audit')
export class AuditController {
  @Get('checkpoint')
  @ApiOkResponse({ standardSchema: auditCheckpointSchema })
  @SerializeOptions({ schema: auditCheckpointSchema })
  async checkpoint(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    await requireAuditReadScope(engagementId, actorId);
    return captureAuditCheckpoint(engagementId);
  }

  @Get('verify')
  @ApiOkResponse({ standardSchema: auditVerificationSchema })
  @SerializeOptions({ schema: auditVerificationSchema })
  async verify(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    await requireAuditReadScope(engagementId, actorId);
    return verifyAuditChain(engagementId);
  }

  @Get('events')
  @ApiOkResponse({ standardSchema: auditEventSchema, isArray: true })
  @SerializeOptions({ schema: auditEventSchema })
  async events(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    await requireAuditReadScope(engagementId, actorId);
    const events = await db.auditEvent.findMany({
      where: { engagementId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, actorKind: true, actorId: true, action: true, resourceType: true, resourceId: true, resourceVersion: true, correlationId: true, payload: true, beforeState: true, afterState: true, createdAt: true },
    });
    return events.map(toAuditEventView);
  }
}
