import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { approveMaterialitySchema, calculateMaterialitySchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveMaterialityAssessment, calculateMaterialityAssessment, latestMaterialityAssessment, listMaterialityAssessments } from './materiality-service.js';

@ApiTags('Governance') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/materiality')
export class MaterialityController {
  @Get() list(@Param('engagementId') engagementId: string) { return listMaterialityAssessments(engagementId); }
  @Get('latest') latest(@Param('engagementId') engagementId: string) { return latestMaterialityAssessment(engagementId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(calculateMaterialitySchema) as any })
  calculate(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return calculateMaterialityAssessment(actorId, engagementId, body); }
  @Post(':assessmentId/approve') @ApiBody({ schema: z.toJSONSchema(approveMaterialitySchema) as any })
  approve(@Param('engagementId') engagementId: string, @Param('assessmentId') assessmentId: string, @ReqActor() actorId: string, @Body() body: unknown) { return approveMaterialityAssessment(actorId, engagementId, assessmentId, body); }
}
