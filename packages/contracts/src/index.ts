import { z } from 'zod';
export const states = ['LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'] as const;
/** Realtime join requests name one engagement-scoped resource; room names are always server-derived. */
export const realtimeResourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('engagement') }),
  z.object({ type: z.literal('trial-balance-import'), id: z.uuid() }),
]);
export const realtimeJoinRequestSchema = z.object({ engagementId: z.uuid(), resource: realtimeResourceSchema });
export const realtimeJoinSnapshotSchema = z.object({
  engagementId: z.uuid(),
  engagementVersion: z.number().int().positive(),
  resource: realtimeResourceSchema,
  resourceVersion: z.number().int().positive(),
});
export const realtimeJoinAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), snapshot: realtimeJoinSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.enum(['Room access denied', 'Invalid room request']) }),
]);
/** Hints contain identifiers and versions only; clients reload all business data over authorized APIs. */
export const realtimeInvalidationSchema = z.object({
  schemaVersion: z.literal(1),
  engagementId: z.uuid(),
  resourceType: z.literal('trial-balance-import'),
  resourceId: z.uuid(),
  version: z.number().int().positive(),
});
export type RealtimeJoinRequest = z.infer<typeof realtimeJoinRequestSchema>;
export type RealtimeJoinSnapshot = z.infer<typeof realtimeJoinSnapshotSchema>;
export type RealtimeInvalidation = z.infer<typeof realtimeInvalidationSchema>;
export const fslis = ['Cash and equivalents','Trade receivables','Property and equipment','Trade payables','Equity','Revenue','Operating expenses'] as const;
export const uploadSchema = z.object({
  filename: z.string().regex(/^[^/\\]+\.csv$/i).max(200),
  csv: z.string().min(1).max(15_000_000),
  documentId: z.uuid().optional(),
  expectedDocumentVersion: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.documentId && value.expectedDocumentVersion === undefined) {
    context.addIssue({ code: 'custom', path: ['expectedDocumentVersion'], message: 'Updating a document requires its current version.' });
  }
  if (!value.documentId && value.expectedDocumentVersion !== undefined) {
    context.addIssue({ code: 'custom', path: ['documentId'], message: 'A document version can only be supplied when updating that document.' });
  }
});
export const documentLinkCreateSchema = z.object({
  idempotencyKey: z.uuid(),
  documentId: z.uuid(),
  documentVersionId: z.uuid(),
  targetType: z.enum(['ENGAGEMENT', 'TRIAL_BALANCE_IMPORT']),
  targetImportId: z.uuid().optional(),
  label: z.string().trim().min(1).max(200),
}).superRefine((value, context) => {
  if (value.targetType === 'ENGAGEMENT' && value.targetImportId !== undefined) context.addIssue({ code: 'custom', path: ['targetImportId'], message: 'Engagement links cannot name an import.' });
  if (value.targetType === 'TRIAL_BALANCE_IMPORT' && value.targetImportId === undefined) context.addIssue({ code: 'custom', path: ['targetImportId'], message: 'Import links require a target import.' });
});
export const documentLinkRevokeSchema = z.object({
  idempotencyKey: z.uuid(), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000),
});
export const documentLinksQuerySchema = z.object({ targetImportId: z.uuid().optional() });
export const documentLinkSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(), targetType: z.enum(['ENGAGEMENT', 'TRIAL_BALANCE_IMPORT']),
  targetImportId: z.uuid().nullable(), label: z.string().trim().min(1).max(200), createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(), revokeReason: z.string().max(1000).nullable(),
  document: z.object({ id: z.uuid(), filename: z.string().max(200), category: z.string().max(100), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().nonnegative(), sequence: z.number().int().positive() }),
});
export const documentLinksSchema = z.array(documentLinkSchema).max(1000);
export const documentLinkResultSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), created: z.boolean() });
export const documentLinkRevokedSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), revoked: z.literal(true) });
export const documentUploadCategories = ['01_Administration & Planning', '02_Trial Balance & Schedules', '03_Fieldwork & Testing', '04_Drafts & Deliverables', '05_Final Signed Archive'] as const;
export const documentUploadInitSchema = z.object({
  engagementId: z.uuid(),
  category: z.enum(documentUploadCategories),
  filename: z.string().trim().min(1).max(200).regex(/^[^/\\\u0000-\u001f\u007f]+$/),
  contentType: z.enum(['application/pdf', 'text/csv']),
  sizeBytes: z.number().int().positive().max(15_000_000),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const documentUploadSessionSchema = z.object({
  id: z.uuid(), engagementId: z.uuid(), category: z.enum(documentUploadCategories),
  filename: z.string().max(200), contentType: z.enum(['application/pdf', 'text/csv']),
  maxSizeBytes: z.number().int().positive(), expiresAt: z.iso.datetime(), status: z.enum(['INITIATED', 'STORED', 'FINALIZED', 'EXPIRED', 'FAILED']),
});
export const documentUploadFinalizedSchema = z.object({
  sessionId: z.uuid(), documentId: z.uuid(), documentVersionId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive(),
});
export const documentUploadReceivedSchema = z.object({ sessionId: z.uuid(), status: z.literal('STORED'), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive() });
export const mappingSchema = z.object({ idempotencyKey: z.uuid(), changes: z.array(z.object({ rowId: z.uuid(), expectedVersion: z.number().int().positive(), fsli: z.enum(fslis) })).min(1).max(500) }).refine(v => new Set(v.changes.map(c => c.rowId)).size === v.changes.length, 'Duplicate row IDs');
export const finalizeSchema = z.object({ expectedVersion: z.number().int().positive() });
export const moneySchema = z.string().regex(/^-?\d{1,22}(\.\d{1,6})?$/);
/** Capability vocabulary evaluated against a firm/client/engagement scope. Local grants are
 *  never Microsoft directory authority and never infer one from the other. */
export const capabilities = ['ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND','COMMERCIAL_MANAGE','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD','TEAM_ASSIGNMENT_MANAGE','DOCUMENT_TEMPLATE_MANAGE','EXTERNAL_COMMUNICATION_READ','EXTERNAL_COMMUNICATION_SEND','EXTERNAL_COMMUNICATION_RECONCILE'] as const;
export const capabilitySchema = z.enum(capabilities);
export const staffRoles = ['PREPARER', 'REVIEWER', 'APPROVER', 'BILLING', 'ADMIN'] as const;

/** The catalog supports the source-required quote, proposal, engagement-letter and D1-D5 documents. */
export const documentTemplateKinds = ['BRIEF_QUOTATION','COMPREHENSIVE_PROPOSAL','ENGAGEMENT_LETTER','D1_AUDITOR_REPORT','D2_MANAGEMENT_LETTER','D3_REPRESENTATION_LETTER','D4_CORRESPONDENCE_TRAIL','D5_FINAL_FEE_NOTE'] as const;
export const documentTemplateKindSchema = z.enum(documentTemplateKinds);
export const documentTemplateEngagementTypes = ['EXTERNAL_STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES'] as const;
export const documentTemplateEngagementTypeSchema = z.enum(documentTemplateEngagementTypes);
export const approvedAssetCategories = ['FIRM_PROFILE','REGISTRATION','CREDENTIAL','TEAM_CV','PARTNER_SIGNATURE','FIRM_SEAL'] as const;
export const approvedAssetCategorySchema = z.enum(approvedAssetCategories);
export const documentTemplateVariableKeys = [
  'firmName','firmHistory','firmProfile','registrationNumber','clientLegalName','clientAddress','periodStart','periodEnd',
  'statutoryPeriod','engagementScope','agreedFee','advanceFee','finalFee','currencyCode','paymentTerms','timeline',
  'assignedPartner','auditTeam','industryCredentials','auditMethodology','submissionDeadline','opinion','opinionBasis',
  'financialStatements','deficiencies','impacts','recommendations','managementRepresentations','correspondenceTrail','finalFeeDueDate',
] as const;
export const documentTemplateVariableKeySchema = z.enum(documentTemplateVariableKeys);
const templateTextSchema = z.string().trim().min(1).max(4_000).refine(value => !/<\/?[a-z][^>]*>/i.test(value), 'Template text must not contain HTML or executable markup.');
export const documentTemplateBlockSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('TITLE'), text: templateTextSchema }),
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('HEADING'), text: templateTextSchema }),
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('PARAGRAPH'), text: templateTextSchema }),
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('BULLET_LIST'), items: z.array(templateTextSchema).min(1).max(30) }),
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('APPROVED_ASSET'), assetVersionId: z.uuid(), use: approvedAssetCategorySchema, caption: z.string().trim().max(200) }),
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i), kind: z.literal('PARTNER_SIGNATURE'), signatureAssetVersionId: z.uuid(), sealAssetVersionId: z.uuid().nullable() }),
]);
export const createDocumentTemplateSchema = z.object({
  kind: documentTemplateKindSchema,
  engagementType: documentTemplateEngagementTypeSchema,
  name: z.string().trim().min(1).max(160),
  blocks: z.array(documentTemplateBlockSchema).min(1).max(100),
  allowedVariables: z.array(documentTemplateVariableKeySchema).max(30)
    .refine(values => new Set(values).size === values.length, 'Duplicate template variables are not allowed.'),
});
export const createDocumentTemplateVersionSchema = createDocumentTemplateSchema.omit({ kind: true, engagementType: true, name: true }).extend({ expectedVersion: z.number().int().positive() });
export const documentTemplateDecisionSchema = z.object({ expectedVersion: z.number().int().positive(), action: z.enum(['APPROVED','REVOKED']), reason: z.string().trim().min(10).max(1000) });
export const documentTemplateActivationSchema = z.object({ versionId: z.uuid().nullable(), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) });
export const documentTemplateDeactivationSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) });
export const documentTemplatePreviewRequestSchema = z.object({ data: z.record(z.string(), z.string().max(4_000)) }).superRefine((value, context) => {
  if (Object.keys(value.data).length > 30) context.addIssue({ code: 'custom', message: 'A template preview can include at most 30 variables.' });
});
export const createApprovedAssetSchema = z.object({
  name: z.string().trim().min(1).max(160), category: approvedAssetCategorySchema,
  filename: z.string().trim().min(1).max(200), contentType: z.enum(['application/pdf','image/png','image/jpeg']),
  sizeBytes: z.number().int().positive().max(5_000_000), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const createApprovedAssetVersionSchema = createApprovedAssetSchema.omit({ name: true, category: true }).extend({ expectedVersion: z.number().int().positive() });
export const documentTemplateVersionViewSchema = z.object({
  id: z.uuid(), sequence: z.number().int().positive(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  blocks: z.array(documentTemplateBlockSchema).max(100), allowedVariables: z.array(documentTemplateVariableKeySchema).max(30),
  status: z.enum(['DRAFT','APPROVED','REVOKED']), createdAt: z.iso.datetime(),
});
export const documentTemplateViewSchema = z.object({
  id: z.uuid(), kind: documentTemplateKindSchema, engagementType: documentTemplateEngagementTypeSchema,
  name: z.string().min(1).max(160), version: z.number().int().positive(), activeVersionId: z.uuid().nullable(),
  versions: z.array(documentTemplateVersionViewSchema).max(100),
});
export const approvedAssetVersionViewSchema = z.object({
  id: z.uuid(), sequence: z.number().int().positive(), contentType: z.enum(['application/pdf','image/png','image/jpeg']),
  sizeBytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['UPLOADING','CLEANING','STORED','CLEANED']),
  approval: z.enum(['UNREVIEWED','APPROVED','REVOKED']), createdAt: z.iso.datetime(),
});
export const approvedAssetViewSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(160), category: approvedAssetCategorySchema,
  version: z.number().int().positive(), versions: z.array(approvedAssetVersionViewSchema).max(100),
});
export const documentTemplateCatalogSchema = z.object({
  canManage: z.boolean(), templates: z.array(documentTemplateViewSchema).max(200), assets: z.array(approvedAssetViewSchema).max(500),
});
export const documentTemplatePreviewSchema = z.object({
  versionId: z.uuid(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  blocks: z.array(z.object({ id: z.string(), kind: z.enum(['TITLE','HEADING','PARAGRAPH','BULLET_LIST','APPROVED_ASSET','PARTNER_SIGNATURE']), text: z.string().optional(), items: z.array(z.string()).optional(), assetName: z.string().optional(), assetCategory: approvedAssetCategorySchema.optional(), sequence: z.number().int().positive().optional(), signatureLabel: z.string().optional(), sealLabel: z.string().optional() })).max(100),
});
export const documentTemplateCreatedSchema = z.object({ id: z.uuid(), versionId: z.uuid(), version: z.literal(1), status: z.literal('DRAFT'), contentSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const documentTemplateVersionCreatedSchema = z.object({ id: z.uuid(), versionId: z.uuid(), version: z.number().int().positive(), status: z.literal('DRAFT'), contentSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const approvedAssetCreatedSchema = z.object({ id: z.uuid(), versionId: z.uuid(), version: z.literal(1), status: z.literal('UPLOADING'), sizeBytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const approvedAssetVersionCreatedSchema = z.object({ id: z.uuid(), versionId: z.uuid(), version: z.number().int().positive(), status: z.literal('UPLOADING'), sizeBytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const approvedAssetUploadInitiatedSchema = z.object({ id: z.uuid(), versionId: z.uuid(), sequence: z.number().int().positive(), status: z.literal('UPLOADING'), sizeBytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const approvedAssetUploadResultSchema = z.object({ versionId: z.uuid(), status: z.literal('STORED'), sizeBytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const documentTemplateApprovalResultSchema = z.object({ versionId: z.uuid(), status: z.enum(['APPROVED','REVOKED']), decidedAt: z.iso.datetime() });
export const documentTemplateActivationResultSchema = z.object({ templateId: z.uuid(), activeVersionId: z.uuid().nullable(), status: z.enum(['ACTIVE','INACTIVE']), activatedAt: z.iso.datetime() });
export const documentTemplateDecisionResultSchema = documentTemplateApprovalResultSchema;
export const documentTemplateStateResultSchema = documentTemplateActivationResultSchema;
/** Full desired engagement role and capability set, issued with a finite expiry and reason. */
export const assignEngagementStaffSchema = z.object({
  idempotencyKey: z.uuid(),
  expectedVersion: z.number().int().positive(),
  userId: z.uuid(),
  role: z.enum(staffRoles),
  capabilities: z.array(capabilitySchema).min(1).max(capabilities.length)
    .refine((items) => new Set(items).size === items.length, 'Duplicate capabilities')
    .refine((items) => items.includes('ENGAGEMENT_READ'), 'ENGAGEMENT_READ is required'),
  expiresAt: z.iso.datetime(),
  reason: z.string().trim().min(10).max(1000),
});
export const revokeEngagementStaffSchema = z.object({
  idempotencyKey: z.uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(1000),
});
export const notificationInboxQuerySchema = z.object({ unreadOnly: z.enum(['true', 'false']).optional() });
export const notificationSchema = z.object({
  id: z.uuid(), engagementId: z.uuid(), eventKey: z.string().min(1).max(200), kind: z.string().min(1).max(40),
  title: z.string().max(200), body: z.string().max(2000), createdAt: z.iso.datetime(), readAt: z.iso.datetime().nullable(), version: z.number().int().positive(),
});
export const notificationReadSchema = z.object({ expectedVersion: z.number().int().positive() });
export const notificationReadResultSchema = z.object({ id: z.uuid(), readAt: z.iso.datetime(), version: z.number().int().positive() });
export const outboundMessageSchema = z.object({
  id: z.uuid(), eventKey: z.string().min(1).max(200), eventType: z.string().min(1).max(40), recipientRole: z.enum(['MD_GM', 'CFO_FD', 'AUDIT_LIAISON']),
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'RECONCILED_SENT', 'CANCELLED']),
  version: z.number().int().positive(), attemptCount: z.number().int().nonnegative(), providerReceipt: z.string().max(500).nullable(), failureCode: z.string().max(120).nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const outboundRetrySchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) });
export const outboundReconcileSchema = z.object({
  expectedVersion: z.number().int().positive(), outcome: z.enum(['SENT', 'NOT_SENT']),
  evidenceReference: z.string().trim().min(8).max(1000), reason: z.string().trim().min(10).max(1000),
});
export const outboundMutationResultSchema = z.object({ id: z.uuid(), status: outboundMessageSchema.shape.status, version: z.number().int().positive() });
/** Publishing binds one immutable accounting version to one exact finalized import version. */
export const publishSchema = z.object({ importId: z.uuid(), expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid() });
/** Allowlisted accepted balance-version views; tenant keys and publisher identity stay server-side. */
export const publicationSchema = z.object({
  id: z.uuid(), sequence: z.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/), rowCount: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), publishedAt: z.iso.datetime(),
});
export const publicationRowSchema = z.object({
  id: z.uuid(), position: z.number().int().nonnegative(), code: z.string().max(1_000), name: z.string().max(4_000),
  fsli: z.string().trim().min(1).max(120), current: moneySchema, prior: moneySchema,
});
export const publicationDetailSchema = publicationSchema.extend({ rows: z.array(publicationRowSchema).max(50_000) });
export const publicationResultSchema = z.object({
  publicationId: z.uuid(), sequence: z.number().int().positive(), rowCount: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), currency: z.string().regex(/^[A-Z]{3}$/),
});
/** Approves the exact mapped import revision against one immutable taxonomy version. */
export const approveMappingSchema = z.object({ taxonomyVersionId: z.uuid().optional(), expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid() });
/** Taxonomy content is immutable after creation; its sequence is the reviewed content version. */
export const approveTaxonomySchema = z.object({ expectedVersion: z.number().int().positive() });
export const taxonomyLineSchema = z.object({
  code: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  statementSection: z.enum(['INCOME', 'EXPENSE', 'ASSETS', 'LIABILITIES', 'EQUITY']),
  sortOrder: z.number().int().min(0).max(10_000),
});
export const createTaxonomySchema = z.object({ name: z.string().trim().min(1).max(120), lines: z.array(taxonomyLineSchema).min(1).max(2_000) });
export const taxonomyLineViewSchema = z.object({
  id: z.uuid(), code: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(200),
  statementSection: z.enum(['INCOME', 'EXPENSE', 'ASSETS', 'LIABILITIES', 'EQUITY']), sortOrder: z.number().int().nonnegative().max(10_000),
});
export const taxonomyViewSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(1).max(120), version: z.number().int().positive(), status: z.enum(['DRAFT', 'APPROVED']),
  createdAt: z.iso.datetime(), approvedAt: z.iso.datetime().nullable(), lines: z.array(taxonomyLineViewSchema).max(2_000),
});
export const taxonomyViewsSchema = z.array(taxonomyViewSchema).max(200);
export const taxonomyCreatedResultSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(120), version: z.number().int().positive(), status: z.literal('DRAFT'), lineCount: z.number().int().positive().max(2_000) });
export const taxonomyApprovedResultSchema = z.object({ id: z.uuid(), status: z.literal('APPROVED'), version: z.number().int().positive(), lineCount: z.number().int().positive().max(2_000) });
export const mappingApprovalResultSchema = z.object({ approvalId: z.uuid(), taxonomyVersionId: z.uuid(), taxonomyVersion: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/), rowCount: z.number().int().positive().max(50_000) });
export const mappingSuggestionItemSchema = z.object({
  rowId: z.uuid(), code: z.string().max(1_000), name: z.string().max(4_000), currentFsli: z.string().max(120).nullable(),
  suggestedFsli: z.string().max(120).nullable(), reason: z.enum(['ALREADY_MAPPED', 'NO_MEMORY', 'MEMORY_NOT_IN_TAXONOMY', 'MEMORY']),
  provenance: z.object({ sourceApprovalId: z.uuid(), timesApplied: z.number().int().positive(), lastApprovedAt: z.iso.datetime() }).nullable(),
});
export const mappingSuggestionsSchema = z.object({
  importId: z.uuid(), taxonomyVersionId: z.uuid(), taxonomyVersion: z.number().int().positive(),
  suggested: z.number().int().nonnegative(), alreadyMapped: z.number().int().nonnegative(), unresolved: z.number().int().nonnegative(),
  items: z.array(mappingSuggestionItemSchema).max(50_000),
});
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
export const materialityAssessmentSchema = z.object({
  assessmentId: z.uuid(), publicationId: z.uuid(), taxonomyVersionId: z.uuid(),
  benchmarkKind: z.enum(materialityBenchmarkKinds), destinationCode: z.string().max(120).nullable(),
  sourceLineCount: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  benchmarkAmount: moneySchema, planningMateriality: moneySchema, tolerableError: moneySchema, sadThreshold: moneySchema,
  ratePercent: moneySchema, performancePercent: moneySchema, trivialPercent: moneySchema,
  policyVersion: z.string().trim().min(1).max(80), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['DRAFT', 'APPROVED']), calculatedAt: z.iso.datetime(), approvedAt: z.iso.datetime().nullable(),
  stale: z.boolean(), currentPublicationId: z.uuid().nullable().optional(),
});
export const materialityAssessmentsSchema = z.array(materialityAssessmentSchema).max(200);
export const materialityCalculationResultSchema = z.object({
  assessmentId: z.uuid(), status: z.literal('DRAFT'), benchmarkKind: z.enum(materialityBenchmarkKinds), currency: z.string().regex(/^[A-Z]{3}$/),
  benchmarkAmount: moneySchema, planningMateriality: moneySchema, tolerableError: moneySchema, sadThreshold: moneySchema,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/), publicationId: z.uuid(), publicationSequence: z.number().int().positive(),
});
export const materialityApprovalResultSchema = z.object({ assessmentId: z.uuid(), status: z.literal('APPROVED'), publicationId: z.uuid(), inputHash: z.string().regex(/^[a-f0-9]{64}$/) });
/** Risk scores are integers 1–3; the band is always derived, never supplied by the caller. */
export const createRiskSchema = z.object({ title: z.string().trim().min(1).max(300), description: z.string().trim().max(2_000).optional() });
export const riskBands = ['GREEN', 'AMBER', 'RED'] as const;
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
export const riskOwnerViewSchema = z.object({ ownerUserId: z.uuid(), ownerStaffingLevel: z.enum(staffingLevelNames), assignedAt: z.iso.datetime() });
export const riskViewSchema = z.object({
  riskId: z.uuid(), title: z.string().trim().min(1).max(300), description: z.string().max(2_000).nullable(), createdAt: z.iso.datetime(),
  currentBand: z.enum(riskBands).nullable(), currentAssessmentId: z.uuid().nullable(), requiresPartnerClearance: z.boolean(),
  cleared: z.boolean(), assessmentCount: z.number().int().nonnegative(), owner: riskOwnerViewSchema.nullable(),
});
export const riskViewsSchema = z.array(riskViewSchema).max(200);
export const riskCreatedResultSchema = z.object({ riskId: z.uuid(), title: z.string().trim().min(1).max(300), currentBand: z.null(), requiresPartnerClearance: z.literal(false) });
export const riskAssessmentResultSchema = z.object({
  assessmentId: z.uuid(), riskId: z.uuid(), band: z.enum(riskBands), likelihood: z.number().int().min(1).max(3), magnitude: z.number().int().min(1).max(3),
  significant: z.boolean(), fraudRisk: z.boolean(), requiresPartnerClearance: z.boolean(), cleared: z.boolean(), ruleVersion: z.string().trim().min(1).max(80),
});
export const riskClearanceResultSchema = z.object({ clearanceId: z.uuid(), assessmentId: z.uuid(), riskId: z.uuid(), band: z.enum(riskBands) });
export const riskOwnerAssignmentResultSchema = z.object({ assignmentId: z.uuid(), riskId: z.uuid(), assessmentId: z.uuid(), band: z.enum(riskBands), ownerUserId: z.uuid(), ownerStaffingLevel: z.enum(staffingLevelNames) });
/** A review note is anchored to a workpackage reference and resolved with a stated resolution. */
export const raiseReviewNoteSchema = z.object({ workpackage: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(4_000) });
export const resolveReviewNoteSchema = z.object({ resolution: z.string().trim().min(1).max(4_000) });
/** Allowlisted review-note transport views; author, resolver and tenant ownership columns stay private. */
export const reviewNoteSchema = z.object({
  id: z.uuid(), workpackage: z.string().trim().min(1).max(200), body: z.string().min(1).max(4_000),
  status: z.enum(['OPEN', 'RESOLVED']), raisedAt: z.iso.datetime(), resolution: z.string().max(4_000).nullable(), resolvedAt: z.iso.datetime().nullable(),
});
export const reviewNotesSchema = z.array(reviewNoteSchema).max(200);
export const reviewNoteResultSchema = reviewNoteSchema;
export const reviewSummarySchema = z.object({ open: z.number().int().nonnegative(), resolved: z.number().int().nonnegative(), total: z.number().int().nonnegative() });
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
/** Browser-safe adjustment views. Actor and tenant columns are omitted; money is always decimal text. */
export const adjustmentJournalLineViewSchema = z.object({
  position: z.number().int().nonnegative(), accountCode: z.string().trim().min(1).max(80), fsli: z.string().max(120).nullable(),
  debit: moneySchema, credit: moneySchema,
});
export const adjustmentJournalSchema = z.object({
  id: z.uuid(), reference: z.string().trim().min(1).max(64), memo: z.string().trim().min(1).max(500),
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']), version: z.number().int().positive(), createdAt: z.iso.datetime(),
  postedAt: z.iso.datetime().nullable(), reversesJournalId: z.uuid().nullable(),
});
export const adjustmentJournalsSchema = z.array(adjustmentJournalSchema).max(200);
export const adjustmentJournalDetailSchema = adjustmentJournalSchema.extend({ lines: z.array(adjustmentJournalLineViewSchema).min(2).max(500) });
export const adjustmentCreatedResultSchema = z.object({ journalId: z.uuid(), status: z.literal('DRAFT'), version: z.number().int().positive(), reference: z.string().min(1).max(60), lineCount: z.number().int().min(2).max(500) });
export const adjustmentPostedResultSchema = z.object({ journalId: z.uuid(), status: z.literal('POSTED'), version: z.number().int().positive() });
export const adjustmentReversedResultSchema = z.object({ journalId: z.uuid(), status: z.literal('REVERSED'), reversalJournalId: z.uuid(), reversalReference: z.string().min(1).max(64) });
export const adjustedBalanceItemSchema = z.object({ fsli: z.string().min(1).max(120), publishedCurrent: moneySchema, adjustmentNet: moneySchema, adjustedCurrent: moneySchema });
export const adjustedBalancesSchema = z.object({
  publicationId: z.uuid(), publicationSequence: z.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  journalCount: z.number().int().nonnegative(), items: z.array(adjustedBalanceItemSchema).max(2_000),
  totals: z.object({ publishedCurrent: moneySchema, adjustmentNet: moneySchema, adjustedCurrent: moneySchema }),
});
export const practiceAccountSchema = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150), kind: z.enum(['ASSET','LIABILITY','EQUITY','INCOME','EXPENSE']), posting: z.boolean().default(true) });
export const practicePostingPolicySchema = z.object({
  policyVersion: z.string().trim().min(1).max(80),
  revenueTreatment: z.literal('DEFERRED_UNTIL_RELEASE'),
  taxTreatment: z.literal('NO_TAX'),
  idempotencyKey: z.uuid(),
});
export const practicePeriodSchema = z.object({ startsOn: z.iso.date(), endsOn: z.iso.date() }).refine(v => v.startsOn <= v.endsOn, 'Period dates are reversed');
export const practiceJournalSchema = z.object({ periodId: z.uuid(), accountingDate: z.iso.date(), reference: z.string().trim().min(1).max(80), memo: z.string().trim().min(1).max(500), idempotencyKey: z.uuid(), lines: z.array(z.object({ accountId: z.uuid(), debit: moneySchema, credit: moneySchema })).min(2).max(500) });
export const practiceExpenseCategorySchema = z.enum(['OFFICE_RENT_FACILITIES','STAFF_SALARIES','BENEFITS_END_OF_SERVICE','OVERHEAD','PETTY_CASH','PARTNER_WITHDRAWAL']);
/** A classification-aware firm expense recognition draft. Settlement is a separate journal. */
export const practiceExpenseDraftSchema = z.object({
  periodId: z.uuid(), accountingDate: z.iso.date(), category: practiceExpenseCategorySchema,
  reference: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(400),
  amount: moneySchema, debitAccountId: z.uuid(), creditAccountId: z.uuid(), idempotencyKey: z.uuid(),
}).refine(value => value.debitAccountId !== value.creditAccountId, 'Expense accounts must be different');
/** A later payment is a separate firm journal against the original expense liability. */
export const practiceExpenseSettlementSchema = z.object({
  periodId: z.uuid(), accountingDate: z.iso.date(),
  reference: z.string().trim().min(1).max(80), amount: moneySchema,
  assetAccountId: z.uuid(), idempotencyKey: z.uuid(),
});
export const practiceVersionSchema = z.object({ expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid() });
export const practiceReverseJournalSchema = practiceVersionSchema.extend({
  periodId: z.uuid(),
  accountingDate: z.iso.date(),
  reference: z.string().trim().min(1).max(80),
});
/** Period transitions require a current version and a durable, human-readable reason. */
export const practicePeriodTransitionSchema = practiceVersionSchema.extend({ reason: z.string().trim().min(10).max(1000) });
/** Browser-safe practice ledger views; firm, actor, and persistence join keys are excluded. */
export const practiceAccountViewSchema = z.object({
  id: z.uuid(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']), active: z.boolean(), posting: z.boolean(),
});
export const practicePeriodViewSchema = z.object({
  id: z.uuid(), startsOn: z.iso.date(), endsOn: z.iso.date(), closed: z.boolean(), version: z.number().int().positive(),
  lastTransitionReason: z.string().max(1_000),
});
export const practiceJournalLineViewSchema = z.object({
  id: z.uuid(), accountId: z.uuid(), position: z.number().int().nonnegative(), debit: moneySchema, credit: moneySchema,
});
export const practiceJournalViewSchema = z.object({
  id: z.uuid(), periodId: z.uuid(), accountingDate: z.iso.date(), reference: z.string().trim().min(1).max(80),
  memo: z.string().trim().min(1).max(500), status: z.enum(['DRAFT', 'POSTED']), version: z.number().int().positive(),
  postedAt: z.iso.datetime().nullable(), reversalOf: z.uuid().nullable(), lines: z.array(practiceJournalLineViewSchema).max(500).optional(),
});
/** Safe metadata for an immutable firm-private receipt version; provider references remain server-only. */
export const practiceExpenseReceiptViewSchema = z.object({
  id: z.uuid(), sequence: z.number().int().positive(), filename: z.string().trim().min(1).max(200),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']), sizeBytes: z.number().int().positive().max(15_000_000),
  createdAt: z.iso.datetime(),
});
export const practiceExpenseReceiptsSchema = z.array(practiceExpenseReceiptViewSchema).max(100);
export const practiceExpenseViewSchema = z.object({
  id: z.uuid(), journalId: z.uuid(), reference: z.string().trim().min(1).max(80),
  category: practiceExpenseCategorySchema, amount: moneySchema, creditAccountId: z.uuid(),
  journalStatus: z.enum(['DRAFT', 'POSTED']), journalVersion: z.number().int().positive(),
  settledAmount: moneySchema, outstandingAmount: moneySchema, settlementAllowed: z.boolean(),
  receipts: z.array(practiceExpenseReceiptViewSchema).max(100), receiptAttachable: z.boolean(),
});
export const practiceBalanceViewSchema = z.object({
  accountId: z.uuid(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']), debit: moneySchema, credit: moneySchema, balance: moneySchema,
});
export const practiceFirmTrialBalanceQuerySchema = z.object({ periodId: z.uuid().optional() });
export const practiceFirmTrialBalanceDetailQuerySchema = z.object({
  periodId: z.uuid(), page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const practiceFirmTrialBalanceRowSchema = z.object({
  accountId: z.uuid(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  openingBalance: moneySchema, openingDebit: moneySchema, openingCredit: moneySchema,
  periodDebit: moneySchema, periodCredit: moneySchema,
  closingBalance: moneySchema, closingDebit: moneySchema, closingCredit: moneySchema,
});
export const practiceFirmTrialBalanceTotalsSchema = z.object({
  openingDebit: moneySchema, openingCredit: moneySchema, periodDebit: moneySchema, periodCredit: moneySchema,
  closingDebit: moneySchema, closingCredit: moneySchema,
});
export const practiceFirmTrialBalanceSchema = z.object({
  currency: z.literal('QAR'), periods: z.array(practicePeriodViewSchema).max(5_000), periodId: z.uuid(),
  startsOn: z.iso.date(), endsOn: z.iso.date(), rows: z.array(practiceFirmTrialBalanceRowSchema).max(10_000),
  totals: practiceFirmTrialBalanceTotalsSchema, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const practiceFirmTrialBalanceEntrySchema = z.object({
  id: z.uuid(), journalId: z.uuid(), accountingDate: z.iso.date(), reference: z.string().trim().min(1).max(80),
  memo: z.string().trim().min(1).max(500), position: z.number().int().nonnegative(), debit: moneySchema, credit: moneySchema,
  isOpeningBalance: z.boolean(), reversalOf: z.uuid().nullable(), reversedBy: z.boolean(),
});
export const practiceFirmTrialBalanceDetailSchema = z.object({
  periodId: z.uuid(), account: practiceFirmTrialBalanceRowSchema, page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(200), totalCount: z.number().int().nonnegative(),
  entries: z.array(practiceFirmTrialBalanceEntrySchema).max(200),
});
const practiceAccountingMonthSchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, 'Use an accounting month in YYYY-MM format.');
export const practiceFirmProfitLossQuerySchema = z.object({
  month: practiceAccountingMonthSchema,
  compareMonth: practiceAccountingMonthSchema.optional(),
}).refine(value => value.compareMonth === undefined || value.compareMonth !== value.month, { message: 'Comparison month must differ from the reporting month.', path: ['compareMonth'] });
export const practiceFirmProfitLossDetailQuerySchema = practiceFirmProfitLossQuerySchema.extend({
  period: z.enum(['CURRENT', 'COMPARISON']), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const practiceFirmProfitLossRowSchema = z.object({
  accountId: z.uuid(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150),
  section: z.enum(['INCOME', 'EXPENSE']), currentAmount: moneySchema, currentEntryCount: z.number().int().nonnegative(),
  comparisonAmount: moneySchema.nullable(), comparisonEntryCount: z.number().int().nonnegative().nullable(),
});
export const practiceFirmProfitLossTotalsSchema = z.object({ income: moneySchema, expenses: moneySchema, net: moneySchema });
export const practiceFirmProfitLossSchema = z.object({
  currency: z.literal('QAR'), parameters: z.object({ month: practiceAccountingMonthSchema, compareMonth: practiceAccountingMonthSchema.nullable() }),
  asOf: z.iso.datetime(), rows: z.array(practiceFirmProfitLossRowSchema).max(10_000),
  currentTotals: practiceFirmProfitLossTotalsSchema, comparisonTotals: practiceFirmProfitLossTotalsSchema.nullable(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const practiceFirmProfitLossEntrySchema = z.object({
  id: z.uuid(), journalId: z.uuid(), accountingDate: z.iso.date(), reference: z.string().trim().min(1).max(80),
  memo: z.string().trim().min(1).max(500), position: z.number().int().nonnegative(), debit: moneySchema, credit: moneySchema,
  reversalOf: z.uuid().nullable(), reversedBy: z.boolean(),
});
export const practiceFirmProfitLossDetailSchema = z.object({
  parameters: z.object({ month: practiceAccountingMonthSchema, compareMonth: practiceAccountingMonthSchema.nullable() }),
  period: z.enum(['CURRENT', 'COMPARISON']), asOf: z.iso.datetime(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  account: practiceFirmProfitLossRowSchema, page: z.number().int().positive(), pageSize: z.number().int().positive().max(200),
  totalCount: z.number().int().nonnegative(), entries: z.array(practiceFirmProfitLossEntrySchema).max(200),
});
export const practiceLedgerSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/), accounts: z.array(practiceAccountViewSchema).max(10_000),
  periods: z.array(practicePeriodViewSchema).max(5_000), journals: z.array(practiceJournalViewSchema).max(100),
  expenses: z.array(practiceExpenseViewSchema).max(500),
  balances: z.array(practiceBalanceViewSchema).max(10_000),
});
/** Professional job grades are pricing identities, separate from application access roles. */
export const practiceJobGrades = ['ENGAGEMENT_PARTNER', 'AUDIT_MANAGER', 'AUDIT_SUPERVISOR', 'AUDIT_SENIOR', 'AUDIT_ASSOCIATE', 'AUDIT_JUNIOR'] as const;
export const practiceJobGradeSchema = z.enum(practiceJobGrades);
export const practiceRateCardViewSchema = z.object({
  id: z.uuid(), grade: practiceJobGradeSchema, currency: z.literal('QAR'), hourlyRate: moneySchema,
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullable(), version: z.number().int().positive(), createdAt: z.iso.datetime(),
});
export const practiceStaffViewSchema = z.object({ id: z.uuid(), email: z.string().email().max(320), accessRole: z.string().min(1).max(48), active: z.boolean() });
export const practiceStaffGradeAssignmentViewSchema = z.object({
  id: z.uuid(), userId: z.uuid(), email: z.string().email().max(320), accessRole: z.string().min(1).max(48),
  grade: practiceJobGradeSchema, effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullable(), version: z.number().int().positive(), createdAt: z.iso.datetime(),
});
export const practiceRateAdministrationSchema = z.object({
  currency: z.literal('QAR'), jobGrades: z.array(practiceJobGradeSchema).length(practiceJobGrades.length),
  rateCards: z.array(practiceRateCardViewSchema).max(10_000), staff: z.array(practiceStaffViewSchema).max(10_000),
  assignments: z.array(practiceStaffGradeAssignmentViewSchema).max(20_000),
});
export const createPracticeRateCardSchema = z.object({
  idempotencyKey: z.uuid(), grade: practiceJobGradeSchema, hourlyRate: moneySchema,
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullable().optional(), expectedPreviousVersion: z.number().int().nonnegative(),
}).refine(value => value.effectiveTo === undefined || value.effectiveTo === null || value.effectiveTo > value.effectiveFrom, 'Effective end date must be after the start date');
export const createPracticeStaffGradeAssignmentSchema = z.object({
  idempotencyKey: z.uuid(), userId: z.uuid(), grade: practiceJobGradeSchema, effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().nullable().optional(), expectedPreviousVersion: z.number().int().nonnegative(),
}).refine(value => value.effectiveTo === undefined || value.effectiveTo === null || value.effectiveTo > value.effectiveFrom, 'Effective end date must be after the start date');
export const practicePostingPolicyViewSchema = z.object({
  policyVersion: z.string().trim().min(1).max(80), revenueTreatment: z.literal('DEFERRED_UNTIL_RELEASE'),
  taxTreatment: z.literal('NO_TAX'), approvedAt: z.iso.datetime(),
});
export const practicePeriodTransitionResultSchema = z.object({
  id: z.uuid(), closed: z.boolean(), version: z.number().int().positive(), reason: z.string().min(10).max(1_000),
});
export const lifecycleCommands = ['OPEN_PROPOSAL','DISPATCH_PROPOSAL','REJECT_PROSPECT','ISSUE_ENGAGEMENT_LETTER','ACTIVATE_PORTAL','START_FIELDWORK','SUBMIT_FOR_REVIEW','RETURN_FOR_REWORK','APPROVE_MANAGER_REVIEW','AUTHORIZE_FINAL_REPORT','RELEASE_FINAL_PACKAGE','LOCK_ARCHIVE'] as const;
export const lifecycleTerminalOutcomes = ['PROSPECT_REJECTED'] as const;
export const lifecycleGateCodes = [
  'PROPOSAL_NOT_DRAFTED','PROPOSAL_NOT_PRESENTED','CLIENT_ACCEPTANCE_MISSING','CLIENT_ACCEPTANCE_STALE','PARTNER_RISK_CLEARANCE_MISSING',
  'ADVANCE_INVOICE_MISSING','ADVANCE_PAYMENT_MISSING','ADVANCE_RECEIPT_MISSING','FINALIZED_TRIAL_BALANCE_MISSING',
  'APPROVED_MATERIALITY_MISSING','MATERIALITY_STALE','WORKPROGRAM_SUBMISSIONS_MISSING','OPEN_REVIEW_NOTES',
  'SRM_NOT_COMPILED','CRITICAL_CONFIRMATIONS_PENDING','RED_RISK_CLEARANCE_MISSING','REPORT_OPINION_MISSING',
  'PARTNER_IMAGE_APPROVAL_MISSING','SIGNED_LOR_MISSING','FINAL_BUNDLE_MISSING','FINAL_INVOICE_MISSING',
  'CLIENT_UPLOAD_FREEZE_MISSING','ARCHIVE_DEADLINE_OR_PARTNER_LOCK_REQUIRED',
] as const;
export const lifecycleCommandSchema = z.object({
  command: z.enum(lifecycleCommands),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});
export const lifecycleCommandResultSchema = z.object({ state: z.enum(states), version: z.number().int().positive(), terminalOutcome: z.enum(lifecycleTerminalOutcomes).optional() });
export const lifecycleTransitionSchema = z.object({
  id: z.uuid(), command: z.enum(lifecycleCommands), fromState: z.enum(states), toState: z.enum(states),
  reason: z.string().max(500).nullable(), version: z.number().int().positive(), createdAt: z.iso.datetime(),
});
export const lifecycleHistorySchema = z.object({
  terminalOutcome: z.enum(lifecycleTerminalOutcomes).nullable(),
  state: z.enum(states), version: z.number().int().positive(), permittedCommands: z.array(z.enum(lifecycleCommands)).max(lifecycleCommands.length),
  history: z.array(lifecycleTransitionSchema).max(10_000),
});
export const lifecycleGateReasonSchema = z.object({ code: z.enum(lifecycleGateCodes), message: z.string().min(1).max(500) });
export const lifecycleCommandGateSchema = z.object({
  command: z.enum(lifecycleCommands), ready: z.boolean(), requiresReason: z.boolean(),
  unmet: z.array(lifecycleGateReasonSchema).max(lifecycleGateCodes.length),
});
export const lifecycleGatesSchema = z.object({
  state: z.enum(states), version: z.number().int().positive(), terminalOutcome: z.enum(lifecycleTerminalOutcomes).nullable(),
  commands: z.array(lifecycleCommandGateSchema).max(lifecycleCommands.length),
});
/** Versioned commercial proposal: presenting pins a snapshot; client acceptance is Key 1 evidence. */
export const createProposalSchema = z.object({
  idempotencyKey: z.uuid(),
  service: z.string().trim().min(3).max(200),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/),
});
export const proposalActionSchema = z.object({ idempotencyKey: z.uuid(), expectedVersion: z.number().int().positive() });
export const acceptProposalSchema = z.object({
  idempotencyKey: z.uuid(),
  expectedVersion: z.number().int().positive(),
  evidenceRef: z.string().trim().min(3).max(200),
});
export const recordRiskClearanceSchema = z.object({ idempotencyKey: z.uuid(), reason: z.string().trim().min(10).max(1000) });
export const commercialProposalViewSchema = z.object({
  id: z.uuid(), service: z.string().trim().min(3).max(200), periodStart: z.iso.date(), periodEnd: z.iso.date(),
  totalAmount: moneySchema, currency: z.string().regex(/^[A-Z]{3}$/), status: z.enum(['DRAFT', 'PRESENTED', 'ACCEPTED']),
  revision: z.number().int().positive(), createdAt: z.iso.datetime(),
});
export const commercialProposalsSchema = z.array(commercialProposalViewSchema).max(200);
export const commercialProposalCreatedResultSchema = z.object({
  id: z.uuid(), status: z.literal('DRAFT'), revision: z.number().int().positive(), totalAmount: moneySchema,
});
export const commercialProposalActionResultSchema = z.object({ id: z.uuid(), status: z.enum(['PRESENTED', 'ACCEPTED']), revision: z.number().int().positive() });
export const commercialDualKeyStatusSchema = z.object({
  key1Status: z.enum(['RECORDED', 'PENDING']), key1ProposalId: z.uuid().nullable(),
  key2Status: z.enum(['RECORDED', 'PENDING']), key2Reason: z.string().max(1_000).nullable(),
  letterIssued: z.boolean(), letterText: z.string().max(100_000).nullable(), letterIssuedAt: z.iso.datetime().nullable(),
  clearances: z.array(z.object({ id: z.uuid(), reason: z.string().max(1_000), clearedAt: z.iso.datetime() })).max(5),
});
export const commercialRiskClearanceResultSchema = z.object({ id: z.uuid(), clearedAt: z.iso.datetime() });
/** Canonical engagement invoices (T069 foundation): 50% advance / 50% final balance. */
export const issueInvoiceSchema = z.object({
  idempotencyKey: z.uuid(),
  kind: z.enum(['ADVANCE_50', 'FINAL_50']),
  dueOn: z.iso.date().optional(),
  /** Legacy caller fields are accepted only to replay a matching historical receipt; never used to issue an invoice. */
  amount: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.dueOn && value.amount !== undefined) context.addIssue({ code: 'custom', path: ['amount'], message: 'Invoice amount is derived from the accepted contract' });
});
export const voidInvoiceSchema = z.object({ idempotencyKey: z.uuid(), reason: z.string().trim().min(10).max(1_000) });
export const recordPaymentSchema = z.object({
  idempotencyKey: z.uuid(),
  amount: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/),
  reference: z.string().trim().min(3).max(200),
});
export const invoiceReceiptSchema = z.object({ idempotencyKey: z.uuid() });
export const invoiceViewSchema = z.object({
  id: z.uuid(), number: z.number().int().positive(), revision: z.number().int().positive(), kind: z.enum(['ADVANCE_50', 'FINAL_50']),
  proposalId: z.uuid(), proposalRevision: z.number().int().positive(), contractFee: moneySchema,
  amount: moneySchema, currency: z.string().regex(/^[A-Z]{3}$/), dueOn: z.iso.date().nullable(), status: z.enum(['ISSUED', 'PAID', 'VOID']),
  issuedAt: z.iso.datetime(), paidToDate: moneySchema, receiptIssued: z.boolean(),
  lines: z.array(z.object({ position: z.number().int().positive(), description: z.string().min(1), amount: moneySchema })).max(100),
  voidReason: z.string().min(1).nullable(),
});
export const invoicesSchema = z.array(invoiceViewSchema).max(200);
export const invoiceIssuedResultSchema = z.object({
  id: z.uuid(), number: z.number().int().positive(), revision: z.number().int().positive(), kind: z.enum(['ADVANCE_50', 'FINAL_50']),
  proposalId: z.uuid(), proposalRevision: z.number().int().positive(), contractFee: moneySchema, dueOn: z.iso.date(),
  amount: moneySchema, status: z.literal('ISSUED'),
});
export const invoiceVoidResultSchema = z.object({ invoiceId: z.uuid(), status: z.literal('VOID'), revision: z.number().int().positive() });
export const invoicePaymentResultSchema = z.object({ invoiceId: z.uuid(), settled: z.boolean() });
export const invoiceReceiptResultSchema = z.object({ receiptId: z.uuid(), invoiceId: z.uuid() });

/** Browser-safe identity endpoints. These schemas strip undeclared persistence fields by default. */
export const identityConfigurationSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('development') }),
  z.object({
    provider: z.literal('entra'),
    tenantId: z.string().trim().min(1),
    clientId: z.string().trim().min(1),
    scopes: z.array(z.string().trim().min(1)).min(1).max(20),
    redirectUri: z.string().url(),
  }),
]);
export const internalIdentitySchema = z.object({ id: z.string().min(1).max(100), email: z.string().email().max(320), active: z.boolean() });
export const readableEngagementSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(300),
  clientId: z.string().min(1).max(100), clientName: z.string().min(1).max(300), version: z.number().int().positive(),
});
export const readableEngagementsSchema = z.array(readableEngagementSchema).max(10_000);
export const sessionRevocationResponseSchema = z.object({ revokedBefore: z.iso.datetime() });
export const engagementStaffAssignmentResultSchema = z.object({
  userId: z.string().min(1).max(100), engagementId: z.string().min(1).max(100),
  role: z.enum(staffRoles), capabilities: z.array(capabilitySchema), expiresAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const engagementStaffRevocationResultSchema = z.object({
  userId: z.string().min(1).max(100), engagementId: z.string().min(1).max(100),
  revoked: z.literal(true), revokedGrantCount: z.number().int().nonnegative(), version: z.number().int().positive(),
});
const problemMessageSchema = z.union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())]);
export const apiProblemCodeSchema = z.enum([
  'BAD_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'NOT_ACCEPTABLE',
  'REQUEST_TIMEOUT', 'CONFLICT', 'GONE', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE',
  'UNPROCESSABLE_ENTITY', 'TOO_MANY_REQUESTS', 'BAD_GATEWAY', 'SERVICE_UNAVAILABLE', 'GATEWAY_TIMEOUT',
  'HTTP_ERROR', 'INTERNAL_SERVER_ERROR',
]);
export type ApiProblemCode = z.infer<typeof apiProblemCodeSchema>;
/** Stable application error codes are distinct from the numeric HTTP status. */
export const apiProblemSchema = z.object({
  error: z.object({
    code: apiProblemCodeSchema,
    status: z.number().int().min(400).max(599),
    message: problemMessageSchema,
    correlationId: z.string().min(1).max(64).optional(),
  }),
});
export const healthResponseSchema = z.object({ status: z.literal('ok'), service: z.literal('auditsphere-api') });
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  dependencies: z.object({ postgres: z.literal('up'), redis: z.enum(['up', 'down']) }),
  alerts: z.array(z.object({
    code: z.enum(['REDIS_UNAVAILABLE']),
    action: z.string().trim().min(1).max(300),
  })).max(2),
});
export const systemVersionSchema = z.object({ service: z.literal('auditsphere-api'), version: z.string().regex(/^\d+\.\d+\.\d+$/) });
/** Audit reads preserve verification evidence while validating all transport fields. */
export const auditCheckpointSchema = z.object({
  formatVersion: z.literal(1), engagementId: z.uuid(), sequence: z.string().regex(/^(0|[1-9]\d*)$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const auditVerificationSchema = z.object({ valid: z.boolean(), reason: z.string().trim().min(1).max(300).optional() });
export const auditEventSchema = z.object({
  id: z.uuid(), actorKind: z.enum(['USER', 'SERVICE']), actorId: z.uuid().nullable(), action: z.string().trim().min(1).max(200),
  resourceType: z.string().max(120).nullable(), resourceId: z.string().max(200).nullable(),
  resourceVersion: z.number().int().nonnegative().nullable(), correlationId: z.string().max(64).nullable(),
  payload: z.json(), beforeState: z.json().nullable(), afterState: z.json().nullable(), createdAt: z.iso.datetime(),
});
export const auditEventsSchema = z.array(auditEventSchema).max(500);
/** Bounded offset pagination. Public limits are always capped even when a TypeScript caller is bypassed. */
export const paginationQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
/** Explicitly bounded virtualized Trial Balance page; query strings are coerced at the HTTP boundary. */
export const trialBalanceRowsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  search: z.string().max(100).default(''),
});
/** Allowlisted transport views for the Trial Balance workspace; internal firm/client/storage keys stay server-side. */
export const trialBalanceImportSchema = z.object({
  id: z.uuid(), status: z.enum(['UPLOADED', 'QUEUED', 'PARSING', 'VALIDATING', 'MAPPING_REQUIRED', 'READY_TO_FINALIZE', 'FINALIZING', 'FINALIZED', 'FAILED']),
  error: z.string().max(500).nullable(), rowCount: z.number().int().nonnegative(),
  version: z.number().int().positive(), createdAt: z.iso.datetime(),
});
export const trialBalanceImportsSchema = z.array(trialBalanceImportSchema).max(200);
export const trialBalanceRowSchema = z.object({
  id: z.uuid(), code: z.string().max(1000), name: z.string().max(4000),
  current: moneySchema, prior: moneySchema, fsli: z.string().max(120).nullable(), version: z.number().int().positive(),
});
export const trialBalanceRowsPageSchema = z.object({ total: z.number().int().nonnegative(), rows: z.array(trialBalanceRowSchema).max(200) });
export const trialBalanceSummaryLineSchema = z.object({ fsli: z.string().max(120), current: moneySchema, prior: moneySchema, count: z.number().int().positive() });
export const trialBalanceSummarySchema = z.array(trialBalanceSummaryLineSchema).max(2_000);
/** Statement-ordered Trial Balance summary (T050): P&L first, balance sheet second, CY/PY variance and explicit route placeholders. */
export const trialBalanceStatementLineSchema = z.object({
  fsli: z.string().max(120), current: moneySchema, prior: moneySchema, change: moneySchema,
  percent: moneySchema.nullable(), direction: z.enum(['NO_BASE', 'NO_CHANGE', 'INCREASE', 'DECREASE']), count: z.number().int().positive(),
});
export const trialBalanceStatementSummarySchema = z.object({
  profitAndLoss: z.array(trialBalanceStatementLineSchema).max(20), balanceSheet: z.array(trialBalanceStatementLineSchema).max(20),
  unmapped: trialBalanceStatementLineSchema.nullable(),
  placeholders: z.object({ accountsReceivable: z.literal('ROUTE_PENDING'), workprograms: z.literal('ROUTE_PENDING') }),
});
export const mappingsSavedSchema = z.object({ saved: z.number().int().positive() });
export const trialBalanceFinalizedSchema = z.object({ status: z.literal('FINALIZED') });
export const editLeaseHolderSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(1).max(320),
  expiresAt: z.iso.datetime(),
  ownedByCurrentUser: z.boolean(),
  leaseToken: z.uuid().optional(),
});
export const editLeaseResultSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(false), action: z.enum(['status', 'acquire', 'renew', 'release']), reason: z.literal('REDIS_UNAVAILABLE') }),
  z.object({ available: z.literal(true), action: z.enum(['status', 'acquire', 'renew', 'release']), lease: editLeaseHolderSchema.nullable() }),
]);
/** Redis edit leases coordinate users; they do not replace PostgreSQL expectedVersion checks. */
export const editLeaseSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('acquire') }),
  z.object({ action: z.enum(['renew', 'release']), token: z.uuid() }),
]);
/** Portal credentials are request-only. No response schema contains a password, session token or CSRF token. */
export const portalLoginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});
export const portalInvitationRedeemRequestSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const portalFirstPasswordRequestSchema = z.object({
  password: z.string().min(12).max(256),
});
export const portalPasswordResetRequestSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(256),
});
export const portalAuthResultSchema = z.object({ mustChangePassword: z.boolean() });
export const portalIdentitySchema = z.object({
  id: z.string().min(1).max(100),
  email: z.string().email().max(320),
  mustChangePassword: z.boolean(),
});
export const portalPasswordResetResultSchema = z.object({ passwordReset: z.literal(true), signedOut: z.literal(true) });
export const portalLogoutResultSchema = z.object({ signedOut: z.literal(true) });

