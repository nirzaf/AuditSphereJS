import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { publishSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { latestPublication, publicationDetail, publishBalances } from './publication.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/publications')
export class PublicationController {
  @Get('latest') latest(@Param('engagementId') engagementId: string) { return latestPublication(engagementId); }
  @Get(':publicationId') detail(@Param('engagementId') engagementId: string, @Param('publicationId') publicationId: string) { return publicationDetail(engagementId, publicationId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(publishSchema) as any })
  publish(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return publishBalances(engagementId, actorId, body); }
}
