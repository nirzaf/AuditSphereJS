import 'dotenv/config';
import { Client } from 'pg';
import { strict as assert } from 'node:assert';
for (const key of ['DATABASE_URL', 'WORKER_DATABASE_URL', 'REPORT_DATABASE_URL']) {
  const client = new Client({ connectionString: process.env[key] }); await client.connect();
  try {
    await client.query('BEGIN');
    await assert.rejects(client.query('CREATE TABLE public.compatibility_forbidden_ddl (id int)'), (error: any) => error.code === '42501');
    await client.query('ROLLBACK');
    const role = await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user');
    assert.deepEqual(role.rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
    if (key === 'REPORT_DATABASE_URL') {
      await client.query('BEGIN');
      await assert.rejects(client.query('UPDATE "TbRow" SET version=version WHERE false'), (error: any) => error.code === '42501');
      await client.query('ROLLBACK');
    }
    if (key === 'DATABASE_URL') {
      await client.query('BEGIN');
      await assert.rejects(client.query('DELETE FROM "AuditEvent" WHERE false'), (error: any) => error.code === '42501');
      await client.query('ROLLBACK');
    }
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
console.log('Runtime DDL denied; reporting writes and API audit deletion denied by PostgreSQL grants');
