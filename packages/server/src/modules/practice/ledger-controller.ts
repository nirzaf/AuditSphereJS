import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeJournal, postPracticeJournal, reversePracticeJournal, closePracticePeriod, practiceLedger } from './ledger.js';

@ApiTags('Practice ledger') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/practice')
export class PracticeLedgerController {
  @Get() read(@ReqActor() actorId: string, @Param('engagementId') engagementId: string) { return practiceLedger(actorId, engagementId); }
  @Post('posting-policy') policy(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body() body: unknown) { return approveFirmPostingPolicy(actorId, engagementId, body); }
  @Post('accounts') account(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body() body: unknown) { return createPracticeAccount(actorId, engagementId, body); }
  @Post('periods') period(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body() body: unknown) { return createPracticePeriod(actorId, engagementId, body); }
  @Post('journals') journal(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body() body: unknown) { return createPracticeJournal(actorId, engagementId, body); }
  @Post('journals/:id/post') post(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body() body: unknown) { return postPracticeJournal(actorId, engagementId, id, body); }
  @Post('journals/:id/reverse') reverse(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body() body: unknown) { return reversePracticeJournal(actorId, engagementId, id, body); }
  @Post('periods/:id/close') close(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body() body: unknown) { return closePracticePeriod(actorId, engagementId, id, body); }
}
