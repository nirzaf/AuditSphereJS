import { db, ensurePracticeRateDefaultsForFirm } from '@auditsphere/server';
import { fixtureUser } from '@auditsphere/server';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development fixture forbidden in production');
  const id = '00000000-0000-4000-8000-000000000002';
  const existingEngagement = await db.engagement.findUnique({ where: { id } });
  // Preserve migrated ownership; never silently move an existing fixture between firms.
  const firmId = existingEngagement?.firmId ?? '00000000-0000-4000-8000-00000000000a';
  const clientId = existingEngagement?.clientId ?? '00000000-0000-4000-8000-000000000003';
  await db.firm.upsert({ where: { id: firmId }, create: { id: firmId, name: 'Development fixture firm' }, update: {} });
  await ensurePracticeRateDefaultsForFirm(firmId);
  await db.client.upsert({ where: { id: clientId }, create: { id: clientId, firmId, name: 'Development fixture client' }, update: {} });
  await db.user.upsert({ where: { id: fixtureUser }, create: { id: fixtureUser, email: 'preparer@example.test', role: 'PREPARER' }, update: {} });
  await db.engagement.upsert({ where: { id }, create: { id, firmId, clientId, name: 'Technical validation engagement', state: 'FIELDWORK_EXECUTION' }, update: {} });
  await db.membership.upsert({ where: { userId_engagementId: { userId: fixtureUser, engagementId: id } }, create: { userId: fixtureUser, firmId, clientId, engagementId: id }, update: {} });
  // Explicit, engagement-scoped development grants. Nothing is granted implicitly by membership
  // or by the legacy 'PREPARER' role string.
  for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'MATERIALITY_APPROVE', 'RISK_MANAGE', 'RISK_PARTNER_CLEAR', 'REVIEW_RAISE', 'REVIEW_RESOLVE', 'ADJUSTMENT_MANAGE', 'ADJUSTMENT_POST', 'LIFECYCLE_COMMAND'] as const) {
    const existing = await db.roleGrant.findFirst({ where: { userId: fixtureUser, capability, engagementId: id, revokedAt: null } });
    if (!existing) await db.roleGrant.create({ data: { userId: fixtureUser, capability, firmId, clientId, engagementId: id, grantedBy: fixtureUser, reason: 'Development fixture grant' } });
  }
  // Development-only firm ledger permissions. Production authority must be separately assigned.
  for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE', 'PRACTICE_POST', 'PRACTICE_REOPEN_PERIOD'] as const) {
    const existing = await db.roleGrant.findFirst({ where: { userId: fixtureUser, capability, firmId, clientId: null, engagementId: null, revokedAt: null } });
    if (!existing) await db.roleGrant.create({ data: { userId: fixtureUser, capability, firmId, grantedBy: fixtureUser, reason: 'Development-only practice fixture' } });
  }
  // A development-only approved taxonomy makes Trial Balance mapping demonstrable without
  // weakening the production role ceiling: the fixture actor remains a PREPARER and cannot
  // finalize. Production business taxonomies must be created and approved through the service.
  const developmentLines = [
    { code: 'Cash and equivalents', label: 'Cash and cash equivalents', statementSection: 'ASSETS', sortOrder: 1 },
    { code: 'Equity', label: 'Equity', statementSection: 'EQUITY', sortOrder: 2 },
  ];
  const approvedDevelopmentTaxonomies = await db.taxonomyVersion.findMany({
    where: { firmId, name: 'DEVELOPMENT-STATUTORY', status: 'APPROVED' },
    include: { lines: true },
    orderBy: { version: 'desc' },
  });
  const completeDevelopmentTaxonomy = approvedDevelopmentTaxonomies.find((taxonomy) =>
    developmentLines.every((required) => taxonomy.lines.some((line) => line.code === required.code)),
  );
  if (!completeDevelopmentTaxonomy) {
    const latestVersion = await db.taxonomyVersion.aggregate({
      where: { firmId, name: 'DEVELOPMENT-STATUTORY' },
      _max: { version: true },
    });
    const developmentTaxonomy = await db.taxonomyVersion.create({
      data: {
        firmId,
        name: 'DEVELOPMENT-STATUTORY',
        version: (latestVersion._max.version ?? 0) + 1,
        status: 'DRAFT',
        createdBy: fixtureUser,
      },
    });
    for (const line of developmentLines) {
      await db.taxonomyLine.create({ data: { taxonomyVersionId: developmentTaxonomy.id, ...line } });
    }
    await db.taxonomyVersion.update({
      where: { id: developmentTaxonomy.id },
      data: { status: 'APPROVED', approvedBy: fixtureUser, approvedAt: new Date() },
    });
  }
  await db.firmPostingPolicy.upsert({ where: { firmId }, create: { firmId, policyVersion: 'DEVELOPMENT-D07-1', approvedBy: fixtureUser, revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX' }, update: {} });
  const accounts = [
    ['100','Bank','ASSET'], ['110','Cash','ASSET'], ['120','Client receivables','ASSET'],
    ['200','Deferred engagement fees','LIABILITY'], ['210','Accounts payable','LIABILITY'], ['220','Payroll payable','LIABILITY'],
    ['300','Partner capital','EQUITY'], ['310','Partner withdrawals','EQUITY'], ['400','Audit fees','INCOME'],
    ['500','Office rent','EXPENSE'], ['510','Staff salaries and benefits','EXPENSE'], ['520','End of service costs','EXPENSE'], ['530','Petty cash expenses','EXPENSE'],
  ];
  for (const [code, name, kind] of accounts) await db.practiceAccount.upsert({ where: { firmId_code: { firmId, code } }, create: { firmId, code, name, kind }, update: {} });
}
main().finally(() => db.$disconnect());
