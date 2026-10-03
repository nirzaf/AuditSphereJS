import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, assessRiskSchema, assignRiskOwnerSchema, clearRiskSchema, createRiskSchema,
  paginationQuerySchema, riskAssessmentResultSchema, riskClearanceResultSchema, riskCreatedResultSchema,
  riskViewSchema, riskOwnerAssignmentResultSchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { assessRiskBand, assignRiskOwner, clearRiskBand, createRisk, currentRisks } from './risk-service.js';

@ApiTags('Governance') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/risks')
export class RiskController {
  @Get()
  @ApiOkResponse({ standardSchema: riskViewSchema, isArray: true })
  @SerializeOptions({ schema: riskViewSchema })
  async list(@Param('engagementId') engagementId: string, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) {
    return (await currentRisks(engagementId, page)).map((risk) => ({
      ...risk, createdAt: risk.createdAt.toISOString(),
      owner: risk.owner ? { ...risk.owner, assignedAt: risk.owner.assignedAt.toISOString() } : null,
    }));
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: riskCreatedResultSchema })
  @SerializeOptions({ schema: riskCreatedResultSchema })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: createRiskSchema }) body: unknown) { return createRisk(actorId, engagementId, body); }

  @Post(':riskId/assessments')
  @ApiCreatedResponse({ standardSchema: riskAssessmentResultSchema })
  @SerializeOptions({ schema: riskAssessmentResultSchema })
  assess(@Param('engagementId') engagementId: string, @Param('riskId') riskId: string, @ReqActor() actorId: string, @Body({ schema: assessRiskSchema }) body: unknown) { return assessRiskBand(actorId, engagementId, riskId, body); }

  @Post(':riskId/assessments/:assessmentId/clearance')
  @ApiCreatedResponse({ standardSchema: riskClearanceResultSchema })
  @SerializeOptions({ schema: riskClearanceResultSchema })
  clear(@Param('engagementId') engagementId: string, @Param('assessmentId') assessmentId: string, @ReqActor() actorId: string, @Body({ schema: clearRiskSchema }) body: unknown) { return clearRiskBand(actorId, engagementId, assessmentId, body); }

  @Post(':riskId/owner')
  @ApiCreatedResponse({ standardSchema: riskOwnerAssignmentResultSchema })
  @SerializeOptions({ schema: riskOwnerAssignmentResultSchema })
  assignOwner(@Param('engagementId') engagementId: string, @Param('riskId') riskId: string, @ReqActor() actorId: string, @Body({ schema: assignRiskOwnerSchema }) body: unknown) { return assignRiskOwner(actorId, engagementId, riskId, body); }
}
