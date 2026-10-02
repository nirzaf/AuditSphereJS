import { z } from 'zod';
export const states = ['LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'] as const;
export const fslis = ['Cash and equivalents','Trade receivables','Property and equipment','Trade payables','Equity','Revenue','Operating expenses'] as const;
export const uploadSchema = z.object({ filename: z.string().regex(/^[^/\\]+\.csv$/i).max(200), csv: z.string().min(1).max(15_000_000) });
export const mappingSchema = z.object({ idempotencyKey: z.uuid(), changes: z.array(z.object({ rowId: z.uuid(), expectedVersion: z.number().int().positive(), fsli: z.enum(fslis) })).min(1).max(500) }).refine(v => new Set(v.changes.map(c => c.rowId)).size === v.changes.length, 'Duplicate row IDs');
export const finalizeSchema = z.object({ expectedVersion: z.number().int().positive() });
export const moneySchema = z.string().regex(/^-?\d{1,22}(\.\d{1,6})?$/);
/** Capability vocabulary evaluated against a firm/client/engagement scope. Local grants are
 *  never Microsoft directory authority and never infer one from the other. */
export const capabilities = ['ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD'] as const;
export const capabilitySchema = z.enum(capabilities);
/** Publishing binds one immutable accounting version to one exact finalized import version. */
export const publishSchema = z.object({ importId: z.uuid(), expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid() });
/** Approves one import's mapped rows against an exact taxonomy version. */
export const approveMappingSchema = z.object({ taxonomyVersionId: z.uuid().optional(), idempotencyKey: z.uuid() });
export const taxonomyLineSchema = z.object({
  code: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  statementSection: z.enum(['INCOME', 'EXPENSE', 'ASSETS', 'LIABILITIES', 'EQUITY']),
  sortOrder: z.number().int().min(0).max(10_000),
});
export const createTaxonomySchema = z.object({ name: z.string().trim().min(1).max(120), lines: z.array(taxonomyLineSchema).min(1).max(2_000) });
/** Percentages for materiality are strings so no binary floating point enters the calculation. */
export const percentSchema = z.string().trim().regex(/^-?\d{1,3}(\.\d{1,4})?$/);
export const materialityBenchmarkKinds = ['REVENUE', 'PROFIT_BEFORE_TAX', 'TOTAL_ASSETS', 'NET_ASSETS', 'TOTAL_EXPENSES', 'MAPPED_LINE'] as const;
export const calculateMaterialitySchema = z.object({
  benchmarkKind: z.enum(materialityBenchmarkKinds),
  destinationCode: z.string().trim().min(1).max(120).optional(),
  ratePercent: percentSchema,
  performancePercent: percentSchema,
  trivialPercent: percentSchema,
  idempotencyKey: z.uuid(),
});
export const approveMaterialitySchema = z.object({ idempotencyKey: z.uuid() });
/** Risk scores are integers 1–3; the band is always derived, never supplied by the caller. */
export const createRiskSchema = z.object({ title: z.string().trim().min(1).max(300), description: z.string().trim().max(2_000).optional() });
export const assessRiskSchema = z.object({
  likelihood: z.number().int().min(1).max(3),
  magnitude: z.number().int().min(1).max(3),
  significant: z.boolean(),
  fraudRisk: z.boolean(),
});
export const clearRiskSchema = z.object({ note: z.string().trim().min(1).max(1_000) });
/** Staffing ranks rise with responsibility; a band sets the minimum rank that may own its response. */
export const staffingLevelNames = ['StaffAssociate', 'SeniorAuditor', 'AuditManager', 'EngagementPartner'] as const;
export const assignRiskOwnerSchema = z.object({ ownerUserId: z.uuid(), ownerStaffingLevel: z.enum(staffingLevelNames) });
/** A review note is anchored to a workpackage reference and resolved with a stated resolution. */
export const raiseReviewNoteSchema = z.object({ workpackage: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(4_000) });
export const resolveReviewNoteSchema = z.object({ resolution: z.string().trim().min(1).max(4_000) });
/** A client audit adjustment: balanced double-entry lines, never the firm's own ledger. */
export const adjustmentLineSchema = z.object({
  accountCode: z.string().trim().min(1).max(80),
  fsli: z.string().trim().min(1).max(120).optional(),
  debit: moneySchema.default('0'),
  credit: moneySchema.default('0'),
});
export const createAdjustmentJournalSchema = z.object({
  reference: z.string().trim().min(1).max(60),
  memo: z.string().trim().min(1).max(500),
  lines: z.array(adjustmentLineSchema).min(2).max(500),
});
export const postAdjustmentJournalSchema = z.object({ expectedVersion: z.number().int().positive() });
export const reverseAdjustmentJournalSchema = z.object({ expectedVersion: z.number().int().positive() });
export const practiceAccountSchema = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150), kind: z.enum(['ASSET','LIABILITY','EQUITY','INCOME','EXPENSE']), posting: z.boolean().default(true) });
export const practicePeriodSchema = z.object({ startsOn: z.iso.date(), endsOn: z.iso.date() }).refine(v => v.startsOn <= v.endsOn, 'Period dates are reversed');
export const practiceJournalSchema = z.object({ periodId: z.uuid(), accountingDate: z.iso.date(), reference: z.string().trim().min(1).max(80), memo: z.string().trim().min(1).max(500), idempotencyKey: z.uuid(), lines: z.array(z.object({ accountId: z.uuid(), debit: moneySchema, credit: moneySchema })).min(2).max(500) });
export const practiceVersionSchema = z.object({ expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid() });
/** Period transitions require a current version and a durable, human-readable reason. */
export const practicePeriodTransitionSchema = practiceVersionSchema.extend({ reason: z.string().trim().min(10).max(1000) });
export const lifecycleCommands = ['START_FIELDWORK','SUBMIT_FOR_REVIEW','RETURN_FOR_REWORK'] as const;
export const lifecycleCommandSchema = z.object({
  command: z.enum(lifecycleCommands),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});
export interface TrialBalanceRow { id: string; code: string; name: string; current: string; prior: string; fsli: string | null; version: number; }
/** Presentation-only label order. Never use this for mutation authorization or progression:
 *  guarded transitions live in modules/governance/lifecycle.ts and require command evidence. */
export function nextState(current: string): string | undefined { const i = states.indexOf(current as typeof states[number]); return i < 0 ? undefined : states[i + 1]; }
