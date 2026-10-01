import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalGuard } from './auth.js';
import { captureAuditCheckpoint, verifyAuditChain } from './audit-chain.js';

@ApiTags('Audit') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/audit')
export class AuditController {
  @Get('checkpoint') checkpoint(@Param('engagementId') engagementId: string) { return captureAuditCheckpoint(engagementId); }
  @Get('verify') verify(@Param('engagementId') engagementId: string) { return verifyAuditChain(engagementId); }
}
