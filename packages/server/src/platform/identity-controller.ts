import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { InternalIdentityGuard, currentInternalIdentity } from './auth.js';
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
}
