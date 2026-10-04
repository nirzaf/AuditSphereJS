import 'dotenv/config';
import { strict as assert } from 'node:assert';

const base = 'http://127.0.0.1:3000/api/v1/engagements/00000000-0000-4000-8000-000000000002/imports';
const headers = { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}`, 'Content-Type': 'application/json' };

async function main() {
  const csv = `code,name,current,prior\n1,Lease fixture ${crypto.randomUUID()},0,0`;
  const uploaded = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ filename: 'lease-fixture.csv', csv }) });
  assert.equal(uploaded.status, 201);
  const batch = await uploaded.json() as { id: string };

  let row: { id: string } | undefined;
  const deadline = Date.now() + 30_000;
  while (!row && Date.now() < deadline) {
    const response = await fetch(`${base}/${batch.id}/rows?offset=0&limit=1`, { headers });
    if (response.ok) row = (await response.json() as { rows: { id: string }[] }).rows[0];
    if (!row) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(row, 'worker should finish parsing before row editing');
  const leaseUrl = `${base}/${batch.id}/rows/${row.id}/lease`;
  const invoke = async (body: unknown, expected: number) => {
    const response = await fetch(leaseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value as { available: boolean; lease?: { leaseToken?: string; expiresAt: string; ownedByCurrentUser: boolean } };
  };
  const first = await invoke({ action: 'acquire' }, 201);
  assert.equal(first.available, true);
  assert.ok(first.lease?.leaseToken);
  assert.ok(Date.parse(first.lease.expiresAt) > Date.now());
  const status = await fetch(leaseUrl, { headers });
  assert.equal(status.status, 200);
  assert.equal((await status.json() as { lease: { ownedByCurrentUser: boolean } }).lease.ownedByCurrentUser, true);
  await invoke({ action: 'renew', token: crypto.randomUUID() }, 409);
  await invoke({ action: 'renew', token: first.lease!.leaseToken }, 201);
  await invoke({ action: 'release', token: first.lease!.leaseToken }, 201);
  const replacement = await invoke({ action: 'acquire' }, 201);
  assert.notEqual(replacement.lease?.leaseToken, first.lease?.leaseToken);
  await invoke({ action: 'release', token: first.lease!.leaseToken }, 409);
  await invoke({ action: 'release', token: replacement.lease!.leaseToken }, 201);
  console.log('Scoped row edit lease acquisition, expiry, renewal and owner-safe release verification passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
