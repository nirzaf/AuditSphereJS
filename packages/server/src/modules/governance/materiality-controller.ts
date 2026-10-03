import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, approveMaterialitySchema, calculateMaterialitySchema, materialityApprovalResultSchema,
  materialityAssessmentSchema, materialityCalculationResultSchema, paginationQuerySchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveMaterialityAssessment, calculateMaterialityAssessment, latestMaterialityAssessment, listMaterialityAssessments } from './materiality-service.js';

type FixedMoney = string | { toFixed(scale: number): string };
type MaterialityRecordViewSource = {
  id: string; publicationId: string; taxonomyVersionId: string; benchmarkKind: string; destinationCode: string | null;
  sourceLineCount: number; currency: string; benchmarkAmount: FixedMoney;
  planningMateriality: FixedMoney; tolerableError: FixedMoney;
  sadThreshold: FixedMoney; ratePercent: FixedMoney;
  performancePercent: FixedMoney; trivialPercent: FixedMoney;
  policyVersion: string; inputHash: string; status: string; calculatedAt: Date; approvedAt: Date | null;
  stale: boolean; currentPublicationId?: string | null;
};
const fixedMoney = (value: FixedMoney) => typeof value === 'string' ? value : value.toFixed(6);

function materialityView(assessment: MaterialityRecordViewSource) {
  return {
    assessmentId: assessment.id, publicationId: assessment.publicationId, taxonomyVersionId: assessment.taxonomyVersionId,
    benchmarkKind: assessment.benchmarkKind, destinationCode: assessment.destinationCode, sourceLineCount: assessment.sourceLineCount,
    currency: assessment.currency, benchmarkAmount: fixedMoney(assessment.benchmarkAmount),
    planningMateriality: fixedMoney(assessment.planningMateriality), tolerableError: fixedMoney(assessment.tolerableError),
    sadThreshold: fixedMoney(assessment.sadThreshold), ratePercent: fixedMoney(assessment.ratePercent),
    performancePercent: fixedMoney(assessment.performancePercent), trivialPercent: fixedMoney(assessment.trivialPercent),
    policyVersion: assessment.policyVersion, inputHash: assessment.inputHash, status: assessment.status,
    calculatedAt: assessment.calculatedAt.toISOString(), approvedAt: assessment.approvedAt?.toISOString() ?? null,
    stale: assessment.stale, ...(assessment.currentPublicationId === undefined ? {} : { currentPublicationId: assessment.currentPublicationId }),
  };
}

@ApiTags('Governance') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/materiality')
export class MaterialityController {
  @Get()
  @ApiOkResponse({ standardSchema: materialityAssessmentSchema, isArray: true })
  @SerializeOptions({ schema: materialityAssessmentSchema })
  async list(@Param('engagementId') engagementId: string, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) { return (await listMaterialityAssessments(engagementId, page)).map(materialityView); }

  @Get('latest')
  @ApiOkResponse({ standardSchema: materialityAssessmentSchema })
  @SerializeOptions({ schema: materialityAssessmentSchema })
  async latest(@Param('engagementId') engagementId: string) { return materialityView(await latestMaterialityAssessment(engagementId)); }

  @Post()
  @ApiCreatedResponse({ standardSchema: materialityCalculationResultSchema })
  @SerializeOptions({ schema: materialityCalculationResultSchema })
  calculate(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: calculateMaterialitySchema }) body: unknown) { return calculateMaterialityAssessment(actorId, engagementId, body); }

  @Post(':assessmentId/approve')
  @ApiCreatedResponse({ standardSchema: materialityApprovalResultSchema })
  @SerializeOptions({ schema: materialityApprovalResultSchema })
  approve(@Param('engagementId') engagementId: string, @Param('assessmentId') assessmentId: string, @ReqActor() actorId: string, @Body({ schema: approveMaterialitySchema }) body: unknown) { return approveMaterialityAssessment(actorId, engagementId, assessmentId, body); }
}