/** Canonical input and output schemas exported for deterministic JSON Schema/OpenAPI generation. */
export const contractSchemas = {
  practiceAccount: practiceAccountSchema, practicePeriod: practicePeriodSchema, practiceJournal: practiceJournalSchema,
  practiceExpenseCategory: practiceExpenseCategorySchema, practiceExpenseDraft: practiceExpenseDraftSchema,
  practiceExpenseSettlement: practiceExpenseSettlementSchema,
  practicePostingPolicy: practicePostingPolicySchema, practiceVersion: practiceVersionSchema,
  practiceAccountView: practiceAccountViewSchema, practicePeriodView: practicePeriodViewSchema,
  practiceJournalLineView: practiceJournalLineViewSchema, practiceJournalView: practiceJournalViewSchema,
  practiceExpenseView: practiceExpenseViewSchema,
  practiceExpenseReceiptView: practiceExpenseReceiptViewSchema, practiceExpenseReceipts: practiceExpenseReceiptsSchema,
  practiceBalanceView: practiceBalanceViewSchema, practiceLedger: practiceLedgerSchema,
  practiceFirmTrialBalanceQuery: practiceFirmTrialBalanceQuerySchema,
  practiceFirmTrialBalanceDetailQuery: practiceFirmTrialBalanceDetailQuerySchema,
  practiceFirmTrialBalanceRow: practiceFirmTrialBalanceRowSchema,
  practiceFirmTrialBalanceTotals: practiceFirmTrialBalanceTotalsSchema,
  practiceFirmTrialBalance: practiceFirmTrialBalanceSchema,
  practiceFirmTrialBalanceEntry: practiceFirmTrialBalanceEntrySchema,
  practiceFirmTrialBalanceDetail: practiceFirmTrialBalanceDetailSchema,
  practiceFirmProfitLossQuery: practiceFirmProfitLossQuerySchema,
  practiceFirmProfitLossDetailQuery: practiceFirmProfitLossDetailQuerySchema,
  practiceFirmProfitLossRow: practiceFirmProfitLossRowSchema,
  practiceFirmProfitLossTotals: practiceFirmProfitLossTotalsSchema,
  practiceFirmProfitLoss: practiceFirmProfitLossSchema,
  practiceFirmProfitLossEntry: practiceFirmProfitLossEntrySchema,
  practiceFirmProfitLossDetail: practiceFirmProfitLossDetailSchema,
  practiceJobGrade: practiceJobGradeSchema, practiceRateCardView: practiceRateCardViewSchema,
  practiceStaffView: practiceStaffViewSchema, practiceStaffGradeAssignmentView: practiceStaffGradeAssignmentViewSchema,
  practiceRateAdministration: practiceRateAdministrationSchema, createPracticeRateCard: createPracticeRateCardSchema,
  createPracticeStaffGradeAssignment: createPracticeStaffGradeAssignmentSchema,
  practicePostingPolicyView: practicePostingPolicyViewSchema, practicePeriodTransitionResult: practicePeriodTransitionResultSchema,
  practiceReverseJournal: practiceReverseJournalSchema, invoiceReceipt: invoiceReceiptSchema, invoiceVoid: voidInvoiceSchema,
  invoice: invoiceViewSchema, invoices: invoicesSchema, invoiceIssuedResult: invoiceIssuedResultSchema,
  invoicePaymentResult: invoicePaymentResultSchema, invoiceReceiptResult: invoiceReceiptResultSchema, invoiceVoidResult: invoiceVoidResultSchema,
  editLease: editLeaseSchema, upload: uploadSchema, mappings: mappingSchema, finalize: finalizeSchema,
  documentLinkCreate: documentLinkCreateSchema, documentLinkRevoke: documentLinkRevokeSchema,
  documentLinksQuery: documentLinksQuerySchema,
  documentLink: documentLinkSchema, documentLinks: documentLinksSchema, documentLinkResult: documentLinkResultSchema,
  documentLinkRevoked: documentLinkRevokedSchema,
  documentUploadInit: documentUploadInitSchema, documentUploadSession: documentUploadSessionSchema,
  documentUploadReceived: documentUploadReceivedSchema, documentUploadFinalized: documentUploadFinalizedSchema,
  lifecycle: lifecycleCommandSchema, lifecycleCommandResult: lifecycleCommandResultSchema,
  lifecycleTransition: lifecycleTransitionSchema, lifecycleHistory: lifecycleHistorySchema, lifecycleGates: lifecycleGatesSchema,
  publish: publishSchema, publication: publicationSchema, publicationRow: publicationRowSchema,
  publicationDetail: publicationDetailSchema, publicationResult: publicationResultSchema,
  mappingApproval: approveMappingSchema, mappingApprovalResult: mappingApprovalResultSchema, taxonomy: createTaxonomySchema,
  taxonomyApproval: approveTaxonomySchema,
  taxonomyLineView: taxonomyLineViewSchema, taxonomyView: taxonomyViewSchema, taxonomyViews: taxonomyViewsSchema,
  taxonomyCreatedResult: taxonomyCreatedResultSchema, taxonomyApprovedResult: taxonomyApprovedResultSchema,
  mappingSuggestionItem: mappingSuggestionItemSchema, mappingSuggestions: mappingSuggestionsSchema,
  materiality: calculateMaterialitySchema, materialityApproval: approveMaterialitySchema, risk: createRiskSchema,
  commercialProposal: commercialProposalViewSchema, commercialProposals: commercialProposalsSchema,
  commercialProposalCreatedResult: commercialProposalCreatedResultSchema, commercialProposalActionResult: commercialProposalActionResultSchema,
  commercialDualKeyStatus: commercialDualKeyStatusSchema, commercialRiskClearanceResult: commercialRiskClearanceResultSchema,
  materialityAssessment: materialityAssessmentSchema, materialityCalculationResult: materialityCalculationResultSchema,
  materialityApprovalResult: materialityApprovalResultSchema, riskView: riskViewSchema, riskCreatedResult: riskCreatedResultSchema,
  riskAssessmentResult: riskAssessmentResultSchema, riskClearanceResult: riskClearanceResultSchema,
  riskOwnerAssignmentResult: riskOwnerAssignmentResultSchema,
  riskAssessment: assessRiskSchema, riskClearance: clearRiskSchema, riskOwner: assignRiskOwnerSchema,
  reviewNote: raiseReviewNoteSchema, reviewResolution: resolveReviewNoteSchema, reviewNoteView: reviewNoteSchema,
  reviewNotes: reviewNotesSchema, reviewNoteResult: reviewNoteResultSchema, reviewSummary: reviewSummarySchema,
  adjustment: createAdjustmentJournalSchema, adjustmentJournalLineView: adjustmentJournalLineViewSchema,
  adjustmentJournal: adjustmentJournalSchema, adjustmentJournals: adjustmentJournalsSchema,
  adjustmentJournalDetail: adjustmentJournalDetailSchema, adjustmentCreatedResult: adjustmentCreatedResultSchema,
  adjustmentPostedResult: adjustmentPostedResultSchema, adjustmentReversedResult: adjustmentReversedResultSchema,
  adjustedBalanceItem: adjustedBalanceItemSchema, adjustedBalances: adjustedBalancesSchema,
  adjustmentPost: postAdjustmentJournalSchema, adjustmentReverse: reverseAdjustmentJournalSchema,
  engagementStaffAssignment: assignEngagementStaffSchema, engagementStaffRevocation: revokeEngagementStaffSchema,
  identityConfiguration: identityConfigurationSchema, internalIdentity: internalIdentitySchema,
  readableEngagement: readableEngagementSchema, readableEngagements: readableEngagementsSchema,
  sessionRevocationResponse: sessionRevocationResponseSchema,
  engagementStaffAssignmentResult: engagementStaffAssignmentResultSchema,
  engagementStaffRevocationResult: engagementStaffRevocationResultSchema,
  auditCheckpoint: auditCheckpointSchema, auditVerification: auditVerificationSchema, auditEvent: auditEventSchema, auditEvents: auditEventsSchema,
  healthResponse: healthResponseSchema, readinessResponse: readinessResponseSchema, systemVersion: systemVersionSchema,
  apiProblem: apiProblemSchema, paginationQuery: paginationQuerySchema,
  trialBalanceRowsQuery: trialBalanceRowsQuerySchema,
  trialBalanceImport: trialBalanceImportSchema, trialBalanceRow: trialBalanceRowSchema,
  trialBalanceRowsPage: trialBalanceRowsPageSchema, trialBalanceSummary: trialBalanceSummarySchema,
  trialBalanceStatementSummary: trialBalanceStatementSummarySchema,
  mappingsSaved: mappingsSavedSchema, trialBalanceFinalized: trialBalanceFinalizedSchema,
  editLeaseResult: editLeaseResultSchema,
  portalLoginRequest: portalLoginRequestSchema, portalInvitationRedeemRequest: portalInvitationRedeemRequestSchema,
  portalFirstPasswordRequest: portalFirstPasswordRequestSchema, portalPasswordResetRequest: portalPasswordResetRequestSchema,
  portalAuthResult: portalAuthResultSchema, portalIdentity: portalIdentitySchema,
  portalPasswordResetResult: portalPasswordResetResultSchema, portalLogoutResult: portalLogoutResultSchema,
} as const;

