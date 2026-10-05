import { randomUUID } from 'node:crypto';
import type { db } from '@auditsphere/server';

type SeedClient = Pick<typeof db, 'firm' | 'client' | 'user' | 'engagement' | 'membership' | 'roleGrant'>;

export type TbFixtureScope = {
  userId: string;
  firmId: string;
  clientId: string;
  engagementId: string;
};

/** Test-only authority and engagement seeder. It cannot be used by local/dev or production code. */
export async function seedAuthorizedTbFixtureScopes(client: SeedClient): Promise<{ firmId: string; engagements: [TbFixtureScope, TbFixtureScope] }> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Trial Balance engagement seed is available only in NODE_ENV=test');

  const firmId = randomUUID();
  const clientIds = [randomUUID(), randomUUID()] as const;
  const users = [randomUUID(), randomUUID()] as const;
  const engagements = [randomUUID(), randomUUID()] as const;
  const suffix = randomUUID();
  await client.firm.create({ data: { id: firmId, name: `Synthetic Trial Balance Fixture Firm ${suffix}` } });
  await client.client.createMany({ data: clientIds.map((id, index) => ({ id, firmId, name: `Synthetic Fixture Client ${index === 0 ? 'A' : 'B'} ${suffix}` })) });
  await client.user.createMany({ data: users.map((id, index) => ({ id, email: `tb-fixture-${index}-${suffix}@example.test`, role: 'PREPARER' })) });
  await client.engagement.createMany({ data: engagements.map((id, index) => ({
    id,
    firmId,
    clientId: clientIds[index],
    name: `Synthetic Trial Balance Engagement ${index === 0 ? 'A' : 'B'} ${suffix}`,
    state: 'FIELDWORK_EXECUTION',
  })) });
  await client.membership.createMany({ data: users.map((userId, index) => ({
    userId,
    firmId,
    clientId: clientIds[index],
    engagementId: engagements[index],
    role: 'PREPARER',
  })) });
  await client.roleGrant.createMany({ data: users.flatMap((userId, index) => ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'].map(capability => ({
    userId,
    capability,
    firmId,
    clientId: clientIds[index],
    engagementId: engagements[index],
    grantedBy: userId,
    reason: 'Synthetic T042 isolated PostgreSQL fixture',
  }))) });

  return {
    firmId,
    engagements: [
      { userId: users[0], firmId, clientId: clientIds[0], engagementId: engagements[0] },
      { userId: users[1], firmId, clientId: clientIds[1], engagementId: engagements[1] },
    ],
  };
}
