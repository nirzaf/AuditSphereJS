import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  Body, Controller, Get, Module, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { apiErrorCodeForStatus, ApiProblemExceptionFilter } from '../src/problem-filter.js';
import {
  apiProblemSchema, assignEngagementStaffSchema, engagementStaffAssignmentResultSchema, internalIdentitySchema,
  adjustedBalancesSchema, adjustmentJournalDetailSchema, materialityAssessmentSchema, paginationQuerySchema,
  reviewNoteSchema, reviewSummarySchema, riskViewSchema, trialBalanceImportSchema, trialBalanceRowsPageSchema,
  lifecycleGatesSchema, lifecycleHistorySchema, mappingSuggestionsSchema, publicationDetailSchema, publicationResultSchema, taxonomyViewSchema, taxonomyViewsSchema,
  commercialDualKeyStatusSchema, commercialProposalViewSchema, invoiceViewSchema, practiceLedgerSchema,
  auditCheckpointSchema, auditEventSchema, auditVerificationSchema,
} from '@auditsphere/contracts';
import { toAdjustmentJournalDetailView } from '../../../packages/server/src/modules/fieldwork/adjustment-response.js';
import { toPublicationDetailView } from '../../../packages/server/src/modules/fieldwork/publication-response.js';
import { toMappingSuggestionsView, toTaxonomyView } from '../../../packages/server/src/modules/fieldwork/taxonomy-response.js';
import { toLifecycleHistoryView } from '../../../packages/server/src/modules/governance/lifecycle-response.js';
import { toReviewNoteView } from '../../../packages/server/src/modules/reporting/review-note-response.js';
import { toCommercialDualKeyStatus, toCommercialProposalView } from '../../../packages/server/src/modules/commercial/commercial-response.js';
import { toPracticeInvoiceView, toPracticeLedgerView } from '../../../packages/server/src/modules/practice/practice-response.js';
import { toAuditEventView } from '../../../packages/server/src/platform/audit-response.js';

class ContractFixtureController {
  create(_input: unknown) {
    return {
      id: 'fixture-user', email: 'fixture@example.test', active: true,
      passwordHash: 'must-never-leave-the-server', entraObjectId: 'tenant-directory-secret',
    };
  }

  invalidResponse(input: unknown) { return input; }

  page(input: unknown) { return input; }

  trialBalanceImport() {
    return {
      id: '11111111-1111-4111-8111-111111111111', status: 'MAPPING_REQUIRED', error: null,
      rowCount: 4, version: 2, createdAt: '2026-10-03T00:00:00.000Z',
      firmId: 'must-stay-server-side', clientId: 'must-stay-server-side', engagementId: 'must-stay-server-side',
      documentId: 'must-stay-server-side', documentVersionId: 'must-stay-server-side', sha256: 'must-stay-server-side',
      storageReference: 'graph:must-stay-server-side', downloadUrl: 'https://tenant.sharepoint.com/preauthenticated', graphAccessToken: 'must-stay-server-side',
    };
  }

  riskView() {
    return {
      riskId: '11111111-1111-4111-8111-111111111111', title: 'Revenue recognition', description: 'Occurrence and cut-off',
      createdAt: '2026-10-03T00:00:00.000Z', currentBand: 'RED', currentAssessmentId: '22222222-2222-4222-8222-222222222222',
      requiresPartnerClearance: true, cleared: false, assessmentCount: 1,
      owner: { ownerUserId: '33333333-3333-4333-8333-333333333333', ownerStaffingLevel: 'EngagementPartner', assignedAt: '2026-10-03T01:00:00.000Z' },
      firmId: 'must-stay-server-side', clientId: 'must-stay-server-side', engagementId: 'must-stay-server-side', createdBy: 'must-stay-server-side',
    };
  }

  materialityView() {
    return {
      assessmentId: '11111111-1111-4111-8111-111111111111', publicationId: '22222222-2222-4222-8222-222222222222',
      taxonomyVersionId: '33333333-3333-4333-8333-333333333333', benchmarkKind: 'REVENUE', destinationCode: null,
      sourceLineCount: 5, currency: 'QAR', benchmarkAmount: '1000.000000', planningMateriality: '50.000000',
      tolerableError: '25.000000', sadThreshold: '2.500000', ratePercent: '5.000000', performancePercent: '50.000000',
      trivialPercent: '5.000000', policyVersion: 'PM-2026.1', inputHash: 'a'.repeat(64), status: 'DRAFT',
      calculatedAt: '2026-10-03T00:00:00.000Z', approvedAt: null, stale: false, currentPublicationId: '22222222-2222-4222-8222-222222222222',
      firmId: 'must-stay-server-side', clientId: 'must-stay-server-side', engagementId: 'must-stay-server-side',
      calculatedBy: 'must-stay-server-side', approvedBy: 'must-stay-server-side',
    };
  }

  reviewNote() {
    const note = {
      id: '11111111-1111-4111-8111-111111111111', workpackage: 'Revenue', body: 'Inspect cut-off sample', status: 'OPEN',
      raisedAt: new Date('2026-10-03T00:00:00.000Z'), resolution: null, resolvedAt: null,
      firmId: 'must-stay-server-side', clientId: 'must-stay-server-side', engagementId: 'must-stay-server-side',
      raisedBy: 'must-stay-server-side', resolvedBy: 'must-stay-server-side',
    };
    return toReviewNoteView(note);
  }

  reviewSummary() {
    return { open: 2, resolved: 3, total: 5, engagementId: 'must-stay-server-side' };
  }