export type IdentityConfiguration = z.infer<typeof identityConfigurationSchema>;
export type InternalIdentity = z.infer<typeof internalIdentitySchema>;
export type ReadableEngagement = z.infer<typeof readableEngagementSchema>;
export type ReadableEngagements = z.infer<typeof readableEngagementsSchema>;
export type SessionRevocationResponse = z.infer<typeof sessionRevocationResponseSchema>;
export type ApiProblem = z.infer<typeof apiProblemSchema>;
export type PortalLoginRequest = z.infer<typeof portalLoginRequestSchema>;
export type PortalInvitationRedeemRequest = z.infer<typeof portalInvitationRedeemRequestSchema>;
export type PortalFirstPasswordRequest = z.infer<typeof portalFirstPasswordRequestSchema>;
export type PortalPasswordResetRequest = z.infer<typeof portalPasswordResetRequestSchema>;
export type PortalAuthResult = z.infer<typeof portalAuthResultSchema>;
export type PortalIdentity = z.infer<typeof portalIdentitySchema>;
export type PortalPasswordResetResult = z.infer<typeof portalPasswordResetResultSchema>;
export type PortalLogoutResult = z.infer<typeof portalLogoutResultSchema>;
export type InvoiceReceiptRequest = z.infer<typeof invoiceReceiptSchema>;
export type InvoiceVoidRequest = z.infer<typeof voidInvoiceSchema>;
export type TrialBalanceRowsQuery = z.infer<typeof trialBalanceRowsQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type TrialBalanceImport = z.infer<typeof trialBalanceImportSchema>;
export type TrialBalanceRow = z.infer<typeof trialBalanceRowSchema>;
export type TrialBalanceRowsPage = z.infer<typeof trialBalanceRowsPageSchema>;
export type TrialBalanceSummaryLine = z.infer<typeof trialBalanceSummaryLineSchema>;
export type TrialBalanceStatementSummary = z.infer<typeof trialBalanceStatementSummarySchema>;
export type MaterialityAssessment = z.infer<typeof materialityAssessmentSchema>;
export type MaterialityCalculationResult = z.infer<typeof materialityCalculationResultSchema>;
export type MaterialityApprovalResult = z.infer<typeof materialityApprovalResultSchema>;
export type ReviewNote = z.infer<typeof reviewNoteSchema>;
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;
export type AdjustmentJournal = z.infer<typeof adjustmentJournalSchema>;
export type AdjustmentJournalDetail = z.infer<typeof adjustmentJournalDetailSchema>;
export type AdjustedBalances = z.infer<typeof adjustedBalancesSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type PublicationDetail = z.infer<typeof publicationDetailSchema>;
export type PublicationResult = z.infer<typeof publicationResultSchema>;
export type TaxonomyView = z.infer<typeof taxonomyViewSchema>;
export type TaxonomyCreatedResult = z.infer<typeof taxonomyCreatedResultSchema>;
export type TaxonomyApprovedResult = z.infer<typeof taxonomyApprovedResultSchema>;
export type MappingApprovalResult = z.infer<typeof mappingApprovalResultSchema>;
export type MappingSuggestions = z.infer<typeof mappingSuggestionsSchema>;
export type LifecycleHistory = z.infer<typeof lifecycleHistorySchema>;
export type LifecycleGates = z.infer<typeof lifecycleGatesSchema>;
export type LifecycleCommandResult = z.infer<typeof lifecycleCommandResultSchema>;
export type RiskView = z.infer<typeof riskViewSchema>;
export type RiskCreatedResult = z.infer<typeof riskCreatedResultSchema>;
export type RiskAssessmentResult = z.infer<typeof riskAssessmentResultSchema>;
export type RiskClearanceResult = z.infer<typeof riskClearanceResultSchema>;
export type RiskOwnerAssignmentResult = z.infer<typeof riskOwnerAssignmentResultSchema>;
export type AuditCheckpoint = z.infer<typeof auditCheckpointSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type PracticeLedger = z.infer<typeof practiceLedgerSchema>;
export type PracticeFirmTrialBalanceQuery = z.infer<typeof practiceFirmTrialBalanceQuerySchema>;
export type PracticeFirmTrialBalanceDetailQuery = z.infer<typeof practiceFirmTrialBalanceDetailQuerySchema>;
export type PracticeFirmTrialBalance = z.infer<typeof practiceFirmTrialBalanceSchema>;
export type PracticeFirmTrialBalanceDetail = z.infer<typeof practiceFirmTrialBalanceDetailSchema>;
export type PracticeFirmProfitLossQuery = z.infer<typeof practiceFirmProfitLossQuerySchema>;
export type PracticeFirmProfitLossDetailQuery = z.infer<typeof practiceFirmProfitLossDetailQuerySchema>;
export type PracticeFirmProfitLoss = z.infer<typeof practiceFirmProfitLossSchema>;
export type PracticeFirmProfitLossRow = z.infer<typeof practiceFirmProfitLossRowSchema>;
export type PracticeFirmProfitLossTotals = z.infer<typeof practiceFirmProfitLossTotalsSchema>;
export type PracticeFirmProfitLossDetail = z.infer<typeof practiceFirmProfitLossDetailSchema>;
export type PracticeJobGrade = z.infer<typeof practiceJobGradeSchema>;
export type PracticeRateAdministration = z.infer<typeof practiceRateAdministrationSchema>;
export type PracticeRateCardView = z.infer<typeof practiceRateCardViewSchema>;
export type PracticeStaffGradeAssignmentView = z.infer<typeof practiceStaffGradeAssignmentViewSchema>;
export type CommercialProposal = z.infer<typeof commercialProposalViewSchema>;
export type Invoice = z.infer<typeof invoiceViewSchema>;
/** Presentation-only label order. Never use this for mutation authorization or progression:
 *  guarded transitions live in modules/governance/lifecycle.ts and require command evidence. */
