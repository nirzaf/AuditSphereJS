import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { lifecycleCommandSchema, lifecycleCommands, lifecycleTerminalOutcomes } from '@auditsphere/contracts';
import { requireCapability, requireStaffRole, type StaffRole } from '../../platform/authorization.js';
import { withUnitOfWork, type UnitOfWork } from '../../platform/unit-of-work.js';
import { advanceInvoiceEvidence, finalInvoiceEvidence } from '../practice/public.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Guarded engagement lifecycle commands.
 *
 * The eleven primary state names are preserved, but state never advances by walking an array.
 * A caller names a command; the server derives the only permitted target state from the current
 * state, checks the command's evidence predicate, and writes the state change, the append-only
 * history row, the audit event and the idempotency receipt in one transaction.
 */
export type LifecycleCommand = typeof lifecycleCommands[number];

export type TransitionDefinition = {
  from: readonly string[];
  to: string;
  requiresReason: boolean;
  evidence: 'NONE' | 'FINALIZED_TRIAL_BALANCE' | 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY' | 'PROPOSAL_DRAFTED' | 'PROPOSAL_PRESENTED' | 'DUAL_KEY_CLEARED' | 'ADVANCE_SETTLED' | 'MANAGER_REVIEW_COMPLETE' | 'PARTNER_REPORT_APPROVED' | 'FINAL_PACKAGE_READY' | 'ARCHIVE_EARLY_LOCK';
  description: string;
  terminalOutcome?: typeof lifecycleTerminalOutcomes[number];
};

export const transitions: Readonly<Record<LifecycleCommand, TransitionDefinition>> = Object.freeze({
  OPEN_PROPOSAL: {
    from: ['LEAD_INGESTION'],
    to: 'PROPOSAL_GENERATION',
    requiresReason: false,
    evidence: 'PROPOSAL_DRAFTED',
    description: 'Open commercial work once a draft proposal exists for the client.',
  },
  DISPATCH_PROPOSAL: {
    from: ['PROPOSAL_GENERATION'],
    to: 'DUAL_KEY_PENDING',
    requiresReason: false,
    evidence: 'PROPOSAL_PRESENTED',
    description: 'Dispatch the proposal; the engagement then waits for both acceptance keys.',
  },
  REJECT_PROSPECT: {
    from: ['DUAL_KEY_PENDING'],
    to: 'DUAL_KEY_PENDING',
    requiresReason: true,
    evidence: 'NONE',
    description: 'Record a reasoned terminal rejection while preserving the prospect and its history.',
    terminalOutcome: 'PROSPECT_REJECTED',
  },
  ISSUE_ENGAGEMENT_LETTER: {
    from: ['DUAL_KEY_PENDING'],
    to: 'ADVANCE_BILLING',
    requiresReason: false,
    evidence: 'DUAL_KEY_CLEARED',
    description: 'Issue the ISA 210 letter after Key 1 (client acceptance) and Key 2 (Partner risk clearance).',
  },
  ACTIVATE_PORTAL: {
    from: ['ADVANCE_BILLING'],
    to: 'PORTAL_ACTIVE_PLANNING',
    requiresReason: false,
    evidence: 'ADVANCE_SETTLED',
    description: 'Activate planning after the 50% advance is invoiced, paid and receipted.',
  },
  START_FIELDWORK: {
    from: ['PORTAL_ACTIVE_PLANNING'],
    to: 'FIELDWORK_EXECUTION',
    requiresReason: false,
    evidence: 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY',
    description: 'Begin assigned testing once an accepted trial balance and a current approved plan exist.',
  },
  SUBMIT_FOR_REVIEW: {
    from: ['FIELDWORK_EXECUTION'],
    to: 'MANAGERIAL_REVIEW',
    requiresReason: false,
    evidence: 'FINALIZED_TRIAL_BALANCE',
    description: 'Submit the engagement for managerial review.',
  },
  RETURN_FOR_REWORK: {
    from: ['MANAGERIAL_REVIEW'],
    to: 'FIELDWORK_EXECUTION',
    requiresReason: true,
    evidence: 'NONE',
    description: 'Return managerial review work to fieldwork with a recorded reason.',
  },
  APPROVE_MANAGER_REVIEW: {
    from: ['MANAGERIAL_REVIEW'],
    to: 'PARTNER_APPROVAL',
    requiresReason: false,
    evidence: 'MANAGER_REVIEW_COMPLETE',
    description: 'Release completed managerial review to Partner approval only after its work and review gates clear.',
  },
  AUTHORIZE_FINAL_REPORT: {
    from: ['PARTNER_APPROVAL'],
    to: 'DELIVERABLE_RELEASE',
    requiresReason: false,
    evidence: 'PARTNER_REPORT_APPROVED',
    description: 'Authorize the report only after Partner review, opinion selection and version-bound image approval.',
  },
  RELEASE_FINAL_PACKAGE: {
    from: ['DELIVERABLE_RELEASE'],
    to: 'COMPLIANCE_COUNTDOWN',
    requiresReason: false,
    evidence: 'FINAL_PACKAGE_READY',
    description: 'Release the complete final package after the LOR, final invoice and client upload freeze are recorded.',
  },
  LOCK_ARCHIVE: {
    from: ['COMPLIANCE_COUNTDOWN'],
    to: 'ARCHIVED_READ_ONLY',
    requiresReason: true,
    evidence: 'ARCHIVE_EARLY_LOCK',
    description: 'Apply a reasoned Partner early lock; the scheduled 60-day lock is implemented with the archive deadline task.',
  },
});

