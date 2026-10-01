import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) { console.log('Existing .env preserved.'); process.exit(0); }
const databasePassword = randomBytes(32).toString('hex');
const storagePassword = randomBytes(32).toString('hex');
let template = readFileSync('.env.example', 'utf8');
const values = { DATABASE_URL: `postgresql://auditsphere:${databasePassword}@127.0.0.1:5432/auditsphere`, MIGRATION_DATABASE_URL: `postgresql://auditsphere:${databasePassword}@127.0.0.1:5432/auditsphere`, POSTGRES_PASSWORD: databasePassword, S3_SECRET_KEY: storagePassword, DEV_AUTH_TOKEN: randomBytes(32).toString('hex') };
for (const [key, value] of Object.entries(values)) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  template = expression.test(template) ? template.replace(expression, () => `${key}=${value}`) : `${template.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync('.env', template, { flag: 'wx' });
console.log('Generated local credentials in ignored .env. No credentials printed.');
