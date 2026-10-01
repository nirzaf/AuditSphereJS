import { parse } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sourceFingerprint } from './source-fingerprint.mjs';
const identity = spawnSync('docker', ['image', 'inspect', 'auditsphere-local:compatibility', '--format', '{{index .Config.Labels "org.auditsphere.source"}}'], { encoding: 'utf8' });
if (identity.status !== 0 || identity.stdout.trim() !== sourceFingerprint()) throw new Error('Linux image differs from current source: run pnpm build:linux first');
const local = parse(readFileSync('.env'));
const database = new URL(local.DATABASE_URL);
const redis = new URL(local.REDIS_URL);
if (![database, redis].every(url => ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Linux compatibility smoke requires local fixtures');
const networkArgs = process.platform === 'linux' ? ['--network', 'host'] : [];
if (process.platform !== 'linux') {
  database.hostname = 'host.docker.internal'; redis.hostname = 'host.docker.internal';
}
mkdirSync('tmp', { recursive: true }); mkdirSync('docs/evidence/T017', { recursive: true });
const path = resolve(`tmp/compatibility-${randomUUID()}.env`);
writeFileSync(path, `NODE_ENV=test\nDATABASE_URL=${database}\nREDIS_URL=${redis}\n`, { flag: 'wx' });
try {
  const result = spawnSync('docker', ['run', '--rm', ...networkArgs, '--env-file', path, '--mount', `type=bind,source=${resolve('scripts/compatibility-smoke.mjs')},target=/app/scripts/compatibility-smoke.mjs,readonly`, 'auditsphere-local:compatibility', 'node', 'scripts/compatibility-smoke.mjs'], { encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) { console.error(result.stderr); process.exitCode = result.status || 1; }
  else { JSON.parse(result.stdout); writeFileSync('docs/evidence/T017/linux-smoke.json', result.stdout); console.log(result.stdout); }
} finally { unlinkSync(path); }
