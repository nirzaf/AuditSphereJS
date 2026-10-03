import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Param, Post, Put, Req, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes, BadRequestException } from '@nestjs/common';
import { apiProblemSchema, documentUploadFinalizedSchema, documentUploadInitSchema, documentUploadReceivedSchema, documentUploadSessionSchema } from '@auditsphere/contracts';
import { InternalIdentityGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import { finalizeDocumentUpload, getDocumentUploadSession, initiateDocumentUpload, receiveDocumentUpload, type UploadFilePart } from './document-uploads.js';

type MultipartRequest = { file: (options?: { limits?: { fileSize?: number; files?: number; fields?: number; parts?: number }; throwFileSizeLimit?: boolean }) => Promise<UploadFilePart | undefined> };

@ApiTags('Documents')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@Controller('documents/uploads')
@UseGuards(InternalIdentityGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class DocumentUploadsController {
  @Post()
  @ApiCreatedResponse({ standardSchema: documentUploadSessionSchema })
  @SerializeOptions({ schema: documentUploadSessionSchema })
  initiate(@ReqActor() actorId: string, @Body({ schema: documentUploadInitSchema }) body: unknown) {
    return initiateDocumentUpload(actorId, body);
  }

  @Put(':sessionId/content')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ standardSchema: documentUploadReceivedSchema })
  @SerializeOptions({ schema: documentUploadReceivedSchema })
  async upload(@ReqActor() actorId: string, @Param('sessionId') sessionId: string, @Req() request: MultipartRequest) {
    const part = await request.file({ limits: { fileSize: 15_000_000, files: 1, fields: 0, parts: 1 }, throwFileSizeLimit: false });
    if (!part) throw new BadRequestException('A single file part is required.');
    return receiveDocumentUpload(actorId, sessionId, part);
  }

  @Post(':sessionId/finalize')
  @ApiCreatedResponse({ standardSchema: documentUploadFinalizedSchema })
  @SerializeOptions({ schema: documentUploadFinalizedSchema })
  finalize(@ReqActor() actorId: string, @Param('sessionId') sessionId: string) {
    return finalizeDocumentUpload(actorId, sessionId);
  }

  @Post(':sessionId/check')
  @ApiOkResponse({ standardSchema: documentUploadSessionSchema })
  @SerializeOptions({ schema: documentUploadSessionSchema })
  check(@ReqActor() actorId: string, @Param('sessionId') sessionId: string) {
    return getDocumentUploadSession(actorId, sessionId);
  }
}
