import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  const existing = readFileSync('.env', 'utf8');
  const metricsToken = /^OBSERVABILITY_METRICS_TOKEN=(.*)$/m.exec(existing)?.[1]?.trim();
  if (!metricsToken || metricsToken.startsWith('replace-')) {
    const line = `OBSERVABILITY_METRICS_TOKEN=${randomBytes(32).toString('hex')}`;
    if (/^OBSERVABILITY_METRICS_TOKEN=.*$/m.test(existing)) {
      const current = readFileSync('.env', 'utf8');
      writeFileSync('.env', current.replace(/^OBSERVABILITY_METRICS_TOKEN=.*$/m, () => line));
    } else appendFileSync('.env', `${existing.endsWith('\n') ? '' : '\n'}${line}\n`);
  }
  if (!/^OBSERVABILITY_METRICS_HOST=/m.test(existing)) appendFileSync('.env', 'OBSERVABILITY_METRICS_HOST=127.0.0.1\n');
  if (!/^OBSERVABILITY_METRICS_PORT=/m.test(existing)) appendFileSync('.env', 'OBSERVABILITY_METRICS_PORT=9101\n');
  console.log('Existing .env preserved; missing observability settings were added if needed.');
  process.exit(0);
}
const databasePassword = randomBytes(32).toString('hex');
const storagePassword = randomBytes(32).toString('hex');
let template = readFileSync('.env.example', 'utf8');
const values = { DATABASE_URL: `postgresql://auditsphere:${databasePassword}@127.0.0.1:5432/auditsphere`, MIGRATION_DATABASE_URL: `postgresql://auditsphere:${databasePassword}@127.0.0.1:5432/auditsphere`, POSTGRES_PASSWORD: databasePassword, S3_SECRET_KEY: storagePassword, DEV_AUTH_TOKEN: randomBytes(32).toString('hex'), OBSERVABILITY_METRICS_TOKEN: randomBytes(32).toString('hex') };
for (const [key, value] of Object.entries(values)) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  template = expression.test(template) ? template.replace(expression, () => `${key}=${value}`) : `${template.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync('.env', template, { flag: 'wx' });
console.log('Generated local credentials in ignored .env. No credentials printed.');
