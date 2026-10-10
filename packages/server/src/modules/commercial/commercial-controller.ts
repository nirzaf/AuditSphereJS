import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors, UsePipes, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  acceptProposalSchema, apiProblemSchema, commercialDualKeyStatusSchema, commercialProposalActionResultSchema,
  commercialProposalCreatedResultSchema, commercialProposalViewSchema, createProposalSchema, proposalActionSchema,
  recordRiskClearanceSchema, commercialRiskClearanceResultSchema, paginationQuerySchema,
  createClientSchema, updateClientProfileSchema, setClientParentSchema, createContactSchema, createLeadSchema, profileLeadSchema,
  commercialClientCreatedResultSchema, commercialClientProfileViewSchema, commercialClientParentResultSchema,
  commercialClientDirectorySchema, commercialContactCreatedResultSchema, commercialContactListSchema,
  commercialContactSnapshotSchema, commercialLeadCreatedResultSchema, commercialLeadProfileResultSchema,
  commercialLeadAdvanceResultSchema, commercialLeadListSchema,
  createAcceptanceCaseSchema, recordAcceptanceAnswerSchema, clearAcceptanceCaseSchema, createEngagementSchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { acceptanceCaseCreatedSchema, acceptanceClearanceSchema, acceptanceReviewStateSchema, engagementIdentitySchema } from '@auditsphere/contracts';