/** Engagement state alone never grants authority: command roles are checked inside the transaction. */
const commandRoles: Readonly<Record<LifecycleCommand, readonly StaffRole[]>> = Object.freeze({
  OPEN_PROPOSAL: ['APPROVER'],
  DISPATCH_PROPOSAL: ['APPROVER'],
  REJECT_PROSPECT: ['APPROVER'],
  ISSUE_ENGAGEMENT_LETTER: ['APPROVER'],
  ACTIVATE_PORTAL: ['BILLING', 'APPROVER'],
  START_FIELDWORK: ['REVIEWER', 'APPROVER'],
  SUBMIT_FOR_REVIEW: ['PREPARER', 'REVIEWER', 'APPROVER'],
  RETURN_FOR_REWORK: ['REVIEWER', 'APPROVER'],
  APPROVE_MANAGER_REVIEW: ['REVIEWER', 'APPROVER'],
  AUTHORIZE_FINAL_REPORT: ['APPROVER'],
  RELEASE_FINAL_PACKAGE: ['APPROVER'],
  LOCK_ARCHIVE: ['APPROVER'],
});

export function permittedCommands(currentState: string, terminalOutcome: typeof lifecycleTerminalOutcomes[number] | null = null): LifecycleCommand[] {
  if (terminalOutcome) return [];
  return lifecycleCommands.filter((command) => transitions[command].from.includes(currentState));
}

/** Exported for boundary tests: a command whose source state does not currently apply is rejected. */
export function canApply(command: string, currentState: string, terminalOutcome: typeof lifecycleTerminalOutcomes[number] | null = null): boolean {
  const definition = transitions[command as LifecycleCommand];
  return !terminalOutcome && Boolean(definition) && definition.from.includes(currentState);
}

type LifecycleGateCode = typeof import('@auditsphere/contracts').lifecycleGateCodes[number];
type LifecycleGateReason = { code: LifecycleGateCode; message: string };
type LifecycleEvidence = { values: Record<string, unknown>; unmet: LifecycleGateReason[] };
type LifecycleClient = typeof db | Prisma.TransactionClient;

async function terminalOutcome(client: LifecycleClient, engagementId: string) {
  const rejection = await client.engagementTransition.findFirst({ where: { engagementId, command: 'REJECT_PROSPECT' }, select: { id: true } });
  return rejection ? 'PROSPECT_REJECTED' as const : null;
}

