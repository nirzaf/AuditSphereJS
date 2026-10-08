import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const clientId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const engagementId = '12121212-1212-4212-8212-121212121212';
const documentId = '34343434-3434-4434-8434-343434343434';
const importId = '56565656-5656-4656-8656-565656565656';
const secondImportId = '67676767-6767-4767-8767-676767676767';
const actorId = '78787878-7878-4787-8787-787878787878';
const reviewerId = '89898989-8989-4898-8898-898989898989';
const key = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

// The workflow suite runs many guarded commands on one container; 120 s was within 20 s of the limit on an idle machine.
test('guarded lifecycle commands reject invalid paths, enforce evidence and stay idempotent', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_lifecycle').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, applyLifecycleCommand, lifecycleGates, lifecycleHistory, permittedCommands, canApply, transitions } = await import('@auditsphere/server');
    try {
      const lifecycleStates = ['LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'];
      for (const [command, definition] of Object.entries(transitions)) {
        for (const state of lifecycleStates) assert.equal(canApply(command, state), definition.from.includes(state), `${command} from ${state}`);
      }
      assert.equal(canApply('ISSUE_ENGAGEMENT_LETTER', 'DUAL_KEY_PENDING', 'PROSPECT_REJECTED'), false);
      await db.firm.create({ data: { id: firmId, name: 'Lifecycle firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Lifecycle client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Lifecycle engagement', state: 'PORTAL_ACTIVE_PLANNING' } });
      // Membership and a legacy role string are not authorization: without a grant, no command runs.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('09') }),
        /not granted/i,
      );
      await db.user.createMany({ data: [
        { id: actorId, email: 'lifecycle-preparer@example.test', role: 'PREPARER' },
        { id: reviewerId, email: 'lifecycle-reviewer@example.test', role: 'REVIEWER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: actorId, firmId, clientId, engagementId, role: 'PREPARER' },
        { userId: reviewerId, firmId, clientId, engagementId, role: 'REVIEWER' },
      ] });
      await db.roleGrant.createMany({ data: [actorId, reviewerId].map((userId) => ({ userId, capability: 'LIFECYCLE_COMMAND', firmId, clientId, engagementId, grantedBy: userId, reason: 'test grant' })) });
      assert.deepEqual(permittedCommands('PORTAL_ACTIVE_PLANNING'), ['START_FIELDWORK']);
      assert.deepEqual(permittedCommands('ARCHIVED_READ_ONLY'), []);

      // A preparer can submit completed work but cannot approve the planning gate themselves.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('08') }),
        /authorized staff role/i,
      );

      // Evidence predicate: fieldwork cannot start from an unaccepted balance.
      await assert.rejects(
        applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /finalized trial balance/i,
      );

      await db.document.create({ data: { id: documentId, engagementId, key: 'lifecycle/dataset.csv', sha256: 'a'.repeat(64), filename: 'dataset.csv' } });
      await db.tbImport.createMany({ data: [
        { id: importId, firmId, clientId, engagementId, documentId, sha256: 'a'.repeat(64), status: 'SUPERSEDED', rowCount: 2 }, // D18: the older version is superseded
        { id: secondImportId, firmId, clientId, engagementId, documentId, sha256: 'b'.repeat(64), status: 'FINALIZED', rowCount: 2 },
      ] });

      // Fieldwork also needs a current approved plan, not only an accepted balance.
      await assert.rejects(
        applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /approved materiality assessment is required/i,
      );

      // Direct fixture rows for the accepted versions and approved assessments. The full
      // publication/approval path is exercised in tests/materiality-persistence.integration.ts.
      const seedPublication = (sequence: number, importRef: string, digestChar: string) => db.balancePublication.create({ data: { firmId, clientId, engagementId, importId: importRef, sequence, currency: 'QAR', rowCount: 2, digest: digestChar.repeat(64), publishedBy: actorId } });
      const seedAssessment = async (publicationId: string, digestChar: string) => {
        const taxonomy = await db.taxonomyVersion.create({ data: { firmId, name: `STE-${publicationId.slice(0, 8)}`, version: 1, status: 'APPROVED', createdBy: actorId, approvedBy: actorId, approvedAt: new Date() } });
        return db.materialityAssessment.create({ data: {
          firmId, clientId, engagementId, publicationId, taxonomyVersionId: taxonomy.id,
          benchmarkKind: 'REVENUE', sourceLineCount: 1, currency: 'QAR',
          benchmarkAmount: '2000000.000000', planningMateriality: '20000.000000', tolerableError: '15000.000000', sadThreshold: '1000.000000',
          ratePercent: '1.000000', performancePercent: '75.000000', trivialPercent: '5.000000',
          policyVersion: 'STE-MATERIALITY-2026.1', inputHash: digestChar.repeat(64), status: 'APPROVED', calculatedBy: actorId, approvedBy: actorId, approvedAt: new Date(),
        } });
      };
      const publication1 = await seedPublication(1, importId, 'c');
      await seedAssessment(publication1.id, 'c');
      // A newer accepted version with no approved plan for it makes the plan stale and blocks fieldwork.
      const publication2 = await seedPublication(2, secondImportId, 'd');
      await assert.rejects(
        applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /stale/i,
      );
      await seedAssessment(publication2.id, 'd');

      const started = await applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') });
      assert.deepEqual(started, { state: 'FIELDWORK_EXECUTION', version: 2 });

      // Replaying the same authorized command returns the stored outcome and writes nothing new.
      const replayed = await applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') });
      assert.deepEqual(replayed, started);

      // Same key, different content is a conflict, not a silent second transition.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 2, idempotencyKey: key('01') }),
        /idempotency/i,
      );

      // nextState() order is not authorization: submitting from fieldwork is allowed, restarting is not.
      await assert.rejects(
        applyLifecycleCommand(engagementId, reviewerId, { command: 'START_FIELDWORK', expectedVersion: 2, idempotencyKey: key('02') }),
        /not valid from FIELDWORK_EXECUTION/,
      );

      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 2, idempotencyKey: key('03') }),
        /WORKPROGRAM_SUBMISSIONS_MISSING/,
      );
      assert.equal((await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })).state, 'FIELDWORK_EXECUTION');

      // Seed the review state as a database fixture so the rework edge is tested while its
      // assigned-procedure submission workflow remains owned by T091.
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'MANAGERIAL_REVIEW', version: 3 } });

      await assert.rejects(
        applyLifecycleCommand(engagementId, reviewerId, { command: 'RETURN_FOR_REWORK', expectedVersion: 3, idempotencyKey: key('04') }),
        /reason is required/i,
      );
      const returned = await applyLifecycleCommand(engagementId, reviewerId, { command: 'RETURN_FOR_REWORK', expectedVersion: 3, idempotencyKey: key('05'), reason: 'Bank confirmation still outstanding' });
      assert.deepEqual(returned, { state: 'FIELDWORK_EXECUTION', version: 4 });

      // A stale aggregate version cannot overwrite a newer decision.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 3, idempotencyKey: key('06') }),
        /changed; reload/,
      );

      const managerEngagementId = '13131313-1313-4313-8313-131313131313';
      await db.engagement.create({ data: { id: managerEngagementId, firmId, clientId, name: 'Manager review gates', state: 'MANAGERIAL_REVIEW' } });
      await db.membership.create({ data: { userId: reviewerId, firmId, clientId, engagementId: managerEngagementId, role: 'REVIEWER' } });
      await db.roleGrant.create({ data: { userId: reviewerId, capability: 'LIFECYCLE_COMMAND', firmId, clientId, engagementId: managerEngagementId, grantedBy: reviewerId, reason: 'review gate test' } });
      await db.reviewNote.create({ data: { firmId, clientId, engagementId: managerEngagementId, workpackage: 'Planning', body: 'Resolve before manager approval', raisedBy: actorId } });
      const gateResponse = await lifecycleGates(managerEngagementId);
      const managerApprovalGate = gateResponse.commands.find((gate) => gate.command === 'APPROVE_MANAGER_REVIEW');
      assert.ok(managerApprovalGate);
      assert.equal(managerApprovalGate.ready, false);
      assert.deepEqual(managerApprovalGate.unmet.map((gate) => gate.code), ['OPEN_REVIEW_NOTES', 'WORKPROGRAM_SUBMISSIONS_MISSING', 'SRM_NOT_COMPILED', 'CRITICAL_CONFIRMATIONS_PENDING']);
      await assert.rejects(
        applyLifecycleCommand(managerEngagementId, reviewerId, { command: 'APPROVE_MANAGER_REVIEW', expectedVersion: 1, idempotencyKey: key('10') }),
        /OPEN_REVIEW_NOTES/,
      );

      const approverId = '14141414-1414-4414-8414-141414141414';
      await db.user.create({ data: { id: approverId, email: 'lifecycle-approver@example.test', role: 'APPROVER' } });
      await db.membership.create({ data: { userId: approverId, firmId, clientId, engagementId, role: 'APPROVER' } });
      await db.roleGrant.create({ data: { userId: approverId, capability: 'LIFECYCLE_COMMAND', firmId, clientId, engagementId, grantedBy: approverId, reason: 'rejection outcome test' } });

      // Exercise the real command service against every state/command pair. Invalid jumps are
      // denied after authorization; each declared edge reaches its own evidence or reason guard.
      const commandNames = Object.keys(transitions) as Array<keyof typeof transitions>;
      const expectedMissingEvidence: Partial<Record<keyof typeof transitions, string>> = {
        OPEN_PROPOSAL: 'PROPOSAL_NOT_DRAFTED',
        DISPATCH_PROPOSAL: 'PROPOSAL_NOT_PRESENTED',
        ISSUE_ENGAGEMENT_LETTER: 'CLIENT_ACCEPTANCE_MISSING',
        ACTIVATE_PORTAL: 'ADVANCE_INVOICE_MISSING',
        START_FIELDWORK: 'FINALIZED_TRIAL_BALANCE_MISSING',
        SUBMIT_FOR_REVIEW: 'FINALIZED_TRIAL_BALANCE_MISSING',
        APPROVE_MANAGER_REVIEW: 'WORKPROGRAM_SUBMISSIONS_MISSING',
        AUTHORIZE_FINAL_REPORT: 'REPORT_OPINION_MISSING',
        RELEASE_FINAL_PACKAGE: 'SIGNED_LOR_MISSING',
      };
      for (const [stateIndex, state] of lifecycleStates.entries()) {
        const matrixEngagementId = randomUUID();
        await db.engagement.create({ data: {
          id: matrixEngagementId,
          firmId,
          clientId,
          name: `Transition guard matrix ${state}`,
          state,
        } });
        await db.membership.create({ data: {
          userId: approverId,
          firmId,
          clientId,
          engagementId: matrixEngagementId,
          role: 'APPROVER',
        } });
        await db.roleGrant.create({ data: {
          userId: approverId,
          capability: 'LIFECYCLE_COMMAND',
          firmId,
          clientId,
          engagementId: matrixEngagementId,
          grantedBy: approverId,
          reason: 'Exhaustive lifecycle source-state guard test',
        } });

        const allowed = commandNames.filter(command => transitions[command].from.includes(state));
        assert.deepEqual(permittedCommands(state), allowed, `permitted commands from ${state}`);
        for (const command of commandNames.filter(candidate => !allowed.includes(candidate))) {
          await assert.rejects(
            applyLifecycleCommand(matrixEngagementId, approverId, {
              command,
              expectedVersion: 1,
              idempotencyKey: randomUUID(),
              ...(transitions[command].requiresReason ? { reason: 'Guard matrix denied-jump case' } : {}),
            }),
            (error: { message?: string }) => Boolean(error.message?.includes(`not valid from ${state}`)),
            `${command} must be denied from ${state}`,
          );
        }

        const preview = await lifecycleGates(matrixEngagementId);
        const previewByCommand = new Map(preview.commands.map(gate => [gate.command, gate]));
        for (const command of allowed) {
          const gate = previewByCommand.get(command);
          assert.ok(gate, `missing ${command} gate from ${state}`);
          const expectedCode = expectedMissingEvidence[command];
          if (expectedCode) {
            assert.equal(gate.ready, false, `${command} cannot advance without its required evidence`);
            assert.ok(gate.unmet.some(reason => reason.code === expectedCode), `${command} gate must identify ${expectedCode}`);
          } else {
            assert.equal(gate.ready, true, `${command} has no outstanding lifecycle evidence in this fixture`);
          }
        }

        // Each permitted command needs its own aggregate: a successful edge changes the
        // source state, so subsequent edge checks must not share this engagement.
        for (const command of allowed) {
          const commandEngagementId = randomUUID();
          await db.engagement.create({ data: {
            id: commandEngagementId,
            firmId,
            clientId,
            name: `Transition command ${command} from ${state}`,
            state,
          } });
          await db.membership.create({ data: {
            userId: approverId,
            firmId,
            clientId,
            engagementId: commandEngagementId,
            role: 'APPROVER',
          } });
          await db.roleGrant.create({ data: {
            userId: approverId,
            capability: 'LIFECYCLE_COMMAND',
            firmId,
            clientId,
            engagementId: commandEngagementId,
            grantedBy: approverId,
            reason: 'Isolated lifecycle edge fixture',
          } });
          const definition = transitions[command];
          const expectedCode = expectedMissingEvidence[command];
          const input = {
            command,
            expectedVersion: 1,
            idempotencyKey: randomUUID(),
            ...(definition.requiresReason ? { reason: `Transition guard matrix ${stateIndex}/${state}` } : {}),
          };
          if (expectedCode) {
            await assert.rejects(
              applyLifecycleCommand(commandEngagementId, approverId, input),
              (error: { message?: string }) => Boolean(error.message?.includes(expectedCode)),
              `${command} from ${state} must be evidence-gated by ${expectedCode}`,
            );
            if (command === 'RELEASE_FINAL_PACKAGE') {
              const unchanged = await db.engagement.findUniqueOrThrow({
                where: { id: commandEngagementId },
                select: { state: true, version: true },
              });
              assert.deepEqual(unchanged, { state, version: 1 }, 'blocked package release must not advance lifecycle state or version');
              assert.equal(
                await db.engagementTransition.count({ where: { engagementId: commandEngagementId } }),
                0,
                'blocked package release must not append transition history',
              );
            }
          } else {
            const result = await applyLifecycleCommand(commandEngagementId, approverId, input);
            assert.ok(result && typeof result === 'object' && !Array.isArray(result), `${command} returns an object outcome`);
            const outcome = result as { state: string; version: number };
            assert.equal(outcome.state, definition.to, `${command} target from ${state}`);
            assert.equal(outcome.version, 2, `${command} increments the engagement version from ${state}`);
          }
        }
      }

      await db.engagement.update({ where: { id: engagementId }, data: { state: 'DUAL_KEY_PENDING', version: 5 } });
      const rejected = await applyLifecycleCommand(engagementId, approverId, { command: 'REJECT_PROSPECT', expectedVersion: 5, idempotencyKey: key('11'), reason: 'Client declined the engagement terms' });
      assert.deepEqual(rejected, { state: 'DUAL_KEY_PENDING', version: 6, terminalOutcome: 'PROSPECT_REJECTED' });
      const terminalHistory = await lifecycleHistory(engagementId);
      assert.equal(terminalHistory.terminalOutcome, 'PROSPECT_REJECTED');
      assert.deepEqual(terminalHistory.permittedCommands, []);
      assert.equal((await lifecycleGates(engagementId)).commands.length, 0);
      await assert.rejects(
        applyLifecycleCommand(engagementId, approverId, { command: 'ISSUE_ENGAGEMENT_LETTER', expectedVersion: 6, idempotencyKey: key('12') }),
        /terminal rejection/,
      );

      const history = await db.engagementTransition.findMany({ where: { engagementId }, orderBy: { createdAt: 'asc' } });
      assert.deepEqual(history.map((row) => row.command), ['START_FIELDWORK', 'RETURN_FOR_REWORK', 'REJECT_PROSPECT']);
      assert.equal(await db.auditEvent.count({ where: { engagementId } }), 3);
      await db.roleGrant.updateMany({ where: { userId: actorId, capability: 'LIFECYCLE_COMMAND' }, data: { revokedAt: new Date(), revokedBy: actorId } });
      await assert.rejects(applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }), /not granted/i, 'revoked authority cannot replay an old receipt');

      // History and audit are append-only at the database level.
      await assert.rejects(db.$executeRaw`UPDATE "EngagementTransition" SET "toState" = 'ARCHIVED_READ_ONLY' WHERE "engagementId" = ${engagementId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "AuditEvent" WHERE "engagementId" = ${engagementId}::uuid`, /append-only/);

      console.log('lifecycle commands guarded, idempotent and append-only');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