  adjustmentDetail() {
    const journal = {
      id: '11111111-1111-4111-8111-111111111111', reference: 'AJ-001', memo: 'Record audit adjustment', status: 'DRAFT', version: 1,
      createdAt: new Date('2026-10-03T00:00:00.000Z'), postedAt: null, reversesJournalId: null,
      firmId: 'must-stay-server-side', clientId: 'must-stay-server-side', engagementId: 'must-stay-server-side',
      createdBy: 'must-stay-server-side', postedBy: 'must-stay-server-side',
      lines: [
        { id: '22222222-2222-4222-8222-222222222222', journalId: 'must-stay-server-side', position: 0, accountCode: '4000', fsli: 'Revenue', debit: { toFixed: () => '10.000000' }, credit: { toFixed: () => '0.000000' } },
        { id: '33333333-3333-4333-8333-333333333333', journalId: 'must-stay-server-side', position: 1, accountCode: '1100', fsli: 'Receivables', debit: { toFixed: () => '0.000000' }, credit: { toFixed: () => '10.000000' } },
      ],
    };
    return toAdjustmentJournalDetailView(journal);
  }

  adjustedBalances() {
    return {
      publicationId: '11111111-1111-4111-8111-111111111111', publicationSequence: 2, currency: 'QAR', journalCount: 1,
      items: [{ fsli: 'Revenue', publishedCurrent: '100.000000', adjustmentNet: '10.000000', adjustedCurrent: '110.000000' }],
      totals: { publishedCurrent: '100.000000', adjustmentNet: '10.000000', adjustedCurrent: '110.000000' },
      engagementId: 'must-stay-server-side', includedJournalReferences: ['AJ-001'],
    };
  }

  publicationDetail() {
    const publication = {
      id: '11111111-1111-4111-8111-111111111111', sequence: 2, currency: 'QAR', rowCount: 1, digest: 'a'.repeat(64),
      publishedAt: new Date('2026-10-03T00:00:00.000Z'), firmId: 'must-stay-server-side', clientId: 'must-stay-server-side',
      engagementId: 'must-stay-server-side', importId: 'must-stay-server-side', publishedBy: 'must-stay-server-side',
      rows: [{ id: '22222222-2222-4222-8222-222222222222', publicationId: 'must-stay-server-side', position: 0, code: '4000', name: 'Sales', fsli: 'Revenue', current: { toFixed: () => '100.000000' }, prior: { toFixed: () => '80.000000' } }],
    };
    return toPublicationDetailView(publication);
  }

  publicationResult() {
    return { publicationId: '11111111-1111-4111-8111-111111111111', sequence: 2, rowCount: 1, digest: 'a'.repeat(64), currency: 'QAR', firmId: 'must-stay-server-side' };
  }

  taxonomyList() {
    const version = {
      id: '11111111-1111-4111-8111-111111111111', name: 'Default', version: 2, status: 'APPROVED',
      createdAt: new Date('2026-10-02T00:00:00.000Z'), approvedAt: new Date('2026-10-03T00:00:00.000Z'),
      firmId: 'must-stay-server-side', createdBy: 'must-stay-server-side', approvedBy: 'must-stay-server-side',
      lines: [{ id: '22222222-2222-4222-8222-222222222222', taxonomyVersionId: 'must-stay-server-side', code: 'REV', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 }],
    };
    return [toTaxonomyView(version)];
  }

  mappingSuggestions() {
    return toMappingSuggestionsView({
      importId: '11111111-1111-4111-8111-111111111111', taxonomyVersionId: '22222222-2222-4222-8222-222222222222',
      taxonomyVersion: 2, suggested: 1, alreadyMapped: 0, unresolved: 0,
      items: [{ rowId: '33333333-3333-4333-8333-333333333333', code: '4000', name: 'Sales', currentFsli: null, suggestedFsli: 'REV', reason: 'MEMORY',
        provenance: { memoryEntryId: 'must-stay-server-side', sourceApprovalId: '44444444-4444-4444-8444-444444444444', timesApplied: 2, lastApprovedAt: new Date('2026-10-02T00:00:00.000Z') } }],
    });
  }

  lifecycleHistory() {
    return toLifecycleHistoryView({
      state: 'FIELDWORK_EXECUTION', version: 3, terminalOutcome: null, permittedCommands: ['SUBMIT_FOR_REVIEW'],
      history: [{ id: '11111111-1111-4111-8111-111111111111', command: 'START_FIELDWORK', fromState: 'PORTAL_ACTIVE_PLANNING', toState: 'FIELDWORK_EXECUTION',
        actorId: 'must-stay-server-side', reason: null, evidence: { importId: 'must-stay-server-side' }, version: 3,
        createdAt: new Date('2026-10-03T00:00:00.000Z'), engagementId: 'must-stay-server-side' }],
    });
  }

  lifecycleGates() {
    return {
      state: 'MANAGERIAL_REVIEW', version: 3, terminalOutcome: null,
      commands: [{ command: 'APPROVE_MANAGER_REVIEW', ready: false, requiresReason: false, unmet: [{ code: 'OPEN_REVIEW_NOTES', message: 'Resolve all open review notes before approving managerial review' }] }],
    };
  }

  commercialProposalList() {
    const fixed = (value: string) => ({ toFixed: (scale: number) => Number(value).toFixed(scale) });
    return [toCommercialProposalView({
      id: '11111111-1111-4111-8111-111111111111', service: 'Annual statutory audit',
      periodStart: new Date('2026-01-01T00:00:00.000Z'), periodEnd: new Date('2026-12-31T00:00:00.000Z'),
      totalAmount: fixed('12500'), currency: 'QAR', status: 'PRESENTED', revision: 2,
      createdAt: new Date('2026-10-01T00:00:00.000Z'), firmId: 'server-only', clientId: 'server-only', engagementId: 'server-only',
      createdBy: 'server-only', presentedSnapshot: { internal: true }, clientResponse: { internal: true },
    })];
  }

  commercialDualKeyStatus() {
    return toCommercialDualKeyStatus({
      key1Status: 'RECORDED', key1ProposalId: '11111111-1111-4111-8111-111111111111', key2Status: 'RECORDED',
      key2Reason: 'Partner clearance recorded for the acceptance fixture', letterIssued: true, letterText: 'Audit engagement letter',
      letterIssuedAt: new Date('2026-10-02T00:00:00.000Z'),
      clearances: [{ id: '22222222-2222-4222-8222-222222222222', reason: 'Acceptance risks reviewed', clearedAt: new Date('2026-10-02T00:00:00.000Z'), clearedBy: 'server-only', engagementId: 'server-only' }],
      firmId: 'server-only', clientId: 'server-only', letterIssuedBy: 'server-only',
    });
  }

