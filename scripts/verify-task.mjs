import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const id = process.argv.slice(2).find(value => value !== '--');
const tasks = {
  T001: ['baseline'],
  T008: ['build:server', 'test:integration'],
  T012: ['build:server', 'config'],
  T015: ['lint', 'typecheck', 'test'],
  T019: ['build:server', 'identity'],
  T032: ['build:server', 'storage'],
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
  const filters = { config: 'tests/config.test.ts', storage: 'tests/graph-storage.test.ts', identity: 'packages/server/tests/entra.test.ts' };
  const path = filters[step];
  if (path && !existsSync(path)) throw new Error(`Missing intended test: ${path}`);
  const args = path ? ['exec', 'vitest', 'run', path] : [step];
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${id}: recorded checks passed; acceptance review and live-provider evidence are separate.`);
