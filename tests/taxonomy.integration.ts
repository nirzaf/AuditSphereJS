import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
const clientId = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2';
const engagementId = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3';
const documentId = 'd4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4';
const actorId = 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5';
const outsiderId = 'f6f6f6f6-f6f6-46f6-86f6-f6f6f6f6f6f6';

test('taxonomy versions are immutable when approved and a mapping approval goes stale when rows change', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_taxonomy').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, createTaxonomyVersion, approveTaxonomyVersion, approveImportMapping, currentMappingApproval, suggestMappings, mappingDigest } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Taxonomy firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Taxonomy client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Taxonomy engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [{ id: actorId, email: 'mapper@example.test', role: 'PREPARER' }, { id: outsiderId, email: 'outsider@example.test', role: 'REVIEWER' }] });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId } });
      }
      await db.document.create({ data: { id: documentId, engagementId, key: 'taxonomy/dataset.csv', sha256: 'c'.repeat(64), filename: 'dataset.csv' } });

      const lines = [
        { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 1 },
        { code: 'Revenue', label: 'Revenue', statementSection: 'INCOME', sortOrder: 2 },
      ];
      const v1 = await createTaxonomyVersion(actorId, engagementId, { name: 'STE-STATUTORY', lines }) as { id: string; version: number; status: string };
      assert.equal(v1.version, 1);
      assert.equal(v1.status, 'DRAFT');
      await assert.rejects(createTaxonomyVersion(actorId, engagementId, { name: 'STE-STATUTORY', lines: [lines[0], lines[0]] }), /Duplicate taxonomy code/);
      await assert.rejects(createTaxonomyVersion(outsiderId, engagementId, { name: 'OTHER', lines }), /not granted/i);

      await approveTaxonomyVersion(actorId, engagementId, v1.id);
      // An approved version and its lines can never be changed or removed.
      await assert.rejects(db.$executeRaw`UPDATE "TaxonomyVersion" SET "status" = 'RETIRED' WHERE id = ${v1.id}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "TaxonomyLine" WHERE "taxonomyVersionId" = ${v1.id}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`INSERT INTO "TaxonomyLine" (id,"taxonomyVersionId",code,label,"statementSection","sortOrder") VALUES (gen_random_uuid(), ${v1.id}::uuid, 'Late', 'Late', 'ASSETS', 9)`, /immutable/);

      const v2 = await createTaxonomyVersion(actorId, engagementId, { name: 'STE-STATUTORY', lines }) as { id: string; version: number };
      assert.equal(v2.version, 2, 'a change is a new version, not an edit');
      await approveTaxonomyVersion(actorId, engagementId, v2.id);

      const importId = '17171717-1717-4717-8717-171717171717';
      await db.tbImport.create({ data: { id: importId, firmId, clientId, engagementId, documentId, sha256: 'd'.repeat(64), status: 'MAPPING_REQUIRED' } });
      const otherEngagementId = randomUUID();
      const otherDocumentId = randomUUID();
      const otherImportId = randomUUID();
      await db.engagement.create({ data: { id: otherEngagementId, firmId, clientId, name: 'Other mapping engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.document.create({ data: { id: otherDocumentId, engagementId: otherEngagementId, key: 'taxonomy/other.csv', sha256: '9'.repeat(64), filename: 'other.csv' } });
      await db.tbImport.create({ data: { id: otherImportId, firmId, clientId, engagementId: otherEngagementId, documentId: otherDocumentId, sha256: '8'.repeat(64), status: 'MAPPING_REQUIRED' } });
      const otherFirmId = randomUUID();
      const otherTaxonomyId = randomUUID();
      const otherClientId = randomUUID();
      const foreignEngagementId = randomUUID();
      const foreignDocumentId = randomUUID();
      const foreignImportId = randomUUID();
      const foreignApprovalId = randomUUID();
      await db.firm.create({ data: { id: otherFirmId, name: 'Other taxonomy firm' } });
      await db.client.create({ data: { id: otherClientId, firmId: otherFirmId, name: 'Other taxonomy client' } });
      await db.engagement.create({ data: { id: foreignEngagementId, firmId: otherFirmId, clientId: otherClientId, name: 'Foreign mapping engagement' } });
      await db.taxonomyVersion.create({ data: { id: otherTaxonomyId, firmId: otherFirmId, name: 'FOREIGN', version: 1, createdBy: actorId } });
      await db.document.create({ data: { id: foreignDocumentId, engagementId: foreignEngagementId, key: `taxonomy/${foreignDocumentId}.csv`, sha256: '6'.repeat(64), filename: 'foreign.csv' } });
      await db.tbImport.create({ data: { id: foreignImportId, firmId: otherFirmId, clientId: otherClientId, engagementId: foreignEngagementId, documentId: foreignDocumentId, sha256: '7'.repeat(64), status: 'MAPPING_REQUIRED' } });
      await db.$executeRaw`INSERT INTO "MappingApproval" (id,"firmId","clientId","engagementId","importId","taxonomyVersionId",digest,"rowCount","approvedBy") VALUES (${foreignApprovalId}::uuid, ${otherFirmId}::uuid, ${otherClientId}::uuid, ${foreignEngagementId}::uuid, ${foreignImportId}::uuid, ${otherTaxonomyId}::uuid, ${'5'.repeat(64)}, 1, ${actorId}::uuid)`;
      const invalidMappingApproval = (mappingImportId: string, taxonomyId: string) => db.$executeRaw`INSERT INTO "MappingApproval" (id,"firmId","clientId","engagementId","importId","taxonomyVersionId",digest,"rowCount","approvedBy") VALUES (gen_random_uuid(), ${firmId}::uuid, ${clientId}::uuid, ${engagementId}::uuid, ${mappingImportId}::uuid, ${taxonomyId}::uuid, ${'a'.repeat(64)}, 1, ${actorId}::uuid)`;
      await assert.rejects(invalidMappingApproval(otherImportId, v1.id), /MappingApproval_import_scope_fkey/);
      await assert.rejects(invalidMappingApproval(importId, otherTaxonomyId), /MappingApproval_taxonomy_scope_fkey/);
      await db.tbRow.createMany({ data: [
        { importId, position: 0, code: '100', name: 'Cash', fsli: 'Unknown line', current: '10.000000', prior: '0.000000' },
        { importId, position: 1, code: '400', name: 'Revenue', fsli: 'Revenue', current: '-10.000000', prior: '0.000000' },
      ] });

      // A mapped value outside the taxonomy is rejected rather than accepted silently.
      await assert.rejects(approveImportMapping(actorId, engagementId, importId, { taxonomyVersionId: v1.id, idempotencyKey: randomUUID() }), /not in STE-STATUTORY/);
      await assert.rejects(approveImportMapping(outsiderId, engagementId, importId, { idempotencyKey: randomUUID() }), /not granted/i);

      await db.tbRow.updateMany({ where: { importId, code: '100' }, data: { fsli: 'Cash and equivalents' } });
      const approval = await approveImportMapping(actorId, engagementId, importId, { idempotencyKey: randomUUID() }) as { approvalId: string; digest: string; taxonomyVersion: number; rowCount: number };
      assert.match(approval.digest, /^[0-9a-f]{64}$/);
      assert.equal(approval.taxonomyVersion, 2, 'the latest approved taxonomy is used when none is named');
      assert.equal(approval.rowCount, 2);
      assert.ok(await currentMappingApproval(engagementId, importId));

      // Changing a mapped row makes the approval stale.
      await db.tbRow.updateMany({ where: { importId, code: '100' }, data: { fsli: 'Revenue' } });
      assert.equal(await currentMappingApproval(engagementId, importId), null);
      await assert.rejects(approveImportMapping(actorId, engagementId, importId, { taxonomyVersionId: v2.id, idempotencyKey: randomUUID() }), /mapping changed after approval/);

      // Approving against a different taxonomy version records a new approval and becomes current.
      await db.tbRow.updateMany({ where: { importId, code: '100' }, data: { fsli: 'Cash and equivalents' } });
      const v1Approval = await approveImportMapping(actorId, engagementId, importId, { taxonomyVersionId: v1.id, idempotencyKey: randomUUID() }) as { taxonomyVersion: number; approvalId: string };
      assert.equal(v1Approval.taxonomyVersion, 1);
      assert.ok(await currentMappingApproval(engagementId, importId));

      // Approved mappings become client-scoped memory with the approval as provenance.
      assert.equal(await db.mappingMemoryEntry.count({ where: { firmId, clientId } }), 2);
      const invalidMemoryEntry = (memoryFirmId: string, memoryClientId: string, sourceApprovalId: string, accountCode: string) => db.$executeRaw`INSERT INTO "MappingMemoryEntry" (id,"firmId","clientId","accountCode","accountName","taxonomyLineCode","sourceApprovalId") VALUES (gen_random_uuid(), ${memoryFirmId}::uuid, ${memoryClientId}::uuid, ${accountCode}, 'Cash', 'Cash and equivalents', ${sourceApprovalId}::uuid)`;
      await assert.rejects(invalidMemoryEntry(firmId, otherClientId, v1Approval.approvalId, 'BAD-CLIENT'), /MappingMemoryEntry_client_scope_fkey/);
      await assert.rejects(invalidMemoryEntry(firmId, clientId, foreignApprovalId, 'BAD-APPROVAL'), /MappingMemoryEntry_source_approval_scope_fkey/);

      // A later import is offered those remembered codes, each naming its source approval.
      const secondImportId = '18181818-1818-4818-8818-181818181818';
      await db.tbImport.create({ data: { id: secondImportId, firmId, clientId, engagementId, documentId, sha256: 'e'.repeat(64), status: 'MAPPING_REQUIRED' } });
      await db.tbRow.createMany({ data: [
        { importId: secondImportId, position: 0, code: '100', name: 'Cash', fsli: null, current: '1.000000', prior: '0.000000' },
        { importId: secondImportId, position: 1, code: '400', name: 'Revenue', fsli: null, current: '-1.000000', prior: '0.000000' },
        { importId: secondImportId, position: 2, code: '999', name: 'Unexplained', fsli: null, current: '0.000000', prior: '0.000000' },
      ] });
      const suggestions = await suggestMappings(actorId, engagementId, secondImportId) as { suggested: number; unresolved: number; alreadyMapped: number; items: Array<{ code: string; suggestedFsli: string | null; reason: string; provenance: { sourceApprovalId: string; timesApplied: number } | null }> };
      assert.equal(suggestions.suggested, 2);
      assert.equal(suggestions.unresolved, 1);
      assert.equal(suggestions.alreadyMapped, 0);
      const cash = suggestions.items.find((item) => item.code === '100')!;
      assert.equal(cash.suggestedFsli, 'Cash and equivalents');
      assert.equal(cash.reason, 'MEMORY');
      assert.equal(cash.provenance?.sourceApprovalId, v1Approval.approvalId);
      assert.ok((cash.provenance?.timesApplied ?? 0) >= 1);
      assert.equal(suggestions.items.find((item) => item.code === '999')!.reason, 'NO_MEMORY');
      // A user without the fieldwork capability cannot read suggestions.
      await assert.rejects(suggestMappings(outsiderId, engagementId, secondImportId), /not granted/i);

      // A remembered code that is no longer in the approved taxonomy is reported, not offered.
      await db.mappingMemoryEntry.update({ where: { firmId_clientId_accountCode: { firmId, clientId, accountCode: '400' } }, data: { taxonomyLineCode: 'Retired code' } });
      const afterRetirement = await suggestMappings(actorId, engagementId, secondImportId) as { suggested: number; unresolved: number; items: Array<{ code: string; suggestedFsli: string | null; reason: string }> };
      assert.equal(afterRetirement.suggested, 1);
      assert.equal(afterRetirement.items.find((item) => item.code === '400')!.reason, 'MEMORY_NOT_IN_TAXONOMY');
      assert.equal(afterRetirement.items.find((item) => item.code === '400')!.suggestedFsli, null);
      // Already-mapped rows are reported as such rather than suggested again.
      await db.tbRow.updateMany({ where: { importId: secondImportId, code: '400' }, data: { fsli: 'Revenue' } });
      const withMapped = await suggestMappings(actorId, engagementId, secondImportId) as { alreadyMapped: number; items: Array<{ code: string; reason: string }> };
      assert.equal(withMapped.alreadyMapped, 1);
      assert.equal(withMapped.items.find((item) => item.code === '400')!.reason, 'ALREADY_MAPPED');

      // Approvals are append-only and the digest is order-independent.
      await assert.rejects(db.$executeRaw`UPDATE "MappingApproval" SET digest = repeat('0', 64) WHERE "importId" = ${importId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "MappingApproval" WHERE "importId" = ${importId}::uuid`, /append-only/);
      const rows = await db.tbRow.findMany({ where: { importId }, select: { id: true, fsli: true, version: true } });
      assert.equal(mappingDigest(rows), mappingDigest([...rows].reverse()));

      console.log('taxonomy immutable when approved and mapping approvals stale-aware');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