  practiceLedgerView() {
    const fixed = (value: string) => ({ toFixed: (scale: number) => Number(value).toFixed(scale) });
    return toPracticeLedgerView({
      currency: 'QAR', firmId: 'server-only',
      accounts: [{ id: '11111111-1111-4111-8111-111111111111', firmId: 'server-only', code: '1000', name: 'Cash', kind: 'ASSET', active: true, posting: true }],
      periods: [{ id: '22222222-2222-4222-8222-222222222222', firmId: 'server-only', startsOn: new Date('2026-01-01T00:00:00.000Z'), endsOn: new Date('2026-12-31T00:00:00.000Z'), closed: false, version: 1, lastTransitionReason: '', lastTransitionBy: 'server-only' }],
      journals: [{ id: '33333333-3333-4333-8333-333333333333', firmId: 'server-only', periodId: '22222222-2222-4222-8222-222222222222', accountingDate: new Date('2026-10-01T00:00:00.000Z'), reference: 'J-001', memo: 'Opening balance', status: 'POSTED', version: 2, postedAt: new Date('2026-10-01T01:00:00.000Z'), reversalOf: null, createdBy: 'server-only', postedBy: 'server-only', lines: [
        { id: '44444444-4444-4444-8444-444444444444', firmId: 'server-only', journalId: 'server-only', accountId: '11111111-1111-4111-8111-111111111111', position: 0, debit: fixed('100'), credit: fixed('0') },
      ] }],
      balances: [{ accountId: '11111111-1111-4111-8111-111111111111', code: '1000', name: 'Cash', kind: 'ASSET', debit: '100.000000', credit: '0.000000', balance: '100.000000' }],
    });
  }

  invoiceList() {
    const fixed = (value: string) => ({ toFixed: (scale: number) => Number(value).toFixed(scale) });
    return [toPracticeInvoiceView({
      id: '55555555-5555-4555-8555-555555555555', number: 1, revision: 1, kind: 'ADVANCE_50',
      proposalId: '66666666-6666-4666-8666-666666666666', proposalRevision: 1, contractFee: fixed('10000'),
      amount: fixed('5000'), currency: 'QAR', dueOn: new Date('2026-10-31T00:00:00.000Z'),
      status: 'PAID', issuedAt: new Date('2026-10-01T00:00:00.000Z'), paidToDate: '5000.00', receiptIssued: true,
      lines: [{ position: 1, description: 'External audit', amount: fixed('5000') }], voidReason: null,
      firmId: 'server-only', clientId: 'server-only', engagementId: 'server-only', issuedBy: 'server-only', payments: [{ id: 'server-only' }],
    })];
  }

  auditCheckpoint() {
    return { formatVersion: 1, engagementId: '11111111-1111-4111-8111-111111111111', sequence: '3', digest: 'a'.repeat(64), internalKey: 'server-only' };
  }

  auditVerification() { return { valid: false, reason: 'Unchained events detected', internalRows: 42 }; }

