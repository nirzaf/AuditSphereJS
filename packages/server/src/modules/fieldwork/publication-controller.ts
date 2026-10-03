import { Body, Controller, Get, Param, Post, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiProblemSchema, publicationDetailSchema, publicationResultSchema, publicationSchema, publishSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { latestPublication, publicationDetail, publishBalances } from './publication.js';
import { toPublicationDetailView, toPublicationView } from './publication-response.js';

@ApiTags('Fieldwork') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/publications')
export class PublicationController {
  @Get('latest')
  @ApiOkResponse({ standardSchema: publicationSchema })
  @SerializeOptions({ schema: publicationSchema })
  async latest(@Param('engagementId') engagementId: string) {
    return toPublicationView(await latestPublication(engagementId));
  }

  @Get(':publicationId')
  @ApiOkResponse({ standardSchema: publicationDetailSchema })
  @SerializeOptions({ schema: publicationDetailSchema })
  async detail(@Param('engagementId') engagementId: string, @Param('publicationId') publicationId: string) {
    return toPublicationDetailView(await publicationDetail(engagementId, publicationId));
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: publicationResultSchema })
  @SerializeOptions({ schema: publicationResultSchema })
  publish(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: publishSchema }) body: unknown) {
    return publishBalances(engagementId, actorId, body);
  }
}
