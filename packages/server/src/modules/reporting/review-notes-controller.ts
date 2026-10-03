import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors, UsePipes, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, paginationQuerySchema, raiseReviewNoteSchema, resolveReviewNoteSchema,
  reviewNoteResultSchema, reviewNoteSchema, reviewSummarySchema,
} from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { listReviewNotes, raiseReviewNote, resolveReviewNote, reviewSummary } from './review-notes.js';
import { toReviewNoteView } from './review-note-response.js';

@ApiTags('Reporting') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/review-notes')
export class ReviewNoteController {
  @Get()
  @ApiOkResponse({ standardSchema: reviewNoteSchema, isArray: true })
  @SerializeOptions({ schema: reviewNoteSchema })
  async list(@Param('engagementId') engagementId: string, @Query('status') status: string | undefined, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) {
    const notes = await listReviewNotes(engagementId, status ? { status } : {}, page);
    return notes.map(toReviewNoteView);
  }

  @Get('summary')
  @ApiOkResponse({ standardSchema: reviewSummarySchema })
  @SerializeOptions({ schema: reviewSummarySchema })
  async summary(@Param('engagementId') engagementId: string) {
    const { open, resolved, total } = await reviewSummary(engagementId);
    return { open, resolved, total };
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: reviewNoteResultSchema })
  @SerializeOptions({ schema: reviewNoteResultSchema })
  async raise(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: raiseReviewNoteSchema }) body: unknown) {
    return toReviewNoteView(await raiseReviewNote(actorId, engagementId, body));
  }

  @Post(':noteId/resolve')
  @ApiCreatedResponse({ standardSchema: reviewNoteResultSchema })
  @SerializeOptions({ schema: reviewNoteResultSchema })
  async resolve(@Param('engagementId') engagementId: string, @Param('noteId') noteId: string, @ReqActor() actorId: string, @Body({ schema: resolveReviewNoteSchema }) body: unknown) {
    return toReviewNoteView(await resolveReviewNote(actorId, engagementId, noteId, body));
  }
}