  auditEvents() {
    return [toAuditEventView({
      id: '22222222-2222-4222-8222-222222222222', actorKind: 'USER', actorId: '33333333-3333-4333-8333-333333333333',
      action: 'PRACTICE_JOURNAL_POSTED', resourceType: 'PracticeJournal', resourceId: '44444444-4444-4444-8444-444444444444',
      resourceVersion: 2, correlationId: 'acceptance-123', payload: { journalId: '44444444-4444-4444-8444-444444444444' },
      beforeState: null, afterState: { status: 'POSTED' }, createdAt: new Date('2026-10-03T02:00:00.000Z'),
      engagementId: 'server-only', firmId: 'server-only', chainDigest: 'server-only',
    })];
  }

}
const fixtureTarget = ContractFixtureController.prototype;
function decorateMethod(name: string, ...decorators: MethodDecorator[]) {
  const descriptor = Object.getOwnPropertyDescriptor(fixtureTarget, name);
  if (!descriptor) throw new Error(`Missing fixture handler ${name}`);
  for (const decorator of decorators) decorator(fixtureTarget, name, descriptor);
}
Controller('contract-fixture')(ContractFixtureController);
ApiTags('Contract fixture')(ContractFixtureController);
ApiDefaultResponse({ standardSchema: apiProblemSchema })(ContractFixtureController);
UsePipes(new StandardSchemaValidationPipe())(ContractFixtureController);
UseInterceptors(StandardSchemaSerializerInterceptor)(ContractFixtureController);
decorateMethod('create', Post(), ApiCreatedResponse({ standardSchema: internalIdentitySchema }), SerializeOptions({ schema: internalIdentitySchema }));
Body({ schema: assignEngagementStaffSchema })(fixtureTarget, 'create', 0);
decorateMethod('invalidResponse', Post('invalid-response'), ApiCreatedResponse({ standardSchema: engagementStaffAssignmentResultSchema }), SerializeOptions({ schema: engagementStaffAssignmentResultSchema }));
Body({ schema: assignEngagementStaffSchema })(fixtureTarget, 'invalidResponse', 0);
decorateMethod('page', Get('page'));
Query({ schema: paginationQuerySchema })(fixtureTarget, 'page', 0);
decorateMethod('trialBalanceImport', Get('trial-balance-import'));
decorateMethod('trialBalanceImport', ApiOkResponse({ standardSchema: trialBalanceImportSchema }), SerializeOptions({ schema: trialBalanceImportSchema }));
decorateMethod('riskView', Get('risk-view'));
decorateMethod('riskView', ApiOkResponse({ standardSchema: riskViewSchema }), SerializeOptions({ schema: riskViewSchema }));
decorateMethod('materialityView', Get('materiality-view'));
decorateMethod('materialityView', ApiOkResponse({ standardSchema: materialityAssessmentSchema }), SerializeOptions({ schema: materialityAssessmentSchema }));
decorateMethod('reviewNote', Get('review-note'));
decorateMethod('reviewNote', ApiOkResponse({ standardSchema: reviewNoteSchema }), SerializeOptions({ schema: reviewNoteSchema }));
decorateMethod('reviewSummary', Get('review-summary'));
decorateMethod('reviewSummary', ApiOkResponse({ standardSchema: reviewSummarySchema }), SerializeOptions({ schema: reviewSummarySchema }));
decorateMethod('adjustmentDetail', Get('adjustment-detail'));
decorateMethod('adjustmentDetail', ApiOkResponse({ standardSchema: adjustmentJournalDetailSchema }), SerializeOptions({ schema: adjustmentJournalDetailSchema }));
decorateMethod('adjustedBalances', Get('adjusted-balances'));
decorateMethod('adjustedBalances', ApiOkResponse({ standardSchema: adjustedBalancesSchema }), SerializeOptions({ schema: adjustedBalancesSchema }));
decorateMethod('publicationDetail', Get('publication-detail'));
decorateMethod('publicationDetail', ApiOkResponse({ standardSchema: publicationDetailSchema }), SerializeOptions({ schema: publicationDetailSchema }));
decorateMethod('publicationResult', Post('publication-result'));
decorateMethod('publicationResult', ApiCreatedResponse({ standardSchema: publicationResultSchema }), SerializeOptions({ schema: publicationResultSchema }));
decorateMethod('taxonomyList', Get('taxonomy-list'));
decorateMethod('taxonomyList', ApiOkResponse({ standardSchema: taxonomyViewSchema, isArray: true }), SerializeOptions({ schema: taxonomyViewSchema }));
decorateMethod('mappingSuggestions', Get('mapping-suggestions'));
decorateMethod('mappingSuggestions', ApiOkResponse({ standardSchema: mappingSuggestionsSchema }), SerializeOptions({ schema: mappingSuggestionsSchema }));
decorateMethod('lifecycleHistory', Get('lifecycle-history'));
decorateMethod('lifecycleHistory', ApiOkResponse({ standardSchema: lifecycleHistorySchema }), SerializeOptions({ schema: lifecycleHistorySchema }));
decorateMethod('lifecycleGates', Get('lifecycle-gates'));
decorateMethod('lifecycleGates', ApiOkResponse({ standardSchema: lifecycleGatesSchema }), SerializeOptions({ schema: lifecycleGatesSchema }));
decorateMethod('commercialProposalList', Get('commercial-proposals'));
decorateMethod('commercialProposalList', ApiOkResponse({ standardSchema: commercialProposalViewSchema, isArray: true }), SerializeOptions({ schema: commercialProposalViewSchema }));
decorateMethod('commercialDualKeyStatus', Get('commercial-dual-key'));
decorateMethod('commercialDualKeyStatus', ApiOkResponse({ standardSchema: commercialDualKeyStatusSchema }), SerializeOptions({ schema: commercialDualKeyStatusSchema }));
decorateMethod('practiceLedgerView', Get('practice-ledger'));
decorateMethod('practiceLedgerView', ApiOkResponse({ standardSchema: practiceLedgerSchema }), SerializeOptions({ schema: practiceLedgerSchema }));
decorateMethod('invoiceList', Get('invoice-list'));
decorateMethod('invoiceList', ApiOkResponse({ standardSchema: invoiceViewSchema, isArray: true }), SerializeOptions({ schema: invoiceViewSchema }));
decorateMethod('auditCheckpoint', Get('audit-checkpoint'));
decorateMethod('auditCheckpoint', ApiOkResponse({ standardSchema: auditCheckpointSchema }), SerializeOptions({ schema: auditCheckpointSchema }));
decorateMethod('auditVerification', Get('audit-verification'));
decorateMethod('auditVerification', ApiOkResponse({ standardSchema: auditVerificationSchema }), SerializeOptions({ schema: auditVerificationSchema }));
decorateMethod('auditEvents', Get('audit-events'));
decorateMethod('auditEvents', ApiOkResponse({ standardSchema: auditEventSchema, isArray: true }), SerializeOptions({ schema: auditEventSchema }));
class ContractTestModule {}
Module({ controllers: [ContractFixtureController] })(ContractTestModule);