export function nextState(current: string): string | undefined { const i = states.indexOf(current as typeof states[number]); return i < 0 ? undefined : states[i + 1]; }

/** T052: client legal profile and organizational hierarchy. */
export const createClientSchema = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(3).max(200),
  legalName: z.string().trim().min(3).max(200).optional(),
  taxId: z.string().trim().min(3).max(60).optional(),
  legalForm: z.string().trim().min(2).max(100).optional(),
  address: z.string().trim().max(500).optional(),
  parentClientId: z.uuid().optional(),
});
export const updateClientProfileSchema = z.object({
  idempotencyKey: z.uuid(),
  legalName: z.string().trim().min(3).max(200).optional(),
  taxId: z.string().trim().min(3).max(60).optional(),
  legalForm: z.string().trim().min(2).max(100).optional(),
  address: z.string().trim().max(500).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
});
export const setClientParentSchema = z.object({ idempotencyKey: z.uuid(), parentClientId: z.uuid().nullable() });
export const commercialClientCreatedResultSchema = z.object({ id: z.uuid(), name: z.string().max(200), legalName: z.string().max(200).nullable(), status: z.string().max(40), parentClientId: z.uuid().nullable() });
export const commercialClientProfileViewSchema = z.object({ id: z.uuid(), legalName: z.string().max(200).nullable(), taxId: z.string().max(60).nullable(), legalForm: z.string().max(100).nullable(), address: z.string().max(500).nullable(), status: z.string().max(40) });
export const commercialClientParentResultSchema = z.object({ id: z.uuid(), parentClientId: z.uuid().nullable() });

