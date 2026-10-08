import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { activeGrants, type Capability } from '../../platform/authorization.js';
import type { TransactionClient } from '../../platform/unit-of-work.js';

/**
 * D24 (DN-11): firm-level Practice routes name no engagement. They are authorized by an active firm-wide grant, which
 * has no client and no engagement. An actor whose grant covers one firm is served that firm. An actor whose grants
 * cover several firms must name the firm explicitly; the firm routes do not offer that yet, so they refuse rather than guess.
 */
export async function firmForActor(tx: TransactionClient, actorId: string, capability: Capability): Promise<string> {
  const grants = await activeGrants(tx, actorId, capability, new Date());
  const firms = [...new Set(grants
    .filter(grant => grant.firmId !== null && grant.clientId === null && grant.engagementId === null)
    .map(grant => grant.firmId as string))];
  if (firms.length === 0) throw new ForbiddenException(`${capability} requires an active firm-wide grant`);
  if (firms.length > 1) throw new BadRequestException('The actor holds firm-wide grants for more than one firm; naming the firm explicitly is not yet offered.');
  return firms[0];
}
