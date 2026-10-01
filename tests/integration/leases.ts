import 'dotenv/config';
import { strict as assert } from 'node:assert';
const base = 'http://127.0.0.1:3000/api/v1/engagements/00000000-0000-4000-8000-000000000002/imports';
const headers = { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}`, 'Content-Type': 'application/json' };
async function main() {
  const csv = `code,name,current,prior\n1,Lease fixture ${crypto.randomUUID()},0,0`;
  const uploaded = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ filename: 'lease-fixture.csv', csv }) });
  assert.equal(uploaded.status, 201);
  const batch = await uploaded.json();
  const invoke = async (body: unknown, expected: number) => { const res = await fetch(`${base}/${batch.id}/lease`, { method: 'POST', headers, body: JSON.stringify(body) }); const value = await res.json(); assert.equal(res.status, expected, JSON.stringify(value)); return value; };
  const first = await invoke({ action: 'acquire' }, 201);
  await invoke({ action: 'acquire' }, 409);
  await invoke({ action: 'renew', token: crypto.randomUUID() }, 409);
  await invoke({ action: 'renew', token: first.leaseToken }, 201);
  await invoke({ action: 'release', token: first.leaseToken }, 201);
  const second = await invoke({ action: 'acquire' }, 201);
  assert.ok(second.fencingNumber > first.fencingNumber);
  await invoke({ action: 'release', token: first.leaseToken }, 409);
  await invoke({ action: 'release', token: second.leaseToken }, 201);
  console.log('Redis lease acquisition, fencing and ownership verification passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