/** T053: contacts with MD/GM, CFO/FD and audit-liaison routing roles. */
export const contactRoles = ['MANAGING_DIRECTOR', 'CFO_FD', 'AUDIT_LIAISON'] as const;
export const contactRoleSchema = z.enum(contactRoles);
/** Document categories route to exactly one contact role each (requirements 4.1.1). */
export const documentCategories = ['PROPOSAL', 'ENGAGEMENT_LETTER', 'DELIVERABLE', 'INVOICE', 'RECEIPT', 'PBC', 'CONFIRMATION'] as const;
export const documentCategorySchema = z.enum(documentCategories);
export const documentCategoryRole: Record<(typeof documentCategories)[number], (typeof contactRoles)[number]> = {
  PROPOSAL: 'MANAGING_DIRECTOR', ENGAGEMENT_LETTER: 'MANAGING_DIRECTOR', DELIVERABLE: 'MANAGING_DIRECTOR',
  INVOICE: 'CFO_FD', RECEIPT: 'CFO_FD',
  PBC: 'AUDIT_LIAISON', CONFIRMATION: 'AUDIT_LIAISON',
};
export const createContactSchema = z.object({
  idempotencyKey: z.uuid(),
  clientId: z.uuid(),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200),
  role: contactRoleSchema,
  isPrimary: z.boolean(),
});
export const commercialContactViewSchema = z.object({ id: z.uuid(), clientId: z.uuid(), name: z.string().max(200), email: z.string().email().max(200), role: contactRoleSchema, isPrimary: z.boolean(), createdAt: z.iso.datetime() });
export const commercialContactListSchema = z.array(commercialContactViewSchema);
export const commercialContactCreatedResultSchema = z.object({ id: z.uuid(), clientId: z.uuid(), name: z.string().max(200), role: contactRoleSchema, isPrimary: z.boolean() });
export const commercialContactSnapshotSchema = z.object({ contactId: z.uuid(), clientId: z.uuid(), name: z.string().max(200), email: z.string().email().max(200), role: contactRoleSchema, resolvedAt: z.iso.datetime() });
export const commercialClientDirectoryItemSchema = z.object({
  id: z.uuid(), name: z.string().max(200), legalName: z.string().max(200).nullable(), taxId: z.string().max(60).nullable(),
  legalForm: z.string().max(100).nullable(), address: z.string().max(500).nullable(), status: z.string().max(40),
  parentClientId: z.uuid().nullable(), contacts: z.array(commercialContactViewSchema),
});
export const commercialClientDirectorySchema = z.array(commercialClientDirectoryItemSchema);

