import { Body, Controller, Get, Param, Post, Req, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors, UsePipes, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiProblemSchema, lifecycleCommandResultSchema, lifecycleCommandSchema, lifecycleGatesSchema, lifecycleHistorySchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { applyLifecycleCommand, lifecycleGates, lifecycleHistory } from './lifecycle.js';
import { toLifecycleHistoryView } from './lifecycle-response.js';

@ApiTags('Governance') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId')
export class GovernanceController {
  @Get('lifecycle')
  @ApiOkResponse({ standardSchema: lifecycleHistorySchema })
  @SerializeOptions({ schema: lifecycleHistorySchema })
  async history(@Param('engagementId') engagementId: string) { return toLifecycleHistoryView(await lifecycleHistory(engagementId)); }

  @Get('gates')
  @ApiOkResponse({ standardSchema: lifecycleGatesSchema })
  @SerializeOptions({ schema: lifecycleGatesSchema })
  gates(@Param('engagementId') engagementId: string) { return lifecycleGates(engagementId); }

  @Post('lifecycle')
  @ApiCreatedResponse({ standardSchema: lifecycleCommandResultSchema })
  @SerializeOptions({ schema: lifecycleCommandResultSchema })
  command(@Param('engagementId') engagementId: string, @Req() req: { actorId: string }, @Body({ schema: lifecycleCommandSchema }) body: unknown) {
    return applyLifecycleCommand(engagementId, req.actorId, body);
  }
}
