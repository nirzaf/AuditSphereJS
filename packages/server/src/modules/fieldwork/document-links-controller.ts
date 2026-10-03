import { Body, Controller, Get, Param, Post, Query, Req, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiProblemSchema, documentLinkCreateSchema, documentLinkRevokeSchema, documentLinkResultSchema, documentLinkRevokedSchema, documentLinksQuerySchema, documentLinksSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { linkDocument, listDocumentLinks, revokeDocumentLink } from './document-links.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/document-links')
export class DocumentLinksController {
  @Get()
  @ApiOkResponse({ standardSchema: documentLinksSchema })
  @SerializeOptions({ schema: documentLinksSchema })
  list(@Param('engagementId') engagementId: string, @Req() req: any, @Query({ schema: documentLinksQuerySchema }) query: { targetImportId?: string }) {
    return listDocumentLinks(engagementId, req.actorId, query.targetImportId);
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: documentLinkResultSchema })
  @SerializeOptions({ schema: documentLinkResultSchema })
  create(@Param('engagementId') engagementId: string, @Req() req: any, @Body({ schema: documentLinkCreateSchema }) body: unknown) {
    return linkDocument(engagementId, req.actorId, body);
  }

  @Post(':id/revoke')
  @ApiCreatedResponse({ standardSchema: documentLinkRevokedSchema })
  @SerializeOptions({ schema: documentLinkRevokedSchema })
  revoke(@Param('engagementId') engagementId: string, @Param('id') id: string, @Req() req: any, @Body({ schema: documentLinkRevokeSchema }) body: unknown) {
    return revokeDocumentLink(engagementId, id, req.actorId, body);
  }
}
