import { Controller, Get, Param, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, practiceFirmProfitLossDetailQuerySchema, practiceFirmProfitLossDetailSchema, practiceFirmProfitLossQuerySchema, practiceFirmProfitLossSchema,
  practiceFirmTrialBalanceDetailQuerySchema, practiceFirmTrialBalanceDetailSchema, practiceFirmTrialBalanceQuerySchema, practiceFirmTrialBalanceSchema, practiceRateAdministrationSchema,
} from '@auditsphere/contracts';
import type { PracticeFirmProfitLossDetailQuery, PracticeFirmProfitLossQuery, PracticeFirmTrialBalanceDetailQuery, PracticeFirmTrialBalanceQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { firmProfitLossAccountForActor, firmProfitLossForActor } from './profit-loss.js';
import { firmTrialBalanceAccountForActor, firmTrialBalanceForActor } from './trial-balance.js';
import { listPracticeRateAdministrationForActor } from './rates.js';
import { toPracticeRateAdministrationView } from './practice-response.js';

/**
 * D24 (DN-11): firm-level Practice reads. These routes name no engagement and are authorized by a firm-wide grant.
 * The engagement-prefixed reads remain available and are marked deprecated. Firm-level writes still use the
 * engagement path, because command receipts and audit events are anchored to an engagement.
 */
@ApiTags('Practice firm')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UseGuards(InternalGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('firm/practice')
export class PracticeFirmController {
  @Get('reports/trial-balance')
  @ApiOkResponse({ standardSchema: practiceFirmTrialBalanceSchema })
  @SerializeOptions({ schema: practiceFirmTrialBalanceSchema })
  trialBalance(@ReqActor() actorId: string, @Query({ schema: practiceFirmTrialBalanceQuerySchema }) query: PracticeFirmTrialBalanceQuery) {
    return firmTrialBalanceForActor(actorId, query);
  }

  @Get('reports/trial-balance/accounts/:accountId')
  @ApiOkResponse({ standardSchema: practiceFirmTrialBalanceDetailSchema })
  @SerializeOptions({ schema: practiceFirmTrialBalanceDetailSchema })
  trialBalanceAccount(@ReqActor() actorId: string, @Param('accountId') accountId: string, @Query({ schema: practiceFirmTrialBalanceDetailQuerySchema }) query: PracticeFirmTrialBalanceDetailQuery) {
    return firmTrialBalanceAccountForActor(actorId, accountId, query);
  }

  @Get('reports/profit-loss')
  @ApiOkResponse({ standardSchema: practiceFirmProfitLossSchema })
  @SerializeOptions({ schema: practiceFirmProfitLossSchema })
  profitLoss(@ReqActor() actorId: string, @Query({ schema: practiceFirmProfitLossQuerySchema }) query: PracticeFirmProfitLossQuery) {
    return firmProfitLossForActor(actorId, query);
  }

  @Get('reports/profit-loss/accounts/:accountId')
  @ApiOkResponse({ standardSchema: practiceFirmProfitLossDetailSchema })
  @SerializeOptions({ schema: practiceFirmProfitLossDetailSchema })
  profitLossAccount(@ReqActor() actorId: string, @Param('accountId') accountId: string, @Query({ schema: practiceFirmProfitLossDetailQuerySchema }) query: PracticeFirmProfitLossDetailQuery) {
    return firmProfitLossAccountForActor(actorId, accountId, query);
  }

  @Get('rate-cards')
  @ApiOkResponse({ standardSchema: practiceRateAdministrationSchema })
  @SerializeOptions({ schema: practiceRateAdministrationSchema })
  async rateCards(@ReqActor() actorId: string) {
    return toPracticeRateAdministrationView(await listPracticeRateAdministrationForActor(actorId));
  }
}
