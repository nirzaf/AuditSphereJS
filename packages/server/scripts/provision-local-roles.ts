import 'dotenv/config';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const administrativeUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!;
const url = new URL(administrativeUrl);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/auditsphere') throw new Error('This provisioner is restricted to the named local development database');
const client = new Client({ connectionString: administrativeUrl }); await client.connect();
const settings: Record<string, string> = { MIGRATION_DATABASE_URL: administrativeUrl };
try {
  for (const [role, variable] of [['auditsphere_api', 'DATABASE_URL'], ['auditsphere_worker', 'WORKER_DATABASE_URL'], ['auditsphere_report', 'REPORT_DATABASE_URL']] as const) {
    const existing = process.env[variable];
    const password = existing && new URL(existing).username === role ? new URL(existing).password : randomBytes(32).toString('hex');
    const found = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!found.rowCount) await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password.replaceAll("'", "''")}'`);
    else await client.query(`ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password.replaceAll("'", "''")}'`);
    await client.query(`GRANT CONNECT ON DATABASE auditsphere TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    const connection = new URL(administrativeUrl); connection.username = role; connection.password = password; settings[variable] = connection.toString();
  }
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON "User", "Membership", "Engagement", "Document", "TbImport", "TbRow", "OutboxEvent", "CommandReceipt" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "AuditEvent" TO auditsphere_api');
  await client.query('GRANT SELECT ON "Document", "TbImport", "TbRow", "OutboxEvent" TO auditsphere_worker');
  await client.query('GRANT UPDATE ON "TbImport", "OutboxEvent" TO auditsphere_worker');
  await client.query('GRANT INSERT, UPDATE, DELETE ON "TbRow" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "Engagement", "TbImport", "TbRow" TO auditsphere_report');
  let environment = readFileSync('.env', 'utf8');
  for (const [key, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    environment = pattern.test(environment) ? environment.replace(pattern, () => `${key}=${value}`) : `${environment.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync('.env', environment);
  console.log('Local API, worker and read-only report roles provisioned. Credentials saved only in ignored .env.');
} finally { await client.end(); }
