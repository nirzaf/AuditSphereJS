import { db } from '@auditsphere/server';
import { fixtureUser } from '@auditsphere/server';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development fixture forbidden in production');
  const id = '00000000-0000-4000-8000-000000000002';
  await db.user.upsert({ where: { id: fixtureUser }, create: { id: fixtureUser, email: 'preparer@example.test', role: 'PREPARER' }, update: {} });
  await db.engagement.upsert({ where: { id }, create: { id, name: 'Technical validation engagement', clientId: '00000000-0000-4000-8000-000000000003', state: 'FIELDWORK_EXECUTION' }, update: {} });
  await db.membership.upsert({ where: { userId_engagementId: { userId: fixtureUser, engagementId: id } }, create: { userId: fixtureUser, engagementId: id }, update: {} });
}
main().finally(() => db.$disconnect());
