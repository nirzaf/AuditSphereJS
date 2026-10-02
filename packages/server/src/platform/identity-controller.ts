import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConflictException, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InternalIdentityGuard, currentInternalIdentity, revokeCurrentUserSessions } from './auth.js';
import { ReqActor } from './request-actor.js';

@ApiTags('Identity')
@ApiBearerAuth()
@Controller()
@UseGuards(InternalIdentityGuard)
export class InternalIdentityController {
  @Get('me')
  me(@ReqActor() actorId: string) {
    return currentInternalIdentity(actorId);
  }

  @Post('me/revoke-sessions')
  revokeSessions(@ReqActor() actorId: string) {
    if (process.env.AUTH_PROVIDER !== 'entra' && process.env.NODE_ENV !== 'production') {
      throw new ConflictException('Session revocation requires Entra authentication');
    }
    return revokeCurrentUserSessions(actorId);
  }
}