/** T054: multi-channel lead intake with gated profile-to-proposal progression. */
export const leadSources = ['PHONE', 'WHATSAPP', 'EMAIL', 'WEB', 'REFERRAL'] as const;
export const createLeadSchema = z.object({
  idempotencyKey: z.uuid(),
  source: z.enum(leadSources),
  legalName: z.string().trim().min(3).max(200),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  scope: z.string().trim().max(500).optional(),
});
export const profileLeadSchema = z.object({
  idempotencyKey: z.uuid(),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().email().max(200),
  scope: z.string().trim().min(3).max(500),
});
export const commercialLeadViewSchema = z.object({
  id: z.uuid(), source: z.enum(leadSources), legalName: z.string().max(200), contactName: z.string().max(200).nullable(),
  contactEmail: z.string().email().max(200).nullable(), scope: z.string().max(500).nullable(), status: z.string().max(40),
  duplicateOfId: z.uuid().nullable(), createdAt: z.iso.datetime(),
});
export const commercialLeadListSchema = z.array(commercialLeadViewSchema);
export const commercialLeadCreatedResultSchema = z.object({ id: z.uuid(), source: z.enum(leadSources), status: z.string().max(40), duplicateOfId: z.uuid().nullable() });
export const commercialLeadProfileResultSchema = z.object({ id: z.uuid(), status: z.string().max(40), contactName: z.string().max(200), scope: z.string().max(500) });
export const commercialLeadAdvanceResultSchema = z.object({ id: z.uuid(), status: z.string().max(40) });
export type CommercialClientCreatedResult = z.infer<typeof commercialClientCreatedResultSchema>;
export type CommercialClientProfileView = z.infer<typeof commercialClientProfileViewSchema>;
export type CommercialClientParentResult = z.infer<typeof commercialClientParentResultSchema>;
export type CommercialClientDirectory = z.infer<typeof commercialClientDirectorySchema>;
export type CommercialContact = z.infer<typeof commercialContactViewSchema>;
export type CommercialContactSnapshot = z.infer<typeof commercialContactSnapshotSchema>;
export type CommercialLead = z.infer<typeof commercialLeadViewSchema>;
export type CommercialLeadCreatedResult = z.infer<typeof commercialLeadCreatedResultSchema>;
