import { Controller, Get, NotFoundException, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InternalIdentityGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import { prepareDocumentVersionDownload } from './document-downloads.js';

type DownloadReply = {
  raw: { once(event: 'finish' | 'close', listener: () => void): unknown };
  header(name: string, value: string): unknown;
};

@ApiTags('Documents')
@ApiBearerAuth()
@ApiDefaultResponse({ description: 'The document is missing or the active principal has no current access to it.' })
@Controller('documents/:documentId/versions/:versionId/download')
@UseGuards(InternalIdentityGuard)
export class DocumentDownloadsController {
  @Get()
  @ApiOkResponse({
    description: 'Verified immutable document bytes.',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  async download(@ReqActor() actorId: string, @Param('documentId') documentId: string, @Param('versionId') versionId: string, @Res({ passthrough: true }) reply: DownloadReply) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId) || !/^[0-9a-f-]{36}$/i.test(versionId)) throw new NotFoundException('Document version not found');
    const prepared = await prepareDocumentVersionDownload(actorId, documentId, versionId);
    reply.header('Content-Disposition', prepared.disposition);
    reply.header('Content-Length', String(prepared.sizeBytes));
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Digest', `sha-256=${Buffer.from(prepared.sha256, 'hex').toString('base64')}`);
    reply.header('X-AuditSphere-Document-Version', String(prepared.sequence));
    reply.header('X-AuditSphere-Document-SHA256', prepared.sha256);

    let outcomeRecorded = false;
    const recordOutcome = (finished: boolean) => {
      if (outcomeRecorded) return;
      outcomeRecorded = true;
      void prepared.finish(finished).catch(() => console.error('Document download outcome audit write failed'));
    };
    reply.raw.once('finish', () => recordOutcome(true));
    reply.raw.once('close', () => recordOutcome(false));
    prepared.stream.once('error', () => recordOutcome(false));
    return new StreamableFile(prepared.stream, { type: 'application/octet-stream', disposition: prepared.disposition, length: prepared.sizeBytes });
  }
}
