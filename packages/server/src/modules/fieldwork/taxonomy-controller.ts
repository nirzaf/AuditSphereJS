import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { approveMappingSchema, createTaxonomySchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveImportMapping, approveTaxonomyVersion, createTaxonomyVersion, listTaxonomies } from './taxonomy.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId')
export class TaxonomyController {
  @Get('taxonomies') list(@Param('engagementId') engagementId: string) { return listTaxonomies(engagementId); }
  @Post('taxonomies') @ApiBody({ schema: z.toJSONSchema(createTaxonomySchema) as any })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return createTaxonomyVersion(actorId, engagementId, body); }
  @Post('taxonomies/:taxonomyVersionId/approve')
  approve(@Param('engagementId') engagementId: string, @Param('taxonomyVersionId') taxonomyVersionId: string, @ReqActor() actorId: string) { return approveTaxonomyVersion(actorId, engagementId, taxonomyVersionId); }
  @Post('imports/:importId/mapping-approval') @ApiBody({ schema: z.toJSONSchema(approveMappingSchema) as any })
  approveMapping(@Param('engagementId') engagementId: string, @Param('importId') importId: string, @ReqActor() actorId: string, @Body() body: unknown) { return approveImportMapping(actorId, engagementId, importId, body); }
}
