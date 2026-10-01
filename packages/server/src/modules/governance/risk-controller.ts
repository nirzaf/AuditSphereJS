import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { assessRiskSchema, assignRiskOwnerSchema, clearRiskSchema, createRiskSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { assessRiskBand, assignRiskOwner, clearRiskBand, createRisk, currentRisks } from './risk-service.js';

@ApiTags('Governance') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/risks')
export class RiskController {
  @Get() list(@Param('engagementId') engagementId: string) { return currentRisks(engagementId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(createRiskSchema) as any })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return createRisk(actorId, engagementId, body); }
  @Post(':riskId/assessments') @ApiBody({ schema: z.toJSONSchema(assessRiskSchema) as any })
  assess(@Param('engagementId') engagementId: string, @Param('riskId') riskId: string, @ReqActor() actorId: string, @Body() body: unknown) { return assessRiskBand(actorId, engagementId, riskId, body); }
  @Post(':riskId/assessments/:assessmentId/clearance') @ApiBody({ schema: z.toJSONSchema(clearRiskSchema) as any })
  clear(@Param('engagementId') engagementId: string, @Param('assessmentId') assessmentId: string, @ReqActor() actorId: string, @Body() body: unknown) { return clearRiskBand(actorId, engagementId, assessmentId, body); }
  @Post(':riskId/owner') @ApiBody({ schema: z.toJSONSchema(assignRiskOwnerSchema) as any })
  assignOwner(@Param('engagementId') engagementId: string, @Param('riskId') riskId: string, @ReqActor() actorId: string, @Body() body: unknown) { return assignRiskOwner(actorId, engagementId, riskId, body); }
}
