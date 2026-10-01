#!/usr/bin/env node
// MIG-001 capability map: binds the migration plan's C01-C38 rows to concrete source
// symbols and destination owners. Resolution is textual; unresolved symbols are reported
// rather than silently dropped so the parity matrix cannot overstate coverage.
//
// Usage: node scripts/migration/capability-map.mjs [--source tmp/AuditSphere] [--out docs/migration/inventory]

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const sourceRoot = path.resolve(arg('--source', 'tmp/AuditSphere'));
const outDir = path.resolve(arg('--out', 'docs/migration/inventory'));
if (!existsSync(sourceRoot)) { console.error('Source checkout not found: ' + sourceRoot); process.exit(1); }

async function walk(dir, acc = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (['bin', 'obj', '.git'].includes(entry.name)) continue; await walk(full, acc); }
    else if (entry.name.endsWith('.cs') && !entry.name.endsWith('.Designer.cs')) acc.push(full);
  }
  return acc;
}
const rel = (f) => path.relative(sourceRoot, f).split(path.sep).join('/');

// C01-C38 as declared in the migration plan section 7.2. 'symbols' are exact type names
// named by the plan; 'dirs' are capability folders used when the plan describes a family.
export const capabilityMap = [
  { id: 'C01', name: 'Local identity, role grants and access workspace', owner: 'Platform authorization / governance administration', taskAnchor: 'T018-T021, T151; MIG-004', symbols: ['RoleAssignmentService', 'RoleGrantExpiry', 'UserAccessWorkspaceQuery'] },
  { id: 'C02', name: 'Microsoft tenant consent and capability verification', owner: 'Platform Microsoft adapters / governance administration', taskAnchor: 'T149-T156; MIG-012', symbols: ['TenantConsentService'] },
  { id: 'C03', name: 'Client SharePoint site provisioning', owner: 'Platform site-provisioning workers / site status UI', taskAnchor: 'T064, T154, T156; MIG-012', symbols: ['SharePointClientSiteProvider'], dirs: ['src/AuditSphereOps.Application/Documents'] },
  { id: 'C04', name: 'Practice CRM, leads and client portfolio', owner: 'Commercial CRM / portfolio', taskAnchor: 'T052-T055', symbols: ['PracticeCrmService', 'PracticeLeadQuery'] },
  { id: 'C05', name: 'Quotation calculation and tender documents', owner: 'Commercial quotations / tenders', taskAnchor: 'T060-T062; MIG-006', symbols: ['QuotationCalculator', 'CommercialApprovalMatrix', 'QuotationService', 'CommercialDocumentService'] },
  { id: 'C06', name: 'Acceptance, continuance and activation', owner: 'Governance acceptance and lifecycle', taskAnchor: 'T056-T059, T063, T073', symbols: ['AcceptanceRules', 'EngagementLifecycleService'] },
  { id: 'C07', name: 'Fee agreements and automatic fee invoices', owner: 'Commercial fee agreement / practice invoicing', taskAnchor: 'T065, T069-T072, T125; MIG-006', symbols: ['FeeAgreementService', 'AutomaticFeeInvoiceHandler', 'AutomaticFeeInvoicePolicy', 'CommercialDocumentService'] },
  { id: 'C08', name: 'Client portal, first sign-in and delegation', owner: 'Governance client access / Angular portal', taskAnchor: 'T020, T073-T077', symbols: ['ClientPortalService'] },
  { id: 'C09', name: 'PBC requests, upload intents and communications', owner: 'Platform document pipeline / fieldwork PBC', taskAnchor: 'T032-T034, T074-T077, T094', symbols: ['PbcService'] },
  { id: 'C10', name: 'Client accounting profiles, periods, books and restatements', owner: 'Fieldwork accounting setup', taskAnchor: 'T018, T023; MIG-007', symbols: ['ClientAccountingService'] },
  { id: 'C11', name: 'Trial balance import and multi-period intake', owner: 'Fieldwork intake wizard', taskAnchor: 'T043-T045, T078-T081; MIG-008', symbols: ['TrialBalanceImportService', 'MultiPeriodTrialBalanceService'] },
  { id: 'C12', name: 'General ledger import, query and completeness', owner: 'Fieldwork GL explorer', taskAnchor: 'T079; MIG-008', keywords: ['GeneralLedger', 'GlImport', 'GlQuery', 'GlCompleteness'] },
  { id: 'C13', name: 'Mapping memory and approved mappings', owner: 'Fieldwork mapping workbench / reporting mapping approval', taskAnchor: 'T046-T050, T080-T082; MIG-009', symbols: ['MappingMemoryService', 'MappedTrialBalanceSource'] },
  { id: 'C14', name: 'Financial statement drill-down and currency review', owner: 'Angular split dashboard', taskAnchor: 'T082', symbols: ['FinancialStatementDrillDownQuery', 'TrialBalanceCurrencyReviewQuery'] },
  { id: 'C15', name: 'Adjustment journals, plans and eligibility', owner: 'Fieldwork adjustments', taskAnchor: 'T103-T105; MIG-008', symbols: ['AdjustmentJournalService', 'AdjustmentPlanService', 'AdjustmentEligibilityQuery'] },
  { id: 'C16', name: 'Reconciliations, valuations and journal risk analysis', owner: 'Fieldwork evidence and analytical review', taskAnchor: 'T096, T105; MIG-010', symbols: ['AccountingAnalysisService'] },
  { id: 'C17', name: 'Currency remeasurement and translation', owner: 'Fieldwork currency workpapers', taskAnchor: 'MIG-010', symbols: ['CurrencyRemeasurementService', 'CurrencyTranslationService'] },
  { id: 'C18', name: 'Consolidation groups, perimeters and runs', owner: 'Fieldwork group consolidation', taskAnchor: 'MIG-011', symbols: ['ConsolidationService'] },
  { id: 'C19', name: 'Advanced consolidation calculators and reports', owner: 'Fieldwork advanced consolidation', taskAnchor: 'MIG-011', keywords: ['Consolidation'] },
  { id: 'C20', name: 'Financial statements, packages, review and seal', owner: 'Reporting statement and package workspaces', taskAnchor: 'T119, T127-T128; MIG-009', symbols: ['FinancialStatementService'] },
  { id: 'C21', name: 'Staffing, resource planning and grid calculation', owner: 'Governance staffing and availability', taskAnchor: 'T083-T084, T139, T142', symbols: ['StaffingService', 'ResourcePlanningService', 'ResourceGridCalculator'] },
  { id: 'C22', name: 'Materiality and risk classification', owner: 'Governance materiality and risk', taskAnchor: 'T085-T089', symbols: ['MaterialityCalculator', 'MaterialityEngineService', 'RiskBandService'] },
  { id: 'C23', name: 'Audit planning and program library', owner: 'Governance/audit planning', taskAnchor: 'T090-T093', symbols: ['AuditPlanningService', 'AuditProgramService'] },
  { id: 'C24', name: 'Fieldwork schedules, tests and area assessments', owner: 'Fieldwork procedure workspaces', taskAnchor: 'T092, T096-T106', symbols: ['AuditFieldworkService'] },
  { id: 'C25', name: 'Sampling runs, evidence and movements', owner: 'Fieldwork sampling and physical evidence', taskAnchor: 'T094-T102', keywords: ['Sampling', 'PhysicalEvidence'] },
  { id: 'C26', name: 'Review notes, reviews and completion', owner: 'Reporting review inbox and SRM', taskAnchor: 'T107-T117', symbols: ['ReviewNotesService'] },
  { id: 'C27', name: 'Confirmations and holding documents', owner: 'Fieldwork confirmations / reporting completion gates', taskAnchor: 'T111-T113', keywords: ['Confirmation'] },
  { id: 'C28', name: 'Opinions, signatures, representations and bundles', owner: 'Reporting opinions and signed deliverables', taskAnchor: 'T118-T130; MIG-013', symbols: ['AuditDeliverableService'] },
  { id: 'C29', name: 'Freeze, amendments and document locks', owner: 'Reporting records and operations', taskAnchor: 'T131-T138; MIG-014', symbols: ['FileFreezeService', 'DocumentLock'] },
  { id: 'C30', name: 'Records archive, checkpoints and release evidence', owner: 'Reporting archive and regulator export', taskAnchor: 'T132-T136; MIG-014', symbols: ['RecordsArchiveService'] },
  { id: 'C31', name: 'Practice time, budgets and rate cards', owner: 'Practice timesheets and budgets', taskAnchor: 'T139-T143', symbols: ['PracticeTimeService'] },
  { id: 'C32', name: 'Firm billing, ledger and finance queries', owner: 'Practice finance and firm books', taskAnchor: 'T066-T072, T125, T144-T148; MIG-006', symbols: ['BillingService', 'LedgerService', 'FirmFinanceQuery'] },
  { id: 'C33', name: 'Practice analytics and contract contribution', owner: 'Practice analytics', taskAnchor: 'T143, T148; MIG-015', symbols: ['PracticeAnalyticsQuery', 'ContractContributionCalculator'] },
  { id: 'C34', name: 'Technical library and published document versions', owner: 'Practice technical library', taskAnchor: 'MIG-015', symbols: ['TechnicalLibraryService'] },
  { id: 'C35', name: 'Global staff search', owner: 'Shared staff search', taskAnchor: 'MIG-015', symbols: ['GlobalSearchQuery'] },
  { id: 'C36', name: 'Operations hosts, workers and scoped operations UI', owner: 'Platform operations and job status', taskAnchor: 'T030-T041, T160; MIG-005', dirs: ['src/AuditSphereOps.Application/Operations', 'src/AuditSphereOps.Worker'] },
  { id: 'C37', name: 'API downloads, drafts, upload helpers and route guards', owner: 'Angular/API contract layer', taskAnchor: 'T022, T029, T034, T048, T157-T158; MIG-003', keywords: ['Download', 'UploadIntent', 'RouteGuard'] },
  { id: 'C38', name: 'Migrations, database checks, triggers and indexes', owner: 'Prisma migrations plus reviewed PostgreSQL SQL', taskAnchor: 'T011, T018, T025-T027, T163-T164; MIG-001, MIG-002, MIG-017', dirs: ['src/AuditSphereOps.Infrastructure/Persistence/Migrations', 'src/AuditSphereOps.Infrastructure/Persistence'] },
];

