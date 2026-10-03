import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Body, ConflictException, Controller, Get, Param, Post, SerializeOptions,
  StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes,
} from '@nestjs/common';
import {
  apiProblemSchema, assignEngagementStaffSchema, engagementStaffAssignmentResultSchema, engagementStaffRevocationResultSchema,
  internalIdentitySchema, readableEngagementSchema, revokeEngagementStaffSchema, sessionRevocationResponseSchema,
} from '@auditsphere/contracts';
import { InternalIdentityGuard, currentInternalIdentity, readableInternalEngagements, revokeCurrentUserSessions } from './auth.js';
import { ReqActor } from './request-actor.js';
import { assignEngagementStaff, revokeEngagementStaff } from './staff-access.js';

@ApiTags('Identity')
@ApiBearerAuth()
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@Controller()
@UseGuards(InternalIdentityGuard)
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class InternalIdentityController {
  @Get('me')
  @ApiOkResponse({ standardSchema: internalIdentitySchema })
  @SerializeOptions({ schema: internalIdentitySchema })
  me(@ReqActor() actorId: string) {
    return currentInternalIdentity(actorId);
  }

  @Get('me/engagements')
  @ApiOkResponse({ standardSchema: readableEngagementSchema, isArray: true })
  @SerializeOptions({ schema: readableEngagementSchema })
  engagements(@ReqActor() actorId: string) {
    return readableInternalEngagements(actorId);
  }

  @Post('me/revoke-sessions')
  @ApiCreatedResponse({ standardSchema: sessionRevocationResponseSchema })
  @SerializeOptions({ schema: sessionRevocationResponseSchema })
  revokeSessions(@ReqActor() actorId: string) {
    if (process.env.AUTH_PROVIDER !== 'entra' && process.env.NODE_ENV !== 'production') {
      throw new ConflictException('Session revocation requires Entra authentication');
    }
    return revokeCurrentUserSessions(actorId);
  }

  @Post('engagements/:engagementId/staff-assignments')
  @ApiCreatedResponse({ standardSchema: engagementStaffAssignmentResultSchema })
  @SerializeOptions({ schema: engagementStaffAssignmentResultSchema })
  assignStaff(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Body({ schema: assignEngagementStaffSchema }) body: unknown) {
    return assignEngagementStaff(actorId, engagementId, body);
  }

  @Post('engagements/:engagementId/staff-assignments/:userId/revoke')
  @ApiCreatedResponse({ standardSchema: engagementStaffRevocationResultSchema })
  @SerializeOptions({ schema: engagementStaffRevocationResultSchema })
  revokeStaff(@Param('engagementId') engagementId: string, @Param('userId') userId: string, @ReqActor() actorId: string, @Body({ schema: revokeEngagementStaffSchema }) body: unknown) {
    return revokeEngagementStaff(actorId, engagementId, userId, body);
  }
}