test('Nest API contracts reject invalid input, strip sensitive output and generate OpenAPI schemas', async () => {
  assert.equal(apiErrorCodeForStatus(400), 'BAD_REQUEST');
  assert.equal(apiErrorCodeForStatus(401), 'UNAUTHENTICATED');
  assert.equal(apiErrorCodeForStatus(403), 'FORBIDDEN');
  assert.equal(apiErrorCodeForStatus(404), 'NOT_FOUND');
  assert.equal(apiErrorCodeForStatus(409), 'CONFLICT');
  assert.equal(apiErrorCodeForStatus(413), 'PAYLOAD_TOO_LARGE');
  assert.equal(apiErrorCodeForStatus(503), 'SERVICE_UNAVAILABLE');
  assert.equal(apiErrorCodeForStatus(500), 'INTERNAL_SERVER_ERROR');
  assert.equal(apiErrorCodeForStatus(499), 'HTTP_ERROR');
  const app = await NestFactory.create<NestFastifyApplication>(ContractTestModule, new FastifyAdapter(), { logger: false });
  try {
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiProblemExceptionFilter());
    await app.init();
    const server = app.getHttpAdapter().getInstance();
    await server.ready();

    const malformed = await server.inject({
      method: 'POST', url: '/api/v1/contract-fixture',
      payload: { idempotencyKey: 'not-a-uuid', expectedVersion: 0, userId: 'bad', role: 'SUPERUSER', capabilities: [], expiresAt: 'tomorrow', reason: '' },
    });
    assert.equal(malformed.statusCode, 400, 'runtime validation rejects invalid JSON before the command reaches its service');
    const malformedProblem = malformed.json();
    assert.equal(malformedProblem.error.code, 'BAD_REQUEST', 'problem code is stable and independent of HTTP status');
    assert.equal(malformedProblem.error.status, 400, 'problem envelope retains the numeric HTTP status');

    const serialized = await server.inject({ method: 'POST', url: '/api/v1/contract-fixture', payload: { idempotencyKey: '11111111-1111-4111-8111-111111111111', expectedVersion: 1, userId: '22222222-2222-4222-8222-222222222222', role: 'PREPARER', capabilities: ['ENGAGEMENT_READ'], expiresAt: '2027-01-01T00:00:00.000Z', reason: 'Temporary synthetic fixture assignment' } });
    assert.equal(serialized.statusCode, 201);
    assert.deepEqual(serialized.json(), { id: 'fixture-user', email: 'fixture@example.test', active: true });
    assert.equal(serialized.body.includes('passwordHash'), false);
    assert.equal(serialized.body.includes('entraObjectId'), false);

    const invalidResponse = await server.inject({ method: 'POST', url: '/api/v1/contract-fixture/invalid-response', payload: { idempotencyKey: '11111111-1111-4111-8111-111111111111', expectedVersion: 1, userId: '22222222-2222-4222-8222-222222222222', role: 'PREPARER', capabilities: ['ENGAGEMENT_READ'], expiresAt: '2027-01-01T00:00:00.000Z', reason: 'Temporary synthetic fixture assignment' } });
    assert.equal(invalidResponse.statusCode, 500, 'response serialization rejects output that violates its declared response contract');
    assert.equal(invalidResponse.json().error.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(invalidResponse.json().error.status, 500);

    const invalidPage = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/page?offset=-1&limit=201' });
    assert.equal(invalidPage.statusCode, 400, 'runtime query validation enforces offset and limit bounds');
    const validPage = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/page?offset=20&limit=150' });
    assert.equal(validPage.statusCode, 200);
    assert.deepEqual(validPage.json(), { offset: 20, limit: 150 }, 'query strings are coerced to bounded numeric values');

    const importResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/trial-balance-import' });
    assert.equal(importResponse.statusCode, 200);
    assert.deepEqual(importResponse.json(), {
      id: '11111111-1111-4111-8111-111111111111', status: 'MAPPING_REQUIRED', error: null,
      rowCount: 4, version: 2, createdAt: '2026-10-03T00:00:00.000Z',
    }, 'Trial Balance response allowlist excludes document versions, provider references, download URLs and credentials');
    assert.equal(importResponse.body.includes('preauthenticated'), false);
    assert.equal(importResponse.body.includes('graphAccessToken'), false);
    const riskResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/risk-view' });
    assert.equal(riskResponse.statusCode, 200);
    assert.deepEqual(riskResponse.json(), {
      riskId: '11111111-1111-4111-8111-111111111111', title: 'Revenue recognition', description: 'Occurrence and cut-off',
      createdAt: '2026-10-03T00:00:00.000Z', currentBand: 'RED', currentAssessmentId: '22222222-2222-4222-8222-222222222222',
      requiresPartnerClearance: true, cleared: false, assessmentCount: 1,
      owner: { ownerUserId: '33333333-3333-4333-8333-333333333333', ownerStaffingLevel: 'EngagementPartner', assignedAt: '2026-10-03T01:00:00.000Z' },
    }, 'risk response allowlist omits firm/client/engagement/creator fields');
    const materialityResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/materiality-view' });
    assert.equal(materialityResponse.statusCode, 200);
    assert.deepEqual(materialityResponse.json(), {
      assessmentId: '11111111-1111-4111-8111-111111111111', publicationId: '22222222-2222-4222-8222-222222222222',
      taxonomyVersionId: '33333333-3333-4333-8333-333333333333', benchmarkKind: 'REVENUE', destinationCode: null,
      sourceLineCount: 5, currency: 'QAR', benchmarkAmount: '1000.000000', planningMateriality: '50.000000',
      tolerableError: '25.000000', sadThreshold: '2.500000', ratePercent: '5.000000', performancePercent: '50.000000',
      trivialPercent: '5.000000', policyVersion: 'PM-2026.1', inputHash: 'a'.repeat(64), status: 'DRAFT',
      calculatedAt: '2026-10-03T00:00:00.000Z', approvedAt: null, stale: false, currentPublicationId: '22222222-2222-4222-8222-222222222222',
    }, 'materiality response allowlist omits ownership and calculator/approver columns');
    const reviewNoteResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/review-note' });
    assert.equal(reviewNoteResponse.statusCode, 200);
    assert.deepEqual(reviewNoteResponse.json(), {
      id: '11111111-1111-4111-8111-111111111111', workpackage: 'Revenue', body: 'Inspect cut-off sample', status: 'OPEN',
      raisedAt: '2026-10-03T00:00:00.000Z', resolution: null, resolvedAt: null,
    }, 'review-note response serializes dates and excludes the note author and tenant ownership');
    const reviewSummaryResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/review-summary' });
    assert.equal(reviewSummaryResponse.statusCode, 200);
    assert.deepEqual(reviewSummaryResponse.json(), { open: 2, resolved: 3, total: 5 });
    const adjustmentDetailResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/adjustment-detail' });
    assert.equal(adjustmentDetailResponse.statusCode, 200);
    assert.deepEqual(adjustmentDetailResponse.json(), {
      id: '11111111-1111-4111-8111-111111111111', reference: 'AJ-001', memo: 'Record audit adjustment', status: 'DRAFT', version: 1,
      createdAt: '2026-10-03T00:00:00.000Z', postedAt: null, reversesJournalId: null,
      lines: [
        { position: 0, accountCode: '4000', fsli: 'Revenue', debit: '10.000000', credit: '0.000000' },
        { position: 1, accountCode: '1100', fsli: 'Receivables', debit: '0.000000', credit: '10.000000' },
      ],
    }, 'adjustment detail serializes dates/decimal values and excludes line, actor and tenant persistence keys');
    const adjustedBalancesResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/adjusted-balances' });
    assert.equal(adjustedBalancesResponse.statusCode, 200);
    assert.deepEqual(adjustedBalancesResponse.json(), {
      publicationId: '11111111-1111-4111-8111-111111111111', publicationSequence: 2, currency: 'QAR', journalCount: 1,
      items: [{ fsli: 'Revenue', publishedCurrent: '100.000000', adjustmentNet: '10.000000', adjustedCurrent: '110.000000' }],
      totals: { publishedCurrent: '100.000000', adjustmentNet: '10.000000', adjustedCurrent: '110.000000' },
    }, 'adjusted balances omit engagement scope and raw journal-reference projections');
    const publicationDetailResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/publication-detail' });
    assert.equal(publicationDetailResponse.statusCode, 200);
    assert.deepEqual(publicationDetailResponse.json(), {
      id: '11111111-1111-4111-8111-111111111111', sequence: 2, currency: 'QAR', rowCount: 1, digest: 'a'.repeat(64), publishedAt: '2026-10-03T00:00:00.000Z',
      rows: [{ id: '22222222-2222-4222-8222-222222222222', position: 0, code: '4000', name: 'Sales', fsli: 'Revenue', current: '100.000000', prior: '80.000000' }],
    }, 'published balances are immutable transport rows with fixed-scale decimal text and no import or tenant keys');
    const publicationResultResponse = await server.inject({ method: 'POST', url: '/api/v1/contract-fixture/publication-result', payload: {} });
    assert.equal(publicationResultResponse.statusCode, 201);
    assert.deepEqual(publicationResultResponse.json(), { publicationId: '11111111-1111-4111-8111-111111111111', sequence: 2, rowCount: 1, digest: 'a'.repeat(64), currency: 'QAR' });
    const taxonomyListResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/taxonomy-list' });
    const taxonomyCheck = taxonomyViewsSchema.safeParse(new ContractFixtureController().taxonomyList());
    assert.equal(taxonomyCheck.success, true, JSON.stringify(taxonomyCheck));
    assert.equal(taxonomyListResponse.statusCode, 200, taxonomyListResponse.body);
    assert.deepEqual(taxonomyListResponse.json(), [{
      id: '11111111-1111-4111-8111-111111111111', name: 'Default', version: 2, status: 'APPROVED',
      createdAt: '2026-10-02T00:00:00.000Z', approvedAt: '2026-10-03T00:00:00.000Z',
      lines: [{ id: '22222222-2222-4222-8222-222222222222', code: 'REV', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 }],
    }], 'taxonomy response omits creator, approver and firm persistence fields');
    const mappingSuggestionsResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/mapping-suggestions' });
    assert.equal(mappingSuggestionsResponse.statusCode, 200);
    assert.deepEqual(mappingSuggestionsResponse.json(), {
      importId: '11111111-1111-4111-8111-111111111111', taxonomyVersionId: '22222222-2222-4222-8222-222222222222',
      taxonomyVersion: 2, suggested: 1, alreadyMapped: 0, unresolved: 0,
      items: [{ rowId: '33333333-3333-4333-8333-333333333333', code: '4000', name: 'Sales', currentFsli: null, suggestedFsli: 'REV', reason: 'MEMORY',
        provenance: { sourceApprovalId: '44444444-4444-4444-8444-444444444444', timesApplied: 2, lastApprovedAt: '2026-10-02T00:00:00.000Z' } }],
    }, 'mapping suggestions retain approval provenance while hiding memory-entry internals');
    const lifecycleHistoryResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/lifecycle-history' });
    assert.equal(lifecycleHistoryResponse.statusCode, 200);
    assert.deepEqual(lifecycleHistoryResponse.json(), {
      state: 'FIELDWORK_EXECUTION', version: 3, terminalOutcome: null, permittedCommands: ['SUBMIT_FOR_REVIEW'],
      history: [{ id: '11111111-1111-4111-8111-111111111111', command: 'START_FIELDWORK', fromState: 'PORTAL_ACTIVE_PLANNING', toState: 'FIELDWORK_EXECUTION', reason: null, version: 3, createdAt: '2026-10-03T00:00:00.000Z' }],
    }, 'lifecycle history retains authoritative stage and reason but omits raw evidence and actor identifiers');
    const lifecycleGatesResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/lifecycle-gates' });
    assert.equal(lifecycleGatesResponse.statusCode, 200, lifecycleGatesResponse.body);
    assert.deepEqual(lifecycleGatesResponse.json(), {
      state: 'MANAGERIAL_REVIEW', version: 3, terminalOutcome: null,
      commands: [{ command: 'APPROVE_MANAGER_REVIEW', ready: false, requiresReason: false, unmet: [{ code: 'OPEN_REVIEW_NOTES', message: 'Resolve all open review notes before approving managerial review' }] }],
    }, 'lifecycle gate response serializes actionable unmet requirements');

    const proposalListResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/commercial-proposals' });
    assert.equal(proposalListResponse.statusCode, 200, proposalListResponse.body);
    assert.deepEqual(proposalListResponse.json(), [{
      id: '11111111-1111-4111-8111-111111111111', service: 'Annual statutory audit', periodStart: '2026-01-01', periodEnd: '2026-12-31',
      totalAmount: '12500.00', currency: 'QAR', status: 'PRESENTED', revision: 2, createdAt: '2026-10-01T00:00:00.000Z',
    }], 'commercial proposal list serializes accounting dates and money and omits tenant, actor and snapshot internals');
    const dualKeyResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/commercial-dual-key' });
    assert.equal(dualKeyResponse.statusCode, 200, dualKeyResponse.body);
    assert.deepEqual(dualKeyResponse.json(), {
      key1Status: 'RECORDED', key1ProposalId: '11111111-1111-4111-8111-111111111111', key2Status: 'RECORDED',
      key2Reason: 'Partner clearance recorded for the acceptance fixture', letterIssued: true, letterText: 'Audit engagement letter',
      letterIssuedAt: '2026-10-02T00:00:00.000Z',
      clearances: [{ id: '22222222-2222-4222-8222-222222222222', reason: 'Acceptance risks reviewed', clearedAt: '2026-10-02T00:00:00.000Z' }],
    }, 'dual-key result retains evidence status and reason while omitting tenant and partner identity keys');
    const practiceLedgerResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/practice-ledger' });
    assert.equal(practiceLedgerResponse.statusCode, 200, practiceLedgerResponse.body);
    assert.deepEqual(practiceLedgerResponse.json(), {
      currency: 'QAR',
      accounts: [{ id: '11111111-1111-4111-8111-111111111111', code: '1000', name: 'Cash', kind: 'ASSET', active: true, posting: true }],
      periods: [{ id: '22222222-2222-4222-8222-222222222222', startsOn: '2026-01-01', endsOn: '2026-12-31', closed: false, version: 1, lastTransitionReason: '' }],
      journals: [{ id: '33333333-3333-4333-8333-333333333333', periodId: '22222222-2222-4222-8222-222222222222', accountingDate: '2026-10-01', reference: 'J-001', memo: 'Opening balance', status: 'POSTED', version: 2, postedAt: '2026-10-01T01:00:00.000Z', reversalOf: null,
        lines: [{ id: '44444444-4444-4444-8444-444444444444', accountId: '11111111-1111-4111-8111-111111111111', position: 0, debit: '100.000000', credit: '0.000000' }] }],
      balances: [{ accountId: '11111111-1111-4111-8111-111111111111', code: '1000', name: 'Cash', kind: 'ASSET', debit: '100.000000', credit: '0.000000', balance: '100.000000' }],
    }, 'Practice views serialize date-only periods, six-place accounting amounts and omit firm/actor/join columns');
    const invoiceListResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/invoice-list' });
    assert.equal(invoiceListResponse.statusCode, 200, invoiceListResponse.body);
    assert.deepEqual(invoiceListResponse.json(), [{
      id: '55555555-5555-4555-8555-555555555555', number: 1, revision: 1, kind: 'ADVANCE_50',
      proposalId: '66666666-6666-4666-8666-666666666666', proposalRevision: 1, contractFee: '10000.00',
      amount: '5000.00', currency: 'QAR', dueOn: '2026-10-31', status: 'PAID',
      issuedAt: '2026-10-01T00:00:00.000Z', paidToDate: '5000.00', receiptIssued: true,
      lines: [{ position: 1, description: 'External audit', amount: '5000.00' }], voidReason: null,
    }], 'invoice list serializes currency amounts and excludes firm, client, engagement, issuer and payment-row internals');
    const checkpointResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/audit-checkpoint' });
    assert.equal(checkpointResponse.statusCode, 200, checkpointResponse.body);
    assert.deepEqual(checkpointResponse.json(), { formatVersion: 1, engagementId: '11111111-1111-4111-8111-111111111111', sequence: '3', digest: 'a'.repeat(64) });
    const auditVerificationResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/audit-verification' });
    assert.equal(auditVerificationResponse.statusCode, 200, auditVerificationResponse.body);
    assert.deepEqual(auditVerificationResponse.json(), { valid: false, reason: 'Unchained events detected' });
    const auditEventsResponse = await server.inject({ method: 'GET', url: '/api/v1/contract-fixture/audit-events' });
    assert.equal(auditEventsResponse.statusCode, 200, auditEventsResponse.body);
    assert.deepEqual(auditEventsResponse.json(), [{
      id: '22222222-2222-4222-8222-222222222222', actorKind: 'USER', actorId: '33333333-3333-4333-8333-333333333333',
      action: 'PRACTICE_JOURNAL_POSTED', resourceType: 'PracticeJournal', resourceId: '44444444-4444-4444-8444-444444444444',
      resourceVersion: 2, correlationId: 'acceptance-123', payload: { journalId: '44444444-4444-4444-8444-444444444444' },
      beforeState: null, afterState: { status: 'POSTED' }, createdAt: '2026-10-03T02:00:00.000Z',
    }], 'audit event allows only verified metadata and JSON payload while omitting tenant and hash-chain internals');
    assert.doesNotThrow(() => trialBalanceRowsPageSchema.parse({ total: 1, rows: [{ id: '11111111-1111-4111-8111-111111111111', code: '1000', name: 'Cash', current: '12.000000', prior: '10.000000', fsli: 'Cash and equivalents', version: 1 }] }));

    const document = JSON.parse(readFileSync(resolve('packages/contracts/openapi.json'), 'utf8')) as {
      paths: Record<string, Record<string, { requestBody?: unknown; responses?: Record<string, unknown>; parameters?: unknown[] }>>;
    };
    assert.ok(document.paths['/health']?.get?.responses?.['200'] && document.paths['/health/ready']?.get?.responses?.['200'], 'liveness and readiness outputs are represented in OpenAPI');
    assert.ok(document.paths['/api/v1/system/version']?.get?.responses?.['200'], 'system version output is represented in OpenAPI');
    const operation = document.paths['/api/v1/engagements/{engagementId}/staff-assignments']?.post;
    assert.ok(operation?.requestBody, 'request schema is represented in generated OpenAPI');
    assert.ok(operation?.responses?.['201'], 'response schema is represented in generated OpenAPI');
    assert.ok(operation?.responses?.default, 'structured problem response is represented in generated OpenAPI');
    assert.equal(JSON.stringify(operation?.responses?.['201']).includes('passwordHash'), false);

    const portalLogin = document.paths['/api/v1/portal/auth/login']?.post;
    assert.ok(portalLogin?.requestBody, 'portal credential input schema is represented in generated OpenAPI');
    assert.ok(portalLogin?.responses?.['201'], 'portal login result is represented in generated OpenAPI');
    const portalResponse = JSON.stringify(portalLogin?.responses?.['201']);
    assert.equal(portalResponse.includes('passwordHash'), false);
    assert.equal(portalResponse.includes('sessionToken'), false, 'session tokens are delivered only through HttpOnly cookies');
    assert.equal(portalResponse.includes('csrfToken'), false, 'CSRF tokens are delivered only through the scoped CSRF cookie');

    const missingProblems = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .filter(([, value]) => !value.responses?.default)
        .map(([method]) => method.toUpperCase() + ' ' + path),
    );
    assert.deepEqual(missingProblems, [], 'every documented operation includes the structured problem contract');
    const missingSuccessSchemas = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .flatMap(([method, value]) => Object.entries(value.responses ?? {})
          .filter(([status, response]) => status.startsWith('2') && !Object.values((response as { content?: Record<string, { schema?: unknown }> }).content ?? {}).some((mediaType) => mediaType.schema))
          .map(([status]) => method.toUpperCase() + ' ' + path + ' ' + status)),
    );
    assert.deepEqual(missingSuccessSchemas, [], 'every documented success response has a schema for its media type');
    const documentDownload = document.paths['/api/v1/documents/{documentId}/versions/{versionId}/download']?.get;
    assert.deepEqual((documentDownload?.responses?.['200'] as { content?: Record<string, { schema?: unknown }> })?.content?.['application/octet-stream']?.schema, { type: 'string', format: 'binary' }, 'document downloads are represented as binary bytes rather than JSON');

    const proposals = document.paths['/api/v1/engagements/{engagementId}/commercial/proposals']?.get;
    const pageParameters = (proposals?.parameters ?? []) as Array<{ name: string; in: string; schema?: { minimum?: number; maximum?: number } }>;
    assert.deepEqual(pageParameters.filter(parameter => parameter.in === 'query').map(({ name, schema }) => [name, schema?.minimum, schema?.maximum]), [
      ['offset', 0, 1_000_000], ['limit', 1, 200],
    ], 'bounded paging contracts are visible to generated clients');

    const imports = document.paths['/api/v1/engagements/{engagementId}/imports']?.get;
    const importResponses = JSON.stringify(imports?.responses?.['200']);
    assert.ok(importResponses.includes('rowCount') && importResponses.includes('createdAt'), 'Trial Balance import DTO is present in generated OpenAPI');
    assert.equal(importResponses.includes('firmId'), false, 'Trial Balance import contract excludes persistence scope columns');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/imports/{id}/rows']?.get?.responses?.['200'], 'Trial Balance rows response is represented in OpenAPI');
    const riskResponses = JSON.stringify(document.paths['/api/v1/engagements/{engagementId}/risks']?.get?.responses?.['200']);
    assert.ok(riskResponses.includes('riskId') && riskResponses.includes('owner'), 'risk-list response DTO is represented in OpenAPI');
    assert.equal(riskResponses.includes('firmId'), false, 'risk-list contract excludes persistence scope columns');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/materiality']?.get?.responses?.['200'], 'materiality-list response schema is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/materiality/latest']?.get?.responses?.['200'], 'latest materiality response schema is represented in OpenAPI');
    const materialityResponses = JSON.stringify(document.paths['/api/v1/engagements/{engagementId}/materiality']?.get?.responses?.['200']);
    assert.equal(materialityResponses.includes('calculatedBy'), false, 'materiality response contract excludes internal actor columns');
    const reviewNotes = document.paths['/api/v1/engagements/{engagementId}/review-notes'];
    assert.ok(reviewNotes?.get?.responses?.['200'] && reviewNotes.post?.responses?.['201'], 'review list and raise success contracts are represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/review-notes/summary']?.get?.responses?.['200'], 'review summary success contract is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/review-notes/{noteId}/resolve']?.post?.responses?.['201'], 'review resolution success contract is represented in OpenAPI');
    const adjustments = document.paths['/api/v1/engagements/{engagementId}/adjustments'];
    assert.ok(adjustments?.get?.responses?.['200'] && adjustments.post?.responses?.['201'], 'adjustment list and create success contracts are represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/adjustments/adjusted-balances']?.get?.responses?.['200'], 'adjusted balance success contract is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/adjustments/{journalId}']?.get?.responses?.['200'], 'journal detail success contract is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/adjustments/{journalId}/post']?.post?.responses?.['201'], 'journal posting success contract is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/adjustments/{journalId}/reverse']?.post?.responses?.['201'], 'journal reversal success contract is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/publications/latest']?.get?.responses?.['200'], 'latest publication response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/publications/{publicationId}']?.get?.responses?.['200'], 'publication detail response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/publications']?.post?.responses?.['201'], 'publication command response is represented in OpenAPI');
    const taxonomies = document.paths['/api/v1/engagements/{engagementId}/taxonomies'];
    assert.ok(taxonomies?.get?.responses?.['200'] && taxonomies.post?.responses?.['201'], 'taxonomy list and create responses are represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/taxonomies/{taxonomyVersionId}/approve']?.post?.responses?.['201'], 'taxonomy approval response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/imports/{importId}/mapping-approval']?.post?.responses?.['201'], 'mapping approval response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/imports/{importId}/suggestions']?.get?.responses?.['200'], 'mapping suggestion response is represented in OpenAPI');
    const lifecycle = document.paths['/api/v1/engagements/{engagementId}/lifecycle'];
    assert.ok(lifecycle?.get?.responses?.['200'] && lifecycle.post?.responses?.['201'], 'lifecycle state, history and command responses are represented in OpenAPI');
    const commercial = document.paths['/api/v1/engagements/{engagementId}/commercial/proposals'];
    assert.ok(commercial?.get?.responses?.['200'] && commercial.post?.responses?.['201'], 'commercial list and create responses are represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/commercial/dual-key']?.get?.responses?.['200'], 'dual-key status response is represented in OpenAPI');
    const practice = document.paths['/api/v1/engagements/{engagementId}/practice'];
    assert.ok(practice?.get?.responses?.['200'], 'Practice ledger response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/practice/posting-policy']?.post?.responses?.['201'], 'posting-policy response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/practice/invoices']?.get?.responses?.['200'], 'invoice list response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/practice/invoices/{id}/payment']?.post?.responses?.['201'], 'invoice payment response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/audit/checkpoint']?.get?.responses?.['200'], 'audit checkpoint response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/audit/verify']?.get?.responses?.['200'], 'audit verification response is represented in OpenAPI');
    assert.ok(document.paths['/api/v1/engagements/{engagementId}/audit/events']?.get?.responses?.['200'], 'audit event list response is represented in OpenAPI');
  } finally {
    await app.close();
  }
});
