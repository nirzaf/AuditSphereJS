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
  // Grants are explicit per table on purpose: a new table is inaccessible until this list is
  // deliberately extended, so least privilege is not silently widened by a migration.
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON "Firm", "Client", "User", "Membership", "Engagement", "Document", "TbImport", "TbRow", "OutboxEvent", "CommandReceipt" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "AuditEvent", "EngagementTransition" TO auditsphere_api');
  // API commands create durable operation intent in the same business transaction; workers
  // claim and transition it. Neither role can delete operation history.
  await client.query('GRANT SELECT, INSERT ON "background_operations" TO auditsphere_api');
  await client.query('GRANT SELECT, UPDATE ON "background_operations" TO auditsphere_worker');
  await client.query('GRANT SELECT, INSERT ON "IdentitySessionRevocation" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "SecurityEvent" TO auditsphere_api, auditsphere_worker');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "CommercialProposal" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "RiskClearance", "EngagementLetterRecord", "EngagementInvoice", "InvoicePayment", "InvoiceReceipt" TO auditsphere_api');
  await client.query('GRANT SELECT ON "CommercialProposal", "RiskClearance", "EngagementLetterRecord", "EngagementInvoice" TO auditsphere_report, auditsphere_worker');
  await client.query('GRANT SELECT ON "EngagementTransition" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "RoleGrant" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "PracticeAccount", "PracticePeriod", "PracticeJournal", "PracticeJournalLine" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "PracticeRateCard", "PracticeStaffGradeAssignment" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "PracticeTimeEntry" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "FirmPostingPolicy" TO auditsphere_api');
  await client.query('GRANT SELECT ON "FirmPostingPolicy" TO auditsphere_report');
  await client.query('GRANT SELECT ON "PracticeAccount", "PracticePeriod", "PracticeJournal", "PracticeJournalLine" TO auditsphere_report');
  await client.query('GRANT SELECT ON "AuditChainHead", "AuditChainRecord", "AuditEvent" TO auditsphere_api, auditsphere_worker, auditsphere_report');
  await client.query('GRANT SELECT ON "RoleGrant" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT ON "BalancePublication", "PublishedBalanceRow" TO auditsphere_api');
  await client.query('GRANT SELECT ON "BalancePublication", "PublishedBalanceRow" TO auditsphere_report');
  await client.query('GRANT SELECT ON "BalancePublication", "PublishedBalanceRow" TO auditsphere_worker');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "ClientRepository" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "DocumentVersion" TO auditsphere_api');
  await client.query('GRANT SELECT ON "ClientRepository", "DocumentVersion" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "ClientRepository", "DocumentVersion" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "TaxonomyVersion", "TaxonomyLine" TO auditsphere_api');
  await client.query('GRANT SELECT, INSERT ON "MappingApproval" TO auditsphere_api');
  await client.query('GRANT SELECT ON "TaxonomyVersion", "TaxonomyLine", "MappingApproval" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "TaxonomyVersion", "TaxonomyLine", "MappingApproval" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "MaterialityAssessment" TO auditsphere_api');
  await client.query('GRANT SELECT ON "MaterialityAssessment" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "MaterialityAssessment" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT ON "RiskItem", "RiskBandAssessment", "RiskPartnerClearance", "RiskOwnerAssignment" TO auditsphere_api');
  await client.query('GRANT SELECT ON "RiskItem", "RiskBandAssessment", "RiskPartnerClearance", "RiskOwnerAssignment" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "RiskItem", "RiskBandAssessment", "RiskPartnerClearance", "RiskOwnerAssignment" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "StoredObject" TO auditsphere_api');
  await client.query('GRANT SELECT, UPDATE ON "StoredObject" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "StoredObject" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "MappingMemoryEntry" TO auditsphere_api');
  await client.query('GRANT SELECT ON "MappingMemoryEntry" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "MappingMemoryEntry" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "ReviewNote" TO auditsphere_api');
  await client.query('GRANT SELECT ON "ReviewNote" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "ReviewNote" TO auditsphere_report');
  await client.query('GRANT SELECT, INSERT, UPDATE ON "AdjustmentJournal", "AdjustmentJournalLine" TO auditsphere_api');
  await client.query('GRANT SELECT ON "AdjustmentJournal", "AdjustmentJournalLine" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "AdjustmentJournal", "AdjustmentJournalLine" TO auditsphere_report');
  await client.query('GRANT SELECT ON "Firm", "Client", "Document", "TbImport", "TbRow", "OutboxEvent" TO auditsphere_worker');
  await client.query('GRANT UPDATE ON "TbImport", "OutboxEvent" TO auditsphere_worker');
  await client.query('GRANT INSERT, UPDATE, DELETE ON "TbRow" TO auditsphere_worker');
  await client.query('GRANT SELECT ON "Firm", "Client", "Engagement", "TbImport", "TbRow" TO auditsphere_report');
  let environment = readFileSync('.env', 'utf8');
  for (const [key, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    environment = pattern.test(environment) ? environment.replace(pattern, () => `${key}=${value}`) : `${environment.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync('.env', environment);
  console.log('Local API, worker and read-only report roles provisioned. Credentials saved only in ignored .env.');
} finally { await client.end(); }
