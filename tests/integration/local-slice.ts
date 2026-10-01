import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { db } from '@auditsphere/server';
const engagement = '00000000-0000-4000-8000-000000000002';
const base = `http://127.0.0.1:3000/api/v1/engagements/${engagement}/imports`;
async function request(path: string, method = 'GET', body?: unknown, expected = 200) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result)); return result;
}
async function main() {
  const unauth = await fetch(base); assert.equal(unauth.status, 401);
  const otherScope = await fetch(base.replace(engagement, '00000000-0000-4000-8000-000000000099'), { headers: { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}` } }); assert.equal(otherScope.status, 403);
  const metrics: any[] = [];
  for (const count of [5000, 25000, 50000]) {
    const nonce = crypto.randomUUID();
    const csv = 'code,name,current,prior\n' + Array.from({ length: count }, (_, i) => `${i},Account ${nonce} ${i},${i % 2 ? '-1.00' : '1.00'},0.00`).join('\n');
    const start = performance.now(); const batch = await request('', 'POST', { filename: `fixture-${count}.csv`, csv }, 201);
    const uploadMs = Math.round(performance.now() - start);
    let status: any;
    for (let attempt = 0; attempt < 240; attempt++) {
      status = await request('/' + batch.id);
      if (status.status === 'MAPPING_REQUIRED') break;
      assert.notEqual(status.status, 'FAILED', status.error);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(status.status, 'MAPPING_REQUIRED'); assert.equal(status.rowCount, count);
    const stagedMs = Math.round(performance.now() - start);
    const duplicate = await request('', 'POST', { filename: 'same.csv', csv }, 201); assert.equal(duplicate.id, batch.id);
    const first = await request(`/${batch.id}/rows`); assert.equal(first.total, count);
    const lease = await request(`/${batch.id}/lease`, 'POST', { action: 'acquire' }, 201);
    await request(`/${batch.id}/lease`, 'POST', { action: 'acquire' }, 409);
    await request(`/${batch.id}/lease`, 'POST', { action: 'renew', token: crypto.randomUUID() }, 409);
    await request(`/${batch.id}/lease`, 'POST', { action: 'renew', token: lease.leaseToken }, 201);
    await request(`/${batch.id}/lease`, 'POST', { action: 'release', token: lease.leaseToken }, 201);
    const key = crypto.randomUUID();
    const mapping = { idempotencyKey: key, changes: [{ rowId: first.rows[0].id, expectedVersion: first.rows[0].version, fsli: 'Cash and equivalents' }] };
    await request(`/${batch.id}/mappings`, 'PATCH', mapping); await request(`/${batch.id}/mappings`, 'PATCH', mapping);
    await request(`/${batch.id}/mappings`, 'PATCH', { ...mapping, idempotencyKey: crypto.randomUUID() }, 409);
    // A stale second row must roll back an earlier valid row in the same batch.
    await request(`/${batch.id}/mappings`, 'PATCH', { idempotencyKey: crypto.randomUUID(), changes: [{ rowId: first.rows[1].id, expectedVersion: 1, fsli: 'Cash and equivalents' }, { rowId: first.rows[0].id, expectedVersion: 1, fsli: 'Cash and equivalents' }] }, 409);
    const after = await request(`/${batch.id}/rows`); assert.equal(after.rows[1].version, 1); assert.equal(after.rows[1].fsli, null);
    const mappingStart = performance.now();
    for (let offset = 0; offset < count; offset += 200) {
      const page = await request(`/${batch.id}/rows?offset=${offset}`);
      await request(`/${batch.id}/mappings`, 'PATCH', { idempotencyKey: crypto.randomUUID(), changes: page.rows.map((row: any) => ({ rowId: row.id, expectedVersion: row.version, fsli: 'Cash and equivalents' })) });
    }
    const mappedMs = Math.round(performance.now() - mappingStart);
    status = await request('/' + batch.id);
    const finalStart = performance.now(); await request(`/${batch.id}/finalize`, 'POST', { expectedVersion: status.version }, 201);
    const finalizeMs = Math.round(performance.now() - finalStart);
    await request(`/${batch.id}/mappings`, 'PATCH', { ...mapping, idempotencyKey: crypto.randomUUID() }, 409);
    const summary = await request(`/${batch.id}/summary`); assert.equal(summary[0].current, '0.00'); assert.equal(summary[0].count, count);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { engagementId: engagement, action: 'TB_FINALIZED' } });
    await assert.rejects(db.auditEvent.delete({ where: { id: audit.id } }), /append-only/);
    await assert.rejects(db.tbRow.update({ where: { id: first.rows[0].id }, data: { fsli: 'Equity' } }), /immutable/);
    metrics.push({ rows: count, uploadMs, stagedMs, mappedMs, finalizeMs }); console.log(JSON.stringify(metrics.at(-1)));
  }
  writeFileSync('docs/benchmarks-local.json', JSON.stringify({ date: '2026-10-01', environment: 'Windows local Docker; HTTP API + outbox + Redis worker + RustFS + PostgreSQL', metrics }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
