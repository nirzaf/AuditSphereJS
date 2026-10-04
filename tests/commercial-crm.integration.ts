import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const key = () => randomUUID();
type CommandResult = { id: string; status?: string; parentClientId?: string | null; duplicateOfId?: string | null; legalName?: string; email?: string; amount?: string; contractFee?: string; proposalRevision?: number; number?: number; kind?: string; dueOn?: string; proposalId?: string; revision?: number; receiptId?: string };
const asRecord = (value: unknown): CommandResult => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'command returned no record'); return value as CommandResult; };

test('the commercial CRM directory, contact routing and lead pipeline enforce their acceptance criteria', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('commercial_crm').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, createClient, updateClientProfile, setClientParent, addContact, resolveRecipient, createLead, profileLead, advanceLeadToProposal, createProposal, presentProposal, acceptProposal, recordRiskClearance, applyLifecycleCommand } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), userId = randomUUID(), partnerId = randomUUID();
      await db.user.createMany({ data: [
        { id: userId, email: 'crm@test.local', role: 'APPROVER' },
        { id: partnerId, email: 'crm-partner@test.local', role: 'APPROVER' },
      ] });
      await db.firm.create({ data: { id: firmId, name: 'CRM firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Bootstrap client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'CRM engagement' } });
      await db.membership.create({ data: { userId, firmId, clientId, engagementId, role: 'APPROVER' } });
      await db.membership.create({ data: { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' } });
      await db.roleGrant.createMany({ data: [
        { userId, capability: 'COMMERCIAL_MANAGE', firmId, grantedBy: userId },
        { userId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'RISK_PARTNER_CLEAR', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
      ] });
      const lifecycle = async (command: string, actor = userId) => {
        const engagement = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { version: true } });
        return applyLifecycleCommand(engagementId, actor, { command, expectedVersion: engagement.version, idempotencyKey: key() });
      };

      // T052 AC2 — similar legal names never merge: both clients stay distinct rows.
      const holding = asRecord(await createClient(userId, engagementId, { idempotencyKey: key(), name: 'Acme Trading', legalName: 'Acme Trading W.L.L.', taxId: 'QA-CR-112233', legalForm: 'W.L.L.', address: 'Doha, Building 1' }));
      const subsidiary = asRecord(await createClient(userId, engagementId, { idempotencyKey: key(), name: 'Acme Trading W.L.L. (Subsidiary)', legalName: 'Acme Trading W.L.L.', parentClientId: holding.id }));
      assert.notEqual(holding.id, subsidiary.id);
      assert.equal(await db.client.count({ where: { firmId, legalName: 'Acme Trading W.L.L.' } }), 2, 'similar names remain distinct clients');

      // T052 AC1 — an organizational cycle is rejected in both directions.
      await setClientParent(userId, engagementId, subsidiary.id, { idempotencyKey: key(), parentClientId: holding.id });
      await assert.rejects(setClientParent(userId, engagementId, holding.id, { idempotencyKey: key(), parentClientId: subsidiary.id }), /organizational cycle/);
      await assert.rejects(setClientParent(userId, engagementId, holding.id, { idempotencyKey: key(), parentClientId: holding.id }), /parent not found|organizational cycle|not found/i, 'self-parenting is rejected');

      // T053 — contacts with routing roles; AC2: a missing mandatory recipient blocks dispatch.
      await assert.rejects(resolveRecipient(engagementId, 'INVOICE'), /no primary CFO_FD contact/);
      await addContact(userId, engagementId, { idempotencyKey: key(), clientId, name: 'Maysoon Tariq', email: 'md@bootstrap.test', role: 'MANAGING_DIRECTOR', isPrimary: true });
      await addContact(userId, engagementId, { idempotencyKey: key(), clientId, name: 'Dana Khalil', email: 'cfo@bootstrap.test', role: 'CFO_FD', isPrimary: true });
      await addContact(userId, engagementId, { idempotencyKey: key(), clientId, name: 'Sami Haddad', email: 'liaison@bootstrap.test', role: 'AUDIT_LIAISON', isPrimary: true });
      await assert.rejects(addContact(userId, engagementId, { idempotencyKey: key(), clientId, name: 'Second CFO', email: 'cfo2@bootstrap.test', role: 'CFO_FD', isPrimary: true }), /primary CFO_FD contact already exists/);
      // T053 AC1 — categories route to the expected contact roles.
      const proposalRoute = await resolveRecipient(engagementId, 'PROPOSAL');
      assert.equal(proposalRoute.email, 'md@bootstrap.test');
      assert.equal((await resolveRecipient(engagementId, 'INVOICE')).email, 'cfo@bootstrap.test');
      assert.equal((await resolveRecipient(engagementId, 'PBC')).email, 'liaison@bootstrap.test');
      // T053 AC3 — a captured snapshot survives later contact edits unchanged.
      await db.clientContact.update({ where: { id: proposalRoute.contactId }, data: { email: 'md-new@bootstrap.test' } });
      assert.equal(proposalRoute.email, 'md@bootstrap.test', 'the captured recipient snapshot keeps its original email');
      assert.equal((await resolveRecipient(engagementId, 'PROPOSAL')).email, 'md-new@bootstrap.test');

      // T052 AC3 — editing the client address never rewrites an issued letter snapshot.
      const proposal = asRecord(await createProposal(userId, engagementId, { idempotencyKey: key(), service: 'External statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '90000.00' }));
      await lifecycle('OPEN_PROPOSAL');
      await presentProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1 });
      await lifecycle('DISPATCH_PROPOSAL');
      await recordRiskClearance(partnerId, engagementId, { idempotencyKey: key(), reason: 'ISA 220 acceptance complete; independence confirmed.' });
      await acceptProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1, evidenceRef: 'signed-acceptance.pdf' });
      await lifecycle('ISSUE_ENGAGEMENT_LETTER', partnerId);
      const letterBefore = (await db.engagementLetterRecord.findUniqueOrThrow({ where: { engagementId } })).letterText;
      await updateClientProfile(userId, engagementId, clientId, { idempotencyKey: key(), address: 'Doha, New Towers, Floor 9' });
      const letterAfter = (await db.engagementLetterRecord.findUniqueOrThrow({ where: { engagementId } })).letterText;
      assert.equal(letterAfter, letterBefore, 'a profile edit never rewrites the issued letter snapshot');

      // T054 AC1 — an incomplete profile cannot advance to proposal generation.
      const lead = asRecord(await createLead(userId, engagementId, { idempotencyKey: key(), source: 'WEB', legalName: 'Gulf Logistics L.L.C.' }));
      assert.equal(lead.status, 'NEW');
      await assert.rejects(advanceLeadToProposal(userId, engagementId, lead.id), /incomplete; required fields missing: contactName, contactEmail, scope/);
      await profileLead(userId, engagementId, lead.id, { idempotencyKey: key(), contactName: 'Tareq Salem', contactEmail: 'tareq@gulflog.test', scope: 'Annual statutory audit of consolidated accounts' });
      const advanced = asRecord(await advanceLeadToProposal(userId, engagementId, lead.id));
      assert.equal(advanced.status, 'PROPOSAL_ENTRY');

      // T054 AC2 — a duplicate submission stays visible as its own lead linked to the first.
      const duplicate = asRecord(await createLead(userId, engagementId, { idempotencyKey: key(), source: 'REFERRAL', legalName: 'Gulf Logistics L.L.C.' }));
      assert.equal(duplicate.duplicateOfId, lead.id, 'the duplicate submission cites the original lead');
      assert.equal(await db.lead.count({ where: { firmId, legalName: 'Gulf Logistics L.L.C.' } }), 2, 'the duplicate submission remains its own visible lead');

      // T054 AC3 — lead intake assigns no privileges, engagements or engagement states.
      const stateBefore = (await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })).state;
      const engagementsBefore = await db.engagement.count({ where: { firmId } });
      const grantsBefore = await db.roleGrant.count({ where: { firmId } });
      const membershipsBefore = await db.membership.count({ where: { firmId } });
      const rejectedLead = asRecord(await createLead(userId, engagementId, { idempotencyKey: key(), source: 'PHONE', legalName: 'Privilege Probe Trading' }));
      assert.equal((await db.engagement.count({ where: { firmId } })), engagementsBefore, 'lead intake creates no engagement');
      assert.equal((await db.roleGrant.count({ where: { firmId } })), grantsBefore, 'lead intake assigns no privileges');
      assert.equal((await db.membership.count({ where: { firmId } })), membershipsBefore, 'lead intake creates no memberships');
      assert.equal((await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })).state, stateBefore, 'lead intake never moves the engagement state');
      assert.equal(rejectedLead.status, 'NEW');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