/** All transition predicates run against the locked transaction for commands and the same data for gate previews. */
async function evaluateEvidence(client: LifecycleClient, engagement: { id: string; firmId: string; clientId: string }, command: LifecycleCommand): Promise<LifecycleEvidence> {
  const values: Record<string, unknown> = {};
  const unmet: LifecycleGateReason[] = [];
  const fail = (code: LifecycleGateCode, message: string) => unmet.push({ code, message });

  if (command === 'OPEN_PROPOSAL') {
    const proposals = await client.commercialProposal.count({ where: { engagementId: engagement.id } });
    if (!proposals) fail('PROPOSAL_NOT_DRAFTED', 'Draft a commercial proposal before opening commercial work');
    else values.proposals = proposals;
  }
  if (command === 'DISPATCH_PROPOSAL') {
    const presented = await client.commercialProposal.count({ where: { engagementId: engagement.id, status: { in: ['PRESENTED', 'ACCEPTED'] }, presentedSnapshot: { not: Prisma.DbNull } } });
    if (!presented) fail('PROPOSAL_NOT_PRESENTED', 'Present a proposal revision before dispatching it to the client');
    else values.presentedProposals = presented;
  }
  if (command === 'ISSUE_ENGAGEMENT_LETTER') {
    const key1 = await client.commercialProposal.findFirst({ where: { engagementId: engagement.id, status: 'ACCEPTED', clientResponse: { not: Prisma.DbNull } } });
    if (!key1) fail('CLIENT_ACCEPTANCE_MISSING', 'Key 1 is missing: the client must accept the exact presented proposal revision with evidence');
    else values.key1ProposalId = key1.id;
    const key2 = await client.riskClearance.findFirst({ where: { engagementId: engagement.id }, orderBy: { clearedAt: 'desc' } });
    if (!key2) fail('PARTNER_RISK_CLEARANCE_MISSING', 'Key 2 is missing: Partner risk clearance (ISA 220) must be recorded');
    else {
      // T059: the clearance must cite a cleared acceptance case at the case's CURRENT review
      // version — a stale approval from before post-clearance edits can never satisfy the gate.
      if (!key2.acceptanceCaseId) fail('PARTNER_RISK_CLEARANCE_STALE', 'Key 2 is stale: the clearance must be recorded through a completed acceptance review');
      else {
        const cited = await client.acceptanceCase.findUnique({ where: { id: key2.acceptanceCaseId } });
        if (!cited || cited.status !== 'CLEARED' || !key2.reviewVersion || cited.reviewVersion !== key2.reviewVersion) {
          fail('PARTNER_RISK_CLEARANCE_STALE', 'Key 2 is stale: the cited acceptance review changed after clearance; re-clear the current review version');
        }
        values.key2ClearanceId = key2.id;
      }
    }
    // A race or drift that desynchronises the acceptance evidence cannot produce a false
    // clearance: the accepted response must cite the exact presented revision.
    if (key1) {
      const snapshot = key1.presentedSnapshot as { revision?: number } | null;
      const response = key1.clientResponse as { revision?: number } | null;
      if (!snapshot || !response || snapshot.revision !== key1.revision || response.revision !== key1.revision) {
        fail('CLIENT_ACCEPTANCE_STALE', 'The accepted proposal evidence does not match its presented revision; re-present and re-accept before issuing the letter');
      }
    }
  }
  if (command === 'ACTIVATE_PORTAL') {
    const invoice = await advanceInvoiceEvidence(client, engagement.id);
    if (!invoice) fail('ADVANCE_INVOICE_MISSING', 'Issue the 50% advance invoice before activating the portal');
    else {
      if (Decimal6.from(invoice.paidToDate).compare(Decimal6.from(invoice.amount)) < 0) fail('ADVANCE_PAYMENT_MISSING', 'Record the full 50% advance payment before activating the portal');
      else values.advanceInvoiceId = invoice.invoiceId;
      if (!invoice.receiptId) fail('ADVANCE_RECEIPT_MISSING', 'Issue the official advance receipt before activating the portal');
      else values.advanceReceiptId = invoice.receiptId;
    }
  }
  if (command === 'START_FIELDWORK' || command === 'SUBMIT_FOR_REVIEW') {
    const finalized = await client.tbImport.count({ where: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id, status: 'FINALIZED' } });
    if (!finalized) fail('FINALIZED_TRIAL_BALANCE_MISSING', 'A finalized trial balance is required for this command');
    else values.finalizedImports = finalized;
    if (command === 'START_FIELDWORK') {
      const latestPublication = await client.balancePublication.findFirst({ where: { engagementId: engagement.id }, orderBy: { sequence: 'desc' } });
      const approved = await client.materialityAssessment.findFirst({ where: { engagementId: engagement.id, status: 'APPROVED' }, orderBy: { calculatedAt: 'desc' } });
      if (!approved) fail('APPROVED_MATERIALITY_MISSING', 'An approved materiality assessment is required before fieldwork can start');
      else if (!latestPublication || approved.publicationId !== latestPublication.id) fail('MATERIALITY_STALE', 'The approved materiality assessment is stale; recalculate and approve it before fieldwork can start');
      else {
        values.approvedMaterialityAssessmentId = approved.id;
        values.publicationId = latestPublication.id;
      }
    } else {
      // T091 owns versioned workprogram instances and the complete assigned-procedure submission predicate.
      fail('WORKPROGRAM_SUBMISSIONS_MISSING', 'Every assigned workprogram procedure must be submitted before manager review can begin');
    }
  }
  if (command === 'APPROVE_MANAGER_REVIEW') {
    const openReviewNotes = await client.reviewNote.count({ where: { engagementId: engagement.id, status: 'OPEN' } });
    if (openReviewNotes) fail('OPEN_REVIEW_NOTES', 'Resolve all open review notes before approving managerial review');
    else values.openReviewNotes = 0;
    // These source-required records are owned by the pending workprogram, SRM and confirmation tasks.
    fail('WORKPROGRAM_SUBMISSIONS_MISSING', 'Assigned workprogram completion evidence is not yet implemented');
    fail('SRM_NOT_COMPILED', 'A current Summary Review Memorandum must be compiled before Partner approval');
    fail('CRITICAL_CONFIRMATIONS_PENDING', 'Critical confirmation returns must be recorded before Partner approval');
  }
  if (command === 'AUTHORIZE_FINAL_REPORT') {
    const risks = await client.riskItem.findMany({
      where: { engagementId: engagement.id },
      include: { assessments: { orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }], take: 1, include: { clearances: true } } },
    });
    const redPending = risks.filter((risk) => risk.assessments[0]?.band === 'RED' && risk.assessments[0].clearances.length === 0).length;
    if (redPending) fail('RED_RISK_CLEARANCE_MISSING', 'Every current Red risk area must have Partner clearance before report authorization');
    else values.unclearedRedRisks = 0;
    fail('REPORT_OPINION_MISSING', 'Select and approve the engagement-type-specific report opinion before authorization');
    fail('PARTNER_IMAGE_APPROVAL_MISSING', 'Record Partner approval bound to the report digest and approved signature-artwork version');
  }
  if (command === 'RELEASE_FINAL_PACKAGE') {
    fail('SIGNED_LOR_MISSING', 'A current engagement-matched signed LOR must be accepted before final release');
    fail('FINAL_BUNDLE_MISSING', 'Generate and validate all required final deliverables before release');
    const invoice = await finalInvoiceEvidence(client, engagement.id);
    if (!invoice) fail('FINAL_INVOICE_MISSING', 'Issue the final 50% invoice before external bundle delivery');
    else values.finalInvoice = { id: invoice.invoiceId, number: invoice.number, status: invoice.status };
    fail('CLIENT_UPLOAD_FREEZE_MISSING', 'Freeze client portal uploads as part of final package release');
  }
  if (command === 'LOCK_ARCHIVE') values.lockReasonRequired = true;

  return { values, unmet };
}

