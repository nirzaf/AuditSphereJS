import { Body, Controller, Get, Param, Patch, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, correctPracticeTimeEntrySchema, practiceTimeCorrectionResultSchema, practiceTimeEntriesQuerySchema, practiceTimeEntriesSchema,
  practiceTimeEntryViewSchema, recordPracticeTimeEntrySchema,
} from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { correctPracticeTimeEntry, listPracticeTimeEntries, recordPracticeTimeEntry } from './time-entries.js';

/** T140: a staff member records, lists and corrects their own daily hours on an engagement they are assigned to. */
@ApiTags('Practice time entries')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UseGuards(InternalGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/practice/time-entries')
export class PracticeTimeEntryController {
  @Get()
  @ApiOkResponse({ standardSchema: practiceTimeEntriesSchema })
  @SerializeOptions({ schema: practiceTimeEntriesSchema })
  list(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Query({ schema: practiceTimeEntriesQuerySchema }) query: unknown) {
    return listPracticeTimeEntries(actorId, engagementId, query);
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: practiceTimeEntryViewSchema })
  @SerializeOptions({ schema: practiceTimeEntryViewSchema })
  record(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: recordPracticeTimeEntrySchema }) body: unknown) {
    return recordPracticeTimeEntry(actorId, engagementId, body);
  }

  @Patch(':id')
  @ApiOkResponse({ standardSchema: practiceTimeCorrectionResultSchema })
  @SerializeOptions({ schema: practiceTimeCorrectionResultSchema })
  correct(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: correctPracticeTimeEntrySchema }) body: unknown) {
    return correctPracticeTimeEntry(actorId, engagementId, id, body);
  }
}
