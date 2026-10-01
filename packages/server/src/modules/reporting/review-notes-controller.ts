import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { raiseReviewNoteSchema, resolveReviewNoteSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { listReviewNotes, raiseReviewNote, resolveReviewNote, reviewSummary } from './review-notes.js';

@ApiTags('Reporting') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/review-notes')
export class ReviewNoteController {
  @Get() list(@Param('engagementId') engagementId: string, @Query('status') status?: string) { return listReviewNotes(engagementId, status ? { status } : {}); }
  @Get('summary') summary(@Param('engagementId') engagementId: string) { return reviewSummary(engagementId); }
  @Post() @ApiBody({ schema: z.toJSONSchema(raiseReviewNoteSchema) as any })
  raise(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body() body: unknown) { return raiseReviewNote(actorId, engagementId, body); }
  @Post(':noteId/resolve') @ApiBody({ schema: z.toJSONSchema(resolveReviewNoteSchema) as any })
  resolve(@Param('engagementId') engagementId: string, @Param('noteId') noteId: string, @ReqActor() actorId: string, @Body() body: unknown) { return resolveReviewNote(actorId, engagementId, noteId, body); }
}
