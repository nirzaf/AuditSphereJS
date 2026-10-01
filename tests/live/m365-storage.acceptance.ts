import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { config } from 'dotenv';
import { configuredGraphStorage, decodeGraphReference } from '../../packages/server/src/platform/graph-storage.js';

// Explicit opt-in only. No admin-browser session tokens are read or reused.
const privateFile = process.env.M365_ACCEPTANCE_ENV_FILE;
if (privateFile) {
  const loaded = config({ path: privateFile, quiet: true });
  if (loaded.error) throw new Error('Cannot read the designated private acceptance environment');
}
assert.equal(process.env.M365_ACCEPTANCE_NONPRODUCTION, '1', 'Set M365_ACCEPTANCE_NONPRODUCTION=1 only for explicitly designated test repositories');
const storage = configuredGraphStorage();
const runId = randomUUID();
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function acceptanceAccessToken() {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.M365_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({ client_id: process.env.M365_CLIENT_ID!, client_secret: process.env.M365_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  assert.equal(response.status, 200, 'Acceptance authentication failed');
  const result = await response.json() as { access_token: string };
  assert.ok(result.access_token);
  return result.access_token;
}

for (const purpose of ['SHAREPOINT', 'ONEDRIVE'] as const) {
  const driveId = process.env[`M365_ACCEPTANCE_${purpose}_DRIVE_ID`];
  const folderId = process.env[`M365_ACCEPTANCE_${purpose}_FOLDER_ID`];
  assert.ok(driveId && folderId, `Configure the designated ${purpose} acceptance drive and folder`);
  const repository = { driveId, folderId };
  test(`live ${purpose}: version roundtrip, external edit and selected-folder denial`, async () => {
    const bytes = Buffer.from(`AuditSphereJS synthetic acceptance fixture\nRun ${runId}\nStorage ${purpose}\nNo client or personal data.\n`);
    const reference = await storage.put(repository, `auditspherejs-acceptance-${runId}.txt`, bytes);
    const identity = decodeGraphReference(reference);
    const downloaded = await storage.get(repository, reference);
    assert.deepEqual(downloaded, bytes);
    assert.equal(identity.sha256, sha256(bytes));
    assert.equal(identity.sizeBytes, bytes.length);
    assert.ok(identity.versionId);
    // A separate provider write simulates an external, same-size current edit.
    // Only our newly created synthetic file is changed; the accepted v1 remains.
    const token = await acceptanceAccessToken();
    const changedBytes = Buffer.from(bytes);
    changedBytes[0] = 'X'.charCodeAt(0);
    const changed = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(identity.itemId)}/content`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: changedBytes, redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    assert.equal(changed.status, 200, 'Synthetic external edit failed');
    const updatedItem = await changed.json() as { eTag?: string };
    assert.ok(updatedItem.eTag && updatedItem.eTag !== identity.eTag, 'Provider did not record a new current identity');
    assert.deepEqual(await storage.get(repository, reference), bytes, 'External current bytes substituted the accepted version');
    await assert.rejects(storage.put({ driveId, folderId: 'root' }, `auditspherejs-denied-${runId}.txt`, bytes), /Graph upload failed \(403\)/, 'Runtime app must not write outside its selected acceptance folder');
    await mkdir('test-results/m365-live', { recursive: true });
    await writeFile(`test-results/m365-live/${purpose.toLowerCase()}-${runId}.json`, JSON.stringify({
      runId, checkedAt: new Date().toISOString(), provider: purpose,
      result: 'ROUNDTRIP_EXTERNAL_EDIT_AND_OUTSIDE_FOLDER_DENIAL_PASSED', byteCount: bytes.length, sha256: identity.sha256,
      repositoryIdentityHash: sha256(Buffer.from(`${driveId}\n${folderId}`)),
      versionIdentityHash: sha256(Buffer.from(`${identity.itemId}\n${identity.versionId}`)),
      fixtureRetained: true,
      limitations: ['Does not establish Entra SPA sign-in, consent revocation, throttling or full T156 acceptance'],
    }, null, 2));
  });
}
