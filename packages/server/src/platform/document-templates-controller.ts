import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  BadRequestException, Body, Controller, Get, Param, Post, Put, Req, Res, SerializeOptions,
  StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, StreamableFile, UseGuards, UseInterceptors, UsePipes,
} from '@nestjs/common';
import {
  apiProblemSchema, approvedAssetUploadInitiatedSchema, approvedAssetUploadResultSchema,
  createApprovedAssetSchema, createApprovedAssetVersionSchema, createDocumentTemplateSchema,
  createDocumentTemplateVersionSchema, documentTemplateActivationSchema, documentTemplateCatalogSchema,
  documentTemplateCreatedSchema, documentTemplateVersionCreatedSchema,
  documentTemplateDecisionResultSchema, documentTemplateDecisionSchema, documentTemplatePreviewRequestSchema,
  documentTemplatePreviewSchema, documentTemplateStateResultSchema,
} from '@auditsphere/contracts';
import { InternalGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import {
  appendDocumentTemplateVersion, changeDocumentTemplateActivation, createDocumentTemplate,
  decideApprovedAsset, decideDocumentTemplateVersion, initiateApprovedAsset, initiateApprovedAssetVersion,
  listDocumentTemplateCatalog, prepareApprovedAssetDownload, previewDocumentTemplate, receiveApprovedAsset,
} from './document-templates.js';
import type { UploadFilePart } from './document-uploads.js';

type MultipartRequest = { file: (options?: { limits?: { fileSize?: number; files?: number; fields?: number; parts?: number }; throwFileSizeLimit?: boolean }) => Promise<UploadFilePart | undefined> };
type DownloadReply = { raw: { once(event: 'finish' | 'close', listener: () => void): unknown }; header(name: string, value: string): unknown };

@ApiTags('Document templates')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@Controller('engagements/:engagementId/document-templates')
@UseGuards(InternalGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class DocumentTemplatesController {
  @Get()
  @ApiOkResponse({ standardSchema: documentTemplateCatalogSchema })
  @SerializeOptions({ schema: documentTemplateCatalogSchema })
  catalog(@ReqActor() actorId: string, @Param('engagementId') engagementId: string) {
    return listDocumentTemplateCatalog(actorId, engagementId);
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: documentTemplateCreatedSchema })
  @SerializeOptions({ schema: documentTemplateCreatedSchema })
  create(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createDocumentTemplateSchema }) body: unknown) {
    return createDocumentTemplate(actorId, engagementId, body);
  }

  @Post(':templateId/versions')
  @ApiCreatedResponse({ standardSchema: documentTemplateVersionCreatedSchema })
  @SerializeOptions({ schema: documentTemplateVersionCreatedSchema })
  appendVersion(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('templateId') templateId: string, @Body({ schema: createDocumentTemplateVersionSchema }) body: unknown) {
    return appendDocumentTemplateVersion(actorId, engagementId, templateId, body);
  }

  @Post(':templateId/versions/:versionId/decision')
  @ApiCreatedResponse({ standardSchema: documentTemplateDecisionResultSchema })
  @SerializeOptions({ schema: documentTemplateDecisionResultSchema })
  decideVersion(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('templateId') templateId: string, @Param('versionId') versionId: string, @Body({ schema: documentTemplateDecisionSchema }) body: unknown) {
    return decideDocumentTemplateVersion(actorId, engagementId, templateId, versionId, body);
  }

  @Post(':templateId/activation')
  @ApiCreatedResponse({ standardSchema: documentTemplateStateResultSchema })
  @SerializeOptions({ schema: documentTemplateStateResultSchema })
  activation(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('templateId') templateId: string, @Body({ schema: documentTemplateActivationSchema }) body: unknown) {
    return changeDocumentTemplateActivation(actorId, engagementId, templateId, body);
  }

  @Post(':templateId/versions/:versionId/preview')
  @ApiOkResponse({ standardSchema: documentTemplatePreviewSchema })
  @SerializeOptions({ schema: documentTemplatePreviewSchema })
  preview(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('templateId') templateId: string, @Param('versionId') versionId: string, @Body({ schema: documentTemplatePreviewRequestSchema }) body: unknown) {
    return previewDocumentTemplate(actorId, engagementId, templateId, versionId, body);
  }

  @Post('assets')
  @ApiCreatedResponse({ standardSchema: approvedAssetUploadInitiatedSchema })
  @SerializeOptions({ schema: approvedAssetUploadInitiatedSchema })
  initiateAsset(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createApprovedAssetSchema }) body: unknown) {
    return initiateApprovedAsset(actorId, engagementId, body);
  }

  @Post('assets/:assetId/versions')
  @ApiCreatedResponse({ standardSchema: approvedAssetUploadInitiatedSchema })
  @SerializeOptions({ schema: approvedAssetUploadInitiatedSchema })
  initiateAssetVersion(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('assetId') assetId: string, @Body({ schema: createApprovedAssetVersionSchema }) body: unknown) {
    return initiateApprovedAssetVersion(actorId, engagementId, assetId, body);
  }

  @Put('assets/:assetId/versions/:versionId/content')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ standardSchema: approvedAssetUploadResultSchema })
  @SerializeOptions({ schema: approvedAssetUploadResultSchema })
  async uploadAsset(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('assetId') assetId: string, @Param('versionId') versionId: string, @Req() request: MultipartRequest) {
    const part = await request.file({ limits: { fileSize: 5_000_000, files: 1, fields: 0, parts: 1 }, throwFileSizeLimit: false });
    if (!part) throw new BadRequestException('A single approved asset file is required.');
    return receiveApprovedAsset(actorId, engagementId, assetId, versionId, part);
  }

  @Post('assets/:assetId/versions/:versionId/decision')
  @ApiCreatedResponse({ standardSchema: documentTemplateDecisionResultSchema })
  @SerializeOptions({ schema: documentTemplateDecisionResultSchema })
  decideAsset(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('assetId') assetId: string, @Param('versionId') versionId: string, @Body({ schema: documentTemplateDecisionSchema }) body: unknown) {
    return decideApprovedAsset(actorId, engagementId, assetId, versionId, body);
  }

  @Get('assets/:assetId/versions/:versionId/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description: 'Exact approved asset bytes; the partner catalog permission is required.',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  async assetContent(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('assetId') assetId: string, @Param('versionId') versionId: string, @Res({ passthrough: true }) reply: DownloadReply) {
    const prepared = await prepareApprovedAssetDownload(actorId, engagementId, assetId, versionId);
    reply.header('Content-Disposition', `attachment; filename="${prepared.filename.replace(/["\\\r\n]/g, '_')}"`);
    reply.header('Content-Length', String(prepared.sizeBytes));
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-AuditSphere-Asset-SHA256', prepared.sha256);
    let cleaned = false;
    const cleanup = () => { if (!cleaned) { cleaned = true; void prepared.cleanup().catch(() => undefined); } };
    reply.raw.once('finish', cleanup);
    reply.raw.once('close', cleanup);
    prepared.stream.once('error', cleanup);
    return new StreamableFile(prepared.stream, { type: 'application/octet-stream', disposition: 'attachment', length: prepared.sizeBytes });
  }
}
