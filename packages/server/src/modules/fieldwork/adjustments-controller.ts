import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  adjustedBalancesSchema, adjustmentCreatedResultSchema, adjustmentJournalDetailSchema, adjustmentJournalSchema,
  adjustmentPostedResultSchema, adjustmentReversedResultSchema, apiProblemSchema, createAdjustmentJournalSchema,
  paginationQuerySchema, postAdjustmentJournalSchema, reverseAdjustmentJournalSchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { adjustedBalances, adjustmentJournalDetail, createAdjustmentJournal, listAdjustmentJournals, postAdjustmentJournal, reverseAdjustmentJournal } from './adjustments.js';
import { toAdjustmentJournalDetailView, toAdjustmentJournalView } from './adjustment-response.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/adjustments')
export class AdjustmentController {
  @Get()
  @ApiOkResponse({ standardSchema: adjustmentJournalSchema, isArray: true })
  @SerializeOptions({ schema: adjustmentJournalSchema })
  async list(@Param('engagementId') engagementId: string, @Query('status') status: string | undefined, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) {
    const journals = await listAdjustmentJournals(engagementId, status ? { status } : {}, page);
    return journals.map(toAdjustmentJournalView);
  }

  @Get('adjusted-balances')
  @ApiOkResponse({ standardSchema: adjustedBalancesSchema })
  @SerializeOptions({ schema: adjustedBalancesSchema })
  async adjusted(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    const balances = await adjustedBalances(actorId, engagementId);
    return {
      publicationId: balances.publicationId, publicationSequence: balances.publicationSequence, currency: balances.currency,
      journalCount: balances.journalCount, items: balances.items, totals: balances.totals,
    };
  }

  @Get(':journalId')
  @ApiOkResponse({ standardSchema: adjustmentJournalDetailSchema })
  @SerializeOptions({ schema: adjustmentJournalDetailSchema })
  async detail(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string) {
    return toAdjustmentJournalDetailView(await adjustmentJournalDetail(engagementId, journalId));
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: adjustmentCreatedResultSchema })
  @SerializeOptions({ schema: adjustmentCreatedResultSchema })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: createAdjustmentJournalSchema }) body: unknown) {
    return createAdjustmentJournal(actorId, engagementId, body);
  }

  @Post(':journalId/post')
  @ApiCreatedResponse({ standardSchema: adjustmentPostedResultSchema })
  @SerializeOptions({ schema: adjustmentPostedResultSchema })
  post(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string, @ReqActor() actorId: string, @Body({ schema: postAdjustmentJournalSchema }) body: unknown) {
    return postAdjustmentJournal(actorId, engagementId, journalId, body);
  }

  @Post(':journalId/reverse')
  @ApiCreatedResponse({ standardSchema: adjustmentReversedResultSchema })
  @SerializeOptions({ schema: adjustmentReversedResultSchema })
  reverse(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string, @ReqActor() actorId: string, @Body({ schema: reverseAdjustmentJournalSchema }) body: unknown) {
    return reverseAdjustmentJournal(actorId, engagementId, journalId, body);
  }
}
