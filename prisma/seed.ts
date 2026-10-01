import { db } from '@auditsphere/server';
import { fixtureUser } from '@auditsphere/server';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development fixture forbidden in production');
  const firmId = '00000000-0000-4000-8000-00000000000a';
  const clientId = '00000000-0000-4000-8000-000000000003';
  const id = '00000000-0000-4000-8000-000000000002';
  await db.firm.upsert({ where: { id: firmId }, create: { id: firmId, name: 'Development fixture firm' }, update: {} });
  await db.client.upsert({ where: { id: clientId }, create: { id: clientId, firmId, name: 'Development fixture client' }, update: {} });
  await db.user.upsert({ where: { id: fixtureUser }, create: { id: fixtureUser, email: 'preparer@example.test', role: 'PREPARER' }, update: {} });
  await db.engagement.upsert({ where: { id }, create: { id, firmId, clientId, name: 'Technical validation engagement', state: 'FIELDWORK_EXECUTION' }, update: {} });
  await db.membership.upsert({ where: { userId_engagementId: { userId: fixtureUser, engagementId: id } }, create: { userId: fixtureUser, engagementId: id }, update: {} });
  // Explicit, engagement-scoped development grants. Nothing is granted implicitly by membership
  // or by the legacy 'PREPARER' role string.
  for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'MATERIALITY_APPROVE', 'RISK_MANAGE', 'RISK_PARTNER_CLEAR', 'REVIEW_RAISE', 'REVIEW_RESOLVE', 'ADJUSTMENT_MANAGE', 'ADJUSTMENT_POST', 'LIFECYCLE_COMMAND'] as const) {
    const existing = await db.roleGrant.findFirst({ where: { userId: fixtureUser, capability, engagementId: id, revokedAt: null } });
    if (!existing) await db.roleGrant.create({ data: { userId: fixtureUser, capability, firmId, clientId, engagementId: id, grantedBy: fixtureUser, reason: 'Development fixture grant' } });
  }
}
main().finally(() => db.$disconnect());