import { createClient as createClientRecord, listClientDirectory, setClientParent, updateClientProfile } from './directory.js';
import { addContact as addContactRecord, listContacts, resolveRecipient } from './contacts.js';
import { advanceLeadToProposal as advanceLeadRecord, createLead as createLeadRecord, listLeads, profileLead as profileLeadRecord } from './leads.js';
import { createAcceptanceCase, recordAcceptanceAnswer, completeAcceptanceReview, clearAcceptanceCase } from './acceptance.js';
import { createEngagement, engagementIdentity } from './engagements.js';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { acceptProposal, createProposal, dualKeyStatus, listProposals, presentProposal, recordRiskClearance } from './proposals.js';
import { issueProposalAcceptance } from './proposal-acceptance.js';
import { issueProposalAcceptanceSchema, proposalAcceptanceCredentialSchema } from '@auditsphere/contracts';
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

  @Post('proposals/:id/acceptance-credential') @Header('cache-control', 'no-store')
  @ApiCreatedResponse({ standardSchema: proposalAcceptanceCredentialSchema })
  @SerializeOptions({ schema: proposalAcceptanceCredentialSchema })
  issueAcceptance(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: issueProposalAcceptanceSchema }) body: unknown) {
    return issueProposalAcceptance(actorId, engagementId, id, body);
  }

  @Get('dual-key')
  @ApiOkResponse({ standardSchema: commercialDualKeyStatusSchema })
  @SerializeOptions({ schema: commercialDualKeyStatusSchema })
  async status(@Param('engagementId') engagementId: string) { return toCommercialDualKeyStatus(await dualKeyStatus(engagementId)); }

  @Post('dual-key/risk-clearance')
  @ApiCreatedResponse({ standardSchema: commercialRiskClearanceResultSchema })
  @SerializeOptions({ schema: commercialRiskClearanceResultSchema })
  async clearance(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: recordRiskClearanceSchema }) body: unknown) { return toCommercialRiskClearanceResult(await recordRiskClearance(actorId, engagementId, body)); }

  @Get('directory')
  @ApiOkResponse({ standardSchema: commercialClientDirectorySchema })
  @SerializeOptions({ schema: commercialClientDirectorySchema })
  async directory(@Param('engagementId') engagementId: string) { return listClientDirectory(engagementId); }
  @Post('clients')
  @ApiCreatedResponse({ standardSchema: commercialClientCreatedResultSchema })
  @SerializeOptions({ schema: commercialClientCreatedResultSchema })
  createClient(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createClientSchema }) body: unknown) { return createClientRecord(actorId, engagementId, body); }
  @Post('clients/:id/profile')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: commercialClientProfileViewSchema })
  @SerializeOptions({ schema: commercialClientProfileViewSchema })
  updateProfile(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: updateClientProfileSchema }) body: unknown) { return updateClientProfile(actorId, engagementId, id, body); }
  @Post('clients/:id/parent')
  @ApiCreatedResponse({ standardSchema: commercialClientParentResultSchema })
  @SerializeOptions({ schema: commercialClientParentResultSchema })
  setParent(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: setClientParentSchema }) body: unknown) { return setClientParent(actorId, engagementId, id, body); }
  @Get('contacts')
  @ApiOkResponse({ standardSchema: commercialContactListSchema })
  @SerializeOptions({ schema: commercialContactListSchema })
  contacts(@Param('engagementId') engagementId: string) { return listContacts(engagementId); }
  @Post('contacts')
  @ApiCreatedResponse({ standardSchema: commercialContactCreatedResultSchema })
  @SerializeOptions({ schema: commercialContactCreatedResultSchema })
  addContact(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createContactSchema }) body: unknown) { return addContactRecord(actorId, engagementId, body); }
  @Get('routing/:category')
  @ApiOkResponse({ standardSchema: commercialContactSnapshotSchema })
  @SerializeOptions({ schema: commercialContactSnapshotSchema })
  routing(@Param('engagementId') engagementId: string, @Param('category') category: Parameters<typeof resolveRecipient>[1]) { return resolveRecipient(engagementId, category); }
  @Get('leads')
  @ApiOkResponse({ standardSchema: commercialLeadListSchema })
  @SerializeOptions({ schema: commercialLeadListSchema })
  leads(@Param('engagementId') engagementId: string) { return listLeads(engagementId); }
  @Post('leads')
  @ApiCreatedResponse({ standardSchema: commercialLeadCreatedResultSchema })
  @SerializeOptions({ schema: commercialLeadCreatedResultSchema })
  createLead(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createLeadSchema }) body: unknown) { return createLeadRecord(actorId, engagementId, body); }
  @Post('leads/:id/profile')
  @ApiCreatedResponse({ standardSchema: commercialLeadProfileResultSchema })
  @SerializeOptions({ schema: commercialLeadProfileResultSchema })
  profileLead(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: profileLeadSchema }) body: unknown) { return profileLeadRecord(actorId, engagementId, id, body); }
  @Post('leads/:id/advance')
  @ApiCreatedResponse({ standardSchema: commercialLeadAdvanceResultSchema })
  @SerializeOptions({ schema: commercialLeadAdvanceResultSchema })
  advanceLead(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string) { return advanceLeadRecord(actorId, engagementId, id); }
  @Get('identity')
  @ApiOkResponse({ standardSchema: engagementIdentitySchema })
  @SerializeOptions({ schema: engagementIdentitySchema })
  identity(@Param('engagementId') engagementId: string) { return engagementIdentity(engagementId); }
  @Post('engagements')
  @ApiCreatedResponse({ standardSchema: createEngagementSchema })
  createEngagement(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createEngagementSchema }) body: unknown) { return createEngagement(actorId, engagementId, body); }
  @Post('acceptance-case')
  @ApiCreatedResponse({ standardSchema: acceptanceCaseCreatedSchema })
  @SerializeOptions({ schema: acceptanceCaseCreatedSchema })
  createCase(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createAcceptanceCaseSchema }) body: unknown) { return createAcceptanceCase(actorId, engagementId, body); }
  @Post('acceptance-case/answers')
  @ApiCreatedResponse({ standardSchema: acceptanceReviewStateSchema })
  @SerializeOptions({ schema: acceptanceReviewStateSchema })
  answer(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: recordAcceptanceAnswerSchema }) body: unknown) { return recordAcceptanceAnswer(actorId, engagementId, body); }
  @Post('acceptance-case/complete')
  @ApiCreatedResponse({ standardSchema: acceptanceReviewStateSchema })
  @SerializeOptions({ schema: acceptanceReviewStateSchema })
  complete(@ReqActor() actorId: string, @Param('engagementId') engagementId: string) { return completeAcceptanceReview(actorId, engagementId); }
  @Post('acceptance-case/clear')
  @ApiCreatedResponse({ standardSchema: acceptanceClearanceSchema })
  @SerializeOptions({ schema: acceptanceClearanceSchema })
  clear(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: clearAcceptanceCaseSchema }) body: unknown) { return clearAcceptanceCase(actorId, engagementId, body); }
}
