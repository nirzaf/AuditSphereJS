import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors, UsePipes, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  acceptProposalSchema, apiProblemSchema, commercialDualKeyStatusSchema, commercialProposalActionResultSchema,
  commercialProposalCreatedResultSchema, commercialProposalViewSchema, createProposalSchema, proposalActionSchema,
  recordRiskClearanceSchema, commercialRiskClearanceResultSchema, paginationQuerySchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { acceptProposal, createProposal, dualKeyStatus, listProposals, presentProposal, recordRiskClearance } from './proposals.js';
import { toCommercialDualKeyStatus, toCommercialProposalView, toCommercialRiskClearanceResult } from './commercial-response.js';

@ApiTags('Commercial') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/commercial')
export class CommercialController {
  @Get('proposals')
  @ApiOkResponse({ standardSchema: commercialProposalViewSchema, isArray: true })
  @SerializeOptions({ schema: commercialProposalViewSchema })
  async list(@Param('engagementId') engagementId: string, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) { return (await listProposals(engagementId, page)).map(toCommercialProposalView); }

  @Post('proposals')
  @ApiCreatedResponse({ standardSchema: commercialProposalCreatedResultSchema })
  @SerializeOptions({ schema: commercialProposalCreatedResultSchema })
  create(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createProposalSchema }) body: unknown) { return createProposal(actorId, engagementId, body); }

  @Post('proposals/:id/present')
  @ApiCreatedResponse({ standardSchema: commercialProposalActionResultSchema })
  @SerializeOptions({ schema: commercialProposalActionResultSchema })
  present(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: proposalActionSchema }) body: unknown) { return presentProposal(actorId, engagementId, id, body); }

  @Post('proposals/:id/accept')
  @ApiCreatedResponse({ standardSchema: commercialProposalActionResultSchema })
  @SerializeOptions({ schema: commercialProposalActionResultSchema })
  accept(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: acceptProposalSchema }) body: unknown) { return acceptProposal(actorId, engagementId, id, body); }

  @Get('dual-key')
  @ApiOkResponse({ standardSchema: commercialDualKeyStatusSchema })
  @SerializeOptions({ schema: commercialDualKeyStatusSchema })
  async status(@Param('engagementId') engagementId: string) { return toCommercialDualKeyStatus(await dualKeyStatus(engagementId)); }

  @Post('dual-key/risk-clearance')
  @ApiCreatedResponse({ standardSchema: commercialRiskClearanceResultSchema })
  @SerializeOptions({ schema: commercialRiskClearanceResultSchema })
  async clearance(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: recordRiskClearanceSchema }) body: unknown) { return toCommercialRiskClearanceResult(await recordRiskClearance(actorId, engagementId, body)); }
}