const files = await walk(path.join(sourceRoot, 'src'));
const declared = new Map(); // type name -> [file]
const fileText = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  fileText.set(rel(file), text);
  for (const match of text.matchAll(/\b(?:class|interface|record|enum|struct)\s+([A-Za-z0-9_]+)/g)) {
    const list = declared.get(match[1]) || [];
    if (!list.includes(rel(file))) list.push(rel(file));
    declared.set(match[1], list);
  }
}

const rows = [];
for (const capability of capabilityMap) {
  const resolved = {};
  const unresolved = [];
  for (const symbol of capability.symbols ?? []) {
    const found = declared.get(symbol);
    if (found) resolved[symbol] = found; else unresolved.push(symbol);
  }
  let familyFiles = [];
  for (const dir of capability.dirs ?? []) {
    const prefix = dir + '/';
    familyFiles.push(...[...fileText.keys()].filter((f) => f.startsWith(prefix)));
  }
  for (const keyword of capability.keywords ?? []) {
    for (const [file, text] of fileText) {
      if (file.includes(keyword) || new RegExp('class\\s+[A-Za-z0-9_]*' + keyword).test(text)) {
        if (!familyFiles.includes(file)) familyFiles.push(file);
      }
    }
  }
  rows.push({
    id: capability.id,
    name: capability.name,
    destinationOwner: capability.owner,
    taskAnchor: capability.taskAnchor,
    resolvedSymbols: resolved,
    unresolvedSymbols: unresolved,
    familyFiles: familyFiles.sort(),
    sourceFileCount: new Set([...Object.values(resolved).flat(), ...familyFiles]).size,
  });
}

await mkdir(outDir, { recursive: true });
const output = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/migration/capability-map.mjs',
  sourceRoot: rel(path.resolve(sourceRoot)),
  note: 'Symbol resolution is textual. Unresolved symbols are preserved so the parity matrix reports gaps instead of hiding them.',
  destinationStatus: 'See docs/migration/02-capability-parity-matrix.md; destination status is maintained separately from this source extraction.',
  rows,
};
await writeFile(path.join(outDir, 'capability-map.json'), JSON.stringify(output, null, 2) + '\n');
const unresolvedTotal = rows.reduce((sum, row) => sum + row.unresolvedSymbols.length, 0);
console.log('capabilities=' + rows.length + ' unresolvedSymbols=' + unresolvedTotal);
for (const row of rows) {
  console.log(row.id + ' files=' + row.sourceFileCount + (row.unresolvedSymbols.length ? ' unresolved=' + row.unresolvedSymbols.join(',') : ''));
}
