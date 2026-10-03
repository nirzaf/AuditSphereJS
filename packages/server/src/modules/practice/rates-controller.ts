import { ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { apiProblemSchema, createPracticeRateCardSchema, createPracticeStaffGradeAssignmentSchema, practiceRateAdministrationSchema, practiceRateCardViewSchema, practiceStaffGradeAssignmentViewSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { assignPracticeStaffGrade, listPracticeRateAdministration, schedulePracticeRateCard } from './rates.js';
import { toPracticeRateAdministrationView, toPracticeRateCardView, toPracticeStaffGradeAssignmentView } from './practice-response.js';

@ApiTags('Practice rates')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UseGuards(InternalGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/practice')
export class PracticeRatesController {
  @Get('rate-cards')
  @ApiOkResponse({ standardSchema: practiceRateAdministrationSchema })
  @SerializeOptions({ schema: practiceRateAdministrationSchema })
  async read(@ReqActor() actorId: string, @Param('engagementId') engagementId: string) {
    return toPracticeRateAdministrationView(await listPracticeRateAdministration(actorId, engagementId));
  }

  @Post('rate-cards')
  @ApiCreatedResponse({ standardSchema: practiceRateCardViewSchema })
  @SerializeOptions({ schema: practiceRateCardViewSchema })
  async schedule(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createPracticeRateCardSchema }) body: unknown) {
    return toPracticeRateCardView(await schedulePracticeRateCard(actorId, engagementId, body));
  }

  @Post('staff-grade-assignments')
  @ApiCreatedResponse({ standardSchema: practiceStaffGradeAssignmentViewSchema })
  @SerializeOptions({ schema: practiceStaffGradeAssignmentViewSchema })
  async assign(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: createPracticeStaffGradeAssignmentSchema }) body: unknown) {
    return toPracticeStaffGradeAssignmentView(await assignPracticeStaffGrade(actorId, engagementId, body));
  }
}
