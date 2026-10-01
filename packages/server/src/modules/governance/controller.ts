import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { lifecycleCommandSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { applyLifecycleCommand, lifecycleHistory } from './lifecycle.js';

@ApiTags('Governance') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/lifecycle')
export class GovernanceController {
  @Get() history(@Param('engagementId') engagementId: string) { return lifecycleHistory(engagementId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(lifecycleCommandSchema) as any })
  command(@Param('engagementId') engagementId: string, @Req() req: { actorId: string }, @Body() body: unknown) {
    return applyLifecycleCommand(engagementId, req.actorId, body);
  }
}