export async function lifecycleGates(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId }, select: { id: true, firmId: true, clientId: true, state: true, version: true } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  const outcome = await terminalOutcome(db, engagementId);
  const commands = await Promise.all(permittedCommands(engagement.state, outcome).map(async (command) => {
    const result = await evaluateEvidence(db, engagement, command);
    return { command, ready: result.unmet.length === 0, requiresReason: transitions[command].requiresReason, unmet: result.unmet };
  }));
  return { state: engagement.state, version: engagement.version, terminalOutcome: outcome, commands };
}

export async function applyLifecycleCommand(engagementId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = lifecycleCommandSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digest(JSON.stringify({ engagementId, body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    // Serialize commands for this engagement before reading its current state.
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    // Authorize before revealing whether the command applies to the current state.
    const scope = { firmId: engagement.firmId, clientId: engagement.clientId, engagementId };
    await requireCapability(tx, actorId, 'LIFECYCLE_COMMAND', scope);
    await requireStaffRole(tx, actorId, commandRoles[body.command], body.command, scope);
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const outcome = await terminalOutcome(tx, engagementId);
    if (outcome) throw new ConflictException('The prospect has a recorded terminal rejection');
    const definition = transitions[body.command];
    if (!definition || !definition.from.includes(engagement.state)) {
      throw new ConflictException(`Command ${body.command} is not valid from ${engagement.state}`);
    }
    if (engagement.version !== body.expectedVersion) throw new ConflictException('Engagement changed; reload before saving');
    if (definition.requiresReason && !body.reason) throw new BadRequestException('A reason is required for this command');
    const checked = await evaluateEvidence(tx, engagement, body.command);
    if (checked.unmet.length) throw new ConflictException(`${checked.unmet[0].code}: ${checked.unmet[0].message}`);
    const evidence = checked.values;
    const changed = await tx.engagement.updateMany({
      where: { id: engagementId, state: engagement.state, version: body.expectedVersion },
      data: { state: definition.to, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictException('Engagement changed; reload before saving');
    if (definition.evidence === 'DUAL_KEY_CLEARED') {
      // The letter pins the exact accepted proposal and is immutable once written.
      const key1 = await tx.commercialProposal.findFirstOrThrow({ where: { engagementId, status: 'ACCEPTED' }, orderBy: { createdAt: 'desc' } });
      const engagement = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId }, include: { client: true } });
      const letterText = [
        `ENGAGEMENT LETTER (ISA 210) — ${engagement.name}`,
        `Client: ${engagement.client.name}`,
        `Service: ${key1.service}`,
        `Period: ${key1.periodStart.toISOString().slice(0, 10)} to ${key1.periodEnd.toISOString().slice(0, 10)}`,
        `Agreed fee: ${key1.totalAmount.toFixed(2)} ${key1.currency}`,
        `Proposal revision: ${key1.revision}`,
      ].join('\n');
      await tx.engagementLetterRecord.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, proposalId: key1.id, letterText, issuedBy: actorId } });
    }
    await tx.engagementTransition.create({
      data: {
        engagementId,
        command: body.command,
        fromState: engagement.state,
        toState: definition.to,
        actorId,
        reason: body.reason ?? null,
        evidence: evidence as Prisma.InputJsonValue,
        version: engagement.version,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: `LIFECYCLE_${body.command}`, payload: { from: engagement.state, to: definition.to, reason: body.reason ?? null, ...evidence } } });
    const result = { state: definition.to, version: engagement.version + 1, ...(definition.terminalOutcome ? { terminalOutcome: definition.terminalOutcome } : {}) };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function lifecycleHistory(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  const [history, outcome] = await Promise.all([
    db.engagementTransition.findMany({ where: { engagementId }, orderBy: { createdAt: 'asc' } }),
    terminalOutcome(db, engagementId),
  ]);
  return { state: engagement.state, version: engagement.version, terminalOutcome: outcome, permittedCommands: permittedCommands(engagement.state, outcome), history };
}
