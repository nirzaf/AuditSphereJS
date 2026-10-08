import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const id = process.argv.slice(2).find(value => value !== '--');
const tasks = {
  T001: ['baseline'],
  T002: ['business-decisions'],
  T003: ['methodology'],
  T004: ['records-policy'],
  T006: ['build:server', 'config'],
  T007: ['lint', 'build:server', 'test:integration'],
  T008: ['build:server', 'test:integration'],
  T012: ['build:server', 'config'],
  T014: ['test:unit', 'test:integration', 'test:e2e'],
  T015: ['lint', 'typecheck', 'test'],
  T016: ['verify:all', 'contracts:check', 'audit', 'ci-workflow', 'install-policy'],
  T019: ['build:server', 'identity', 'identity-session', 'identity-map', 'identity-boundary'],
  T020: ['build:server', 'portal-auth'],
  T021: ['build:server', 'contracts:check', 'authorization', 'lifecycle', 'materiality-persistence', 'review-notes', 'adjustments', 'scope-boundary', 'team-access'],
  T022: ['build:server', 'contracts:check', 'api-contracts', 'portal-auth', 'commercial-onboarding', 'taxonomy', 'team-access'],
  T023: ['build:server', 'money-clock', 'clock-runtime'],
  T024: ['build:server', 'unit-of-work', 'commercial-onboarding', 'risk', 'taxonomy', 'adjustments'],
  T025: ['build:server', 'audit-write', 'audit-read'],
  T026: ['build:server', 'checkpoint', 'audit-chain'],
  T027: ['build:server', 'idempotency', 'idempotency-postgres', 'commercial-onboarding'],
  T028: ['build:server', 'contracts:check', 'lifecycle', 'api-contracts'],
  T029: ['build:server', 'config', 'api-security', 'identity', 'security-boundary', 'portal-auth'],
  T030: ['build:server', 'outbox-contract', 'outbox-reconciliation', 'idempotency-postgres'],
  T031: ['build:server', 'queue-runtime-unit', 'trial-balance-csv', 'queue-runtime', 'outbox-reconciliation'],
  T066: ['build:server', 'practice-ledger'],
  T067: ['build:server', 'practice-ledger'],
  T068: ['build:server', 'practice-ledger'],
  T069: ['build:server', 'contracts:check', 'commercial-onboarding', 'billing-gates', 'idempotency-postgres', 'api-contracts'],
  T063: ['build:server', 'commercial-onboarding', 'billing-gates'],
  T065: ['build:server', 'commercial-onboarding', 'billing-gates'],
  T070: ['build:server', 'commercial-onboarding', 'billing-gates'],
  T071: ['build:server', 'commercial-onboarding', 'billing-gates'],
  T072: ['build:server', 'commercial-onboarding', 'billing-gates'],
  T052: ['build:server', 'commercial-crm'],
  T053: ['build:server', 'commercial-crm'],
  T054: ['build:server', 'commercial-crm'],
  T139: ['build:server', 'contracts:check', 'practice-rates-unit', 'practice-rates', 'practice-rates-api', 'practice-ledger', 'api-contracts', 'test:web:practice-rates'],
  T144: ['build:server', 'contracts:check', 'practice-ledger', 'practice-expense-receipts', 'api-security', 'test:web:practice-expenses'],
  T145: ['build:server', 'contracts:check', 'practice-trial-balance', 'test:web:practice-trial-balance'],
  T146: ['build:server', 'contracts:check', 'practice-profit-loss', 'test:web:practice-profit-loss', 'test:web:module-workspace'],
  T032: ['build:server', 'contracts:check', 'storage', 'scope-repository', 'document-version'],
  T033: ['build:server', 'contracts:check', 'multipart-plugin', 'clamav-unit', 'clamav-real', 'pdf-inspection', 'document-upload'],
  T034: ['build:server', 'document-download'],
  T035: ['build:server', 'pdf-renderer', 'document-version', 'pdf-seccomp', 'build:linux', 'pdf-render-runtime'],
  T036: ['build:server', 'contracts:check', 'document-template-compiler', 'document-templates', 'pdf-renderer', 'test:web:document-templates'],
  T037: ['build:server', 'contracts:check', 'notifications'],
  T038: ['build:server', 'contracts:check', 'realtime-unit', 'realtime', 'portal-auth', 'test:web:realtime', 'boundaries', 'ci-workflow'],
  T039: ['build:server', 'contracts:check', 'leases-unit', 'edit-leases', 'realtime', 'test:web:leases', 'boundaries', 'ci-workflow'],
  T040: ['build:server', 'contracts:check', 'scheduler-unit', 'scheduler', 'scheduler-role-provisioner', 'outbox-reconciliation', 'boundaries', 'ci-workflow'],
  T041: ['build:server', 'contracts:check', 'config', 'observability-unit', 'api-security', 'api-shell', 'outbox-contract', 'scheduler-unit', 'storage', 'outbox-reconciliation', 'rustfs-isolation', 'boundaries'],
  T042: ['build:server', 'tb-fixture-files', 'tb-fixtures', 'tb-fixture-scope'],
  T017: ['verify:all', 'build:linux', 'smoke:linux'],
  T013: ['database-version', 'local-services', 'rustfs-isolation'],
  T018: ['build:server', 'scope-jobs', 'scope-database', 'scope-repository', 'scope-authorization', 'scope-boundary'],
  T009: ['typecheck', 'api-shell', 'config'],
  T044: ['build:server', 'trial-balance-csv', 'trial-balance-staging', 'trial-balance-validation'],
  T049: ['build:server', 'tb-batch-mapping'],
  T045: ['build:server', 'trial-balance-csv', 'trial-balance-workbook', 'trial-balance-staging', 'trial-balance-validation', 'trial-balance-workbook-import'],
  T043: ['build:server', 'contracts:check', 'trial-balance-csv', 'api-contracts', 'trial-balance-staging'],
  T156: ['storage', 'm365-storage-live'],
  T149: ['build:server', 'm365-policy', 'config'],
  T150: ['typecheck', 'dependencies:check', 'identity', 'storage', 'config', 'test:web:identity'],
  T151: ['build:server', 'identity', 'identity-session', 'identity-map', 'identity-boundary', 'authorization', 'test:web:identity'],
  T152: ['m365-policy'],
  T153: ['m365-policy'],
  T154: ['m365-policy'],
  T155: ['m365-policy'],
};
if (!tasks[id]) throw new Error(`Task ${id || '(missing)'} has no recorded verification recipe. It cannot be verified.`);
for (const step of tasks[id]) {
  if (step === 'baseline') {
    const bytes = readFileSync('docs/requirements/CURRENT.md');
    if (!bytes.equals(readFileSync('docs/sources/requirements-current.md'))) throw new Error('Baseline differs from supplied requirements');
    const record = JSON.parse(readFileSync('docs/evidence/T001/baseline.json'));
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256 || record.coverageIds.length !== 82) throw new Error('Baseline evidence mismatch');
    continue;
  }
  if (step === 'ci-workflow' || step === 'install-policy') {
    const script = step === 'ci-workflow' ? 'verify-ci-workflow.mjs' : 'verify-pnpm-install-policy.mjs';
    const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'scheduler-role-provisioner') {
    const result = spawnSync(process.execPath, [
      'node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2023',
      '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'packages/server/scripts/provision-local-roles.ts',
    ], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'pdf-seccomp') {
    const result = spawnSync(process.execPath, ['scripts/verify-chromium-seccomp.mjs'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'tb-fixture-files') {
    const result = spawnSync(process.execPath, ['scripts/generate-tb-fixtures.mjs', '--check'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'tb-fixture-scope') {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/tb-fixtures.integration.ts'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'pdf-render-runtime') {
    const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m', '--tmpfs', '/home/node/.cache:rw,nosuid,nodev,size=32m', '--pids-limit=128', '--memory=1g', '--cpus=1', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--security-opt', 'seccomp=config/seccomp-chromium.json', 'auditsphere-local:compatibility', 'node', 'scripts/pdf-render-smoke.mjs'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'methodology') {
    const result = spawnSync(process.execPath, ['scripts/verify-methodology.mjs'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'records-policy') {
    const result = spawnSync(process.execPath, ['scripts/verify-records-policy.mjs'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'business-decisions') {
    const result = spawnSync(process.execPath, ['scripts/verify-business-decisions.mjs'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  if (step === 'm365-storage-live') {
    const executable = process.env.npm_execpath;
    if (!executable) throw new Error('Run task verification through pnpm verify:task');
    const javascript = /\.(?:c?js|mjs)$/i.test(executable);
    const result = spawnSync(javascript ? process.execPath : executable, javascript ? [executable, 'test:m365:storage:live'] : ['test:m365:storage:live'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  const filters = { config: 'tests/config.test.ts', 'm365-policy': 'tests/m365-policy.test.ts', 'api-security': 'tests/security-hardening.test.ts', 'api-shell': 'apps/api/tests/shell.test.ts', storage: 'tests/graph-storage.test.ts', 'observability-unit': 'packages/server/tests/observability.test.ts', identity: 'packages/server/tests/entra.test.ts', 'money-clock': 'tests/money-clock.test.ts', checkpoint: 'tests/audit-checkpoint.test.ts', idempotency: 'packages/server/tests/idempotency.test.ts', 'outbox-contract': 'packages/server/tests/outbox.test.ts', 'scheduler-unit': 'packages/server/tests/scheduler.test.ts', 'scope-jobs': 'packages/server/tests/import-job.test.ts', 'trial-balance-csv': 'packages/server/tests/parser.test.ts', 'tb-fixtures': 'tests/tb-fixtures.test.mjs', 'practice-rates-unit': 'packages/server/tests/practice-rates.test.ts', 'clamav-unit': 'packages/server/tests/clamav.test.ts', 'queue-runtime-unit': 'packages/server/tests/queue-runtime.test.ts', 'document-template-compiler': 'packages/server/tests/document-template-compiler.test.ts', 'realtime-unit': 'packages/server/tests/realtime.test.ts', 'leases-unit': 'packages/server/tests/leases.test.ts', 'trial-balance-workbook': 'packages/server/tests/workbook.test.ts' };
  const path = filters[step];
  const integration = { 'api-contracts': 'apps/api/tests/contracts.integration.ts', 'trial-balance-staging': 'tests/tb-staging.integration.ts', 'trial-balance-validation': 'tests/tb-validation-progress.integration.ts', 'trial-balance-workbook-import': 'tests/xlsx-import.integration.ts', 'tb-batch-mapping': 'tests/tb-batch-mapping.integration.ts', 'multipart-plugin': 'apps/api/tests/multipart-plugin.integration.ts', 'clamav-real': 'tests/clamav.integration.ts', 'pdf-inspection': 'packages/server/tests/pdf-inspection.integration.ts', 'pdf-renderer': 'packages/server/tests/pdf-renderer.integration.ts', 'document-templates': 'tests/document-templates.integration.ts', 'document-upload': 'apps/api/tests/document-upload.integration.ts', 'document-download': 'apps/api/tests/document-download.integration.ts', 'clock-runtime': 'tests/foundation.integration.ts', 'database-version': 'tests/database.integration.ts', 'local-services': 'tests/local-services.integration.ts', 'rustfs-isolation': 'packages/server/tests/rustfs-isolation.integration.ts', 'unit-of-work': 'tests/unit-of-work.integration.ts', 'audit-chain': 'tests/audit-chain.integration.ts', 'audit-write': 'tests/audit-write.integration.ts', 'audit-read': 'apps/api/tests/audit-read.integration.ts', 'idempotency-postgres': 'tests/idempotency.integration.ts', 'outbox-reconciliation': 'tests/outbox.integration.ts', scheduler: 'tests/scheduler.integration.ts', 'queue-runtime': 'tests/queue-runtime.integration.ts', 'edit-leases': 'apps/api/tests/edit-leases.integration.ts', notifications: 'tests/notifications.integration.ts', realtime: 'apps/api/tests/realtime.integration.ts', authorization: 'tests/authorization.integration.ts', 'commercial-onboarding': 'tests/commercial-onboarding.integration.ts', 'billing-gates': 'tests/billing-gates.integration.ts', 'commercial-crm': 'tests/commercial-crm.integration.ts', risk: 'tests/risk.integration.ts', lifecycle: 'tests/lifecycle.integration.ts', 'materiality-persistence': 'tests/materiality-persistence.integration.ts', 'review-notes': 'tests/review-notes.integration.ts', adjustments: 'tests/adjustments.integration.ts', 'practice-ledger': 'tests/practice-ledger.integration.ts', 'practice-expense-receipts': 'tests/practice-expense-receipts.integration.ts', 'practice-trial-balance': 'tests/practice-trial-balance.integration.ts', 'practice-profit-loss': 'tests/practice-profit-loss.integration.ts', 'practice-rates': 'tests/practice-rates.integration.ts', 'practice-rates-api': 'apps/api/tests/practice-rates-api.integration.ts', taxonomy: 'tests/taxonomy.integration.ts', 'scope-database': 'tests/database.integration.ts', 'scope-repository': 'tests/repository.integration.ts', 'document-version': 'tests/document-version.integration.ts', 'scope-authorization': 'tests/authorization.integration.ts', 'scope-boundary': 'apps/api/tests/auth-boundary.integration.ts', 'identity-boundary': 'apps/api/tests/auth-boundary.integration.ts', 'identity-session': 'packages/server/tests/session-revocation.integration.ts', 'identity-map': 'tests/identity-mapping.integration.ts', 'portal-auth': 'apps/api/tests/portal-auth.integration.ts', 'security-boundary': 'apps/api/tests/security-hardening.integration.ts', 'team-access': 'tests/staff-access.integration.ts' }[step];
  if (integration && !existsSync(integration)) throw new Error(`Missing intended test: ${integration}`);
  if (path && !existsSync(path)) throw new Error(`Missing intended test: ${path}`);
  const args = integration ? ['exec', 'node', '--import', 'tsx', '--test', integration] : path ? ['exec', 'vitest', 'run', path] : [step];
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error('Run task verification through pnpm verify:task');
  const javascript = /\.(?:c?js|mjs)$/i.test(executable);
  const result = spawnSync(javascript ? process.execPath : executable, javascript ? [executable, ...args] : args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${id}: recorded checks passed; acceptance review and live-provider evidence are separate.`);
