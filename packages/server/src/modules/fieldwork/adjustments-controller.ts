import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createAdjustmentJournalSchema, postAdjustmentJournalSchema, reverseAdjustmentJournalSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { adjustedBalances, adjustmentJournalDetail, createAdjustmentJournal, listAdjustmentJournals, postAdjustmentJournal, reverseAdjustmentJournal } from './adjustments.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/adjustments')
export class AdjustmentController {
  @Get() list(@Param('engagementId') engagementId: string, @Query('status') status?: string) { return listAdjustmentJournals(engagementId, status ? { status } : {}); }
  @Get('adjusted-balances') adjusted(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) { return adjustedBalances(actorId, engagementId); }
  @Get(':journalId') detail(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string) { return adjustmentJournalDetail(engagementId, journalId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(createAdjustmentJournalSchema) as any })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return createAdjustmentJournal(actorId, engagementId, body); }
  @Post(':journalId/post') @ApiBody({ schema: z.toJSONSchema(postAdjustmentJournalSchema) as any })
  post(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string, @ReqActor() actorId: string, @Body() body: unknown) { return postAdjustmentJournal(actorId, engagementId, journalId, body); }
  @Post(':journalId/reverse') @ApiBody({ schema: z.toJSONSchema(reverseAdjustmentJournalSchema) as any })
  reverse(@Param('engagementId') engagementId: string, @Param('journalId') journalId: string, @ReqActor() actorId: string, @Body() body: unknown) { return reverseAdjustmentJournal(actorId, engagementId, journalId, body); }
}
