import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const id = process.argv.slice(2).find(value => value !== '--');
const tasks = {
  T001: ['baseline'],
  T007: ['lint', 'build:server', 'test:integration'],
  T008: ['build:server', 'test:integration'],
  T012: ['build:server', 'config'],
  T014: ['test:unit', 'test:integration', 'test:e2e'],
  T015: ['lint', 'typecheck', 'test'],
  T016: ['verify:all', 'contracts:check', 'audit', 'ci-workflow', 'install-policy'],
  T019: ['build:server', 'identity', 'identity-session', 'identity-boundary'],
  T023: ['build:server', 'money-clock'],
  T024: ['build:server', 'unit-of-work'],
  T026: ['build:server', 'checkpoint', 'audit-chain'],
  T066: ['build:server', 'practice-ledger'],
  T067: ['build:server', 'practice-ledger'],
  T068: ['build:server', 'practice-ledger'],
  T032: ['build:server', 'storage'],
  T017: ['verify:all', 'build:linux', 'smoke:linux'],
  T018: ['build:server', 'scope-jobs', 'scope-database', 'scope-repository', 'scope-authorization', 'scope-boundary'],
  T156: ['m365-storage-live'],
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
  if (step === 'm365-storage-live') {
    const executable = process.env.npm_execpath;
    if (!executable) throw new Error('Run task verification through pnpm verify:task');
    const javascript = /\.(?:c?js|mjs)$/i.test(executable);
    const result = spawnSync(javascript ? process.execPath : executable, javascript ? [executable, 'test:m365:storage:live'] : ['test:m365:storage:live'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    continue;
  }
  const filters = { config: 'tests/config.test.ts', storage: 'tests/graph-storage.test.ts', identity: 'packages/server/tests/entra.test.ts', 'money-clock': 'tests/money-clock.test.ts', checkpoint: 'tests/audit-checkpoint.test.ts', 'scope-jobs': 'packages/server/tests/import-job.test.ts' };
  const path = filters[step];
  const integration = { 'unit-of-work': 'tests/unit-of-work.integration.ts', 'audit-chain': 'tests/audit-chain.integration.ts', 'practice-ledger': 'tests/practice-ledger.integration.ts', 'scope-database': 'tests/database.integration.ts', 'scope-repository': 'tests/repository.integration.ts', 'scope-authorization': 'tests/authorization.integration.ts', 'scope-boundary': 'apps/api/tests/auth-boundary.integration.ts', 'identity-boundary': 'apps/api/tests/auth-boundary.integration.ts', 'identity-session': 'packages/server/tests/session-revocation.integration.ts' }[step];
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
