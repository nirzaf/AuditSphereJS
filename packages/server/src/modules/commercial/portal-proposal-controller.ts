import { Body, Controller, ForbiddenException, Get, Header, Param, Post, Req, Res, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiProblemSchema, commercialProposalActionResultSchema, portalAcceptProposalSchema, portalProposalSchema } from '@auditsphere/contracts';
import { portalSessionTokenFromCookieHeader } from '../../platform/portal-auth.js';
import { acceptPortalProposal, readPortalProposal } from './proposal-acceptance.js';
type PortalRequest = { headers: { cookie?: string; origin?: string; 'x-csrf-token'?: string } };

@Controller('portal/proposals') @ApiTags('Portal proposals')
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
export class PortalProposalController {
  @Get(':id') @Header('cache-control', 'no-store') @ApiOkResponse({ standardSchema: portalProposalSchema }) @SerializeOptions({ schema: portalProposalSchema })
  read(@Param('id') id: string, @Req() request: PortalRequest) {
    return readPortalProposal(portalSessionTokenFromCookieHeader(request.headers.cookie) ?? '', id);
  }

  @Post(':id/accept') @ApiCreatedResponse({ standardSchema: commercialProposalActionResultSchema }) @SerializeOptions({ schema: commercialProposalActionResultSchema })
  accept(@Param('id') id: string, @Body({ schema: portalAcceptProposalSchema }) body: unknown, @Req() request: PortalRequest,
    @Res({ passthrough: true }) reply: { header: (name: string, value: string) => unknown }) {
    if (!process.env.WEB_ORIGIN || request.headers.origin !== process.env.WEB_ORIGIN) throw new ForbiddenException('Portal request origin is not allowed');
    reply.header('cache-control', 'no-store');
    return acceptPortalProposal(portalSessionTokenFromCookieHeader(request.headers.cookie) ?? '', request.headers['x-csrf-token'] ?? '', id, body);
  }
}
