import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, approveMappingSchema, approveTaxonomySchema, createTaxonomySchema, mappingApprovalResultSchema,
  mappingSuggestionsSchema, paginationQuerySchema, taxonomyApprovedResultSchema, taxonomyCreatedResultSchema, taxonomyViewSchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveImportMapping, approveTaxonomyVersion, createTaxonomyVersion, listTaxonomies, suggestMappings } from './taxonomy.js';
import { toMappingSuggestionsView, toTaxonomyView } from './taxonomy-response.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId')
export class TaxonomyController {
  @Get('taxonomies')
  @ApiOkResponse({ standardSchema: taxonomyViewSchema, isArray: true })
  @SerializeOptions({ schema: taxonomyViewSchema })
  async list(@Param('engagementId') engagementId: string, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) {
    const versions = await listTaxonomies(engagementId, page);
    return versions.map(toTaxonomyView);
  }

  @Post('taxonomies')
  @ApiCreatedResponse({ standardSchema: taxonomyCreatedResultSchema })
  @SerializeOptions({ schema: taxonomyCreatedResultSchema })
  create(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: createTaxonomySchema }) body: unknown) {
    return createTaxonomyVersion(actorId, engagementId, body);
  }

  @Post('taxonomies/:taxonomyVersionId/approve')
  @ApiCreatedResponse({ standardSchema: taxonomyApprovedResultSchema })
  @SerializeOptions({ schema: taxonomyApprovedResultSchema })
  approve(@Param('engagementId') engagementId: string, @Param('taxonomyVersionId') taxonomyVersionId: string, @ReqActor() actorId: string, @Body({ schema: approveTaxonomySchema }) body: unknown) {
    return approveTaxonomyVersion(actorId, engagementId, taxonomyVersionId, body);
  }

  @Post('imports/:importId/mapping-approval')
  @ApiCreatedResponse({ standardSchema: mappingApprovalResultSchema })
  @SerializeOptions({ schema: mappingApprovalResultSchema })
  approveMapping(@Param('engagementId') engagementId: string, @Param('importId') importId: string, @ReqActor() actorId: string, @Body({ schema: approveMappingSchema }) body: unknown) {
    return approveImportMapping(actorId, engagementId, importId, body);
  }

  @Get('imports/:importId/suggestions')
  @ApiOkResponse({ standardSchema: mappingSuggestionsSchema })
  @SerializeOptions({ schema: mappingSuggestionsSchema })
  async suggestions(@Param('engagementId') engagementId: string, @Param('importId') importId: string, @ReqActor() actorId: string, @Query('taxonomyVersionId') taxonomyVersionId?: string) {
    return toMappingSuggestionsView(await suggestMappings(actorId, engagementId, importId, taxonomyVersionId ? { taxonomyVersionId } : {}));
  }
}
