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

for (const purpose of ['SHAREPOINT', 'ONEDRIVE'] as const) {
  const driveId = process.env[`M365_ACCEPTANCE_${purpose}_DRIVE_ID`];
  const folderId = process.env[`M365_ACCEPTANCE_${purpose}_FOLDER_ID`];
  assert.ok(driveId && folderId, `Configure the designated ${purpose} acceptance drive and folder`);
  const repository = { driveId, folderId };
  test(`live ${purpose}: write and read exact retained version bytes`, async () => {
    const bytes = Buffer.from(`AuditSphereJS synthetic acceptance fixture\nRun ${runId}\nStorage ${purpose}\nNo client or personal data.\n`);
    const reference = await storage.put(repository, `auditspherejs-acceptance-${runId}.txt`, bytes);
    const identity = decodeGraphReference(reference);
    const downloaded = await storage.get(repository, reference);
    assert.deepEqual(downloaded, bytes);
    assert.equal(identity.sha256, sha256(bytes));
    assert.equal(identity.sizeBytes, bytes.length);
    assert.ok(identity.versionId);
    await mkdir('test-results/m365-live', { recursive: true });
    await writeFile(`test-results/m365-live/${purpose.toLowerCase()}-${runId}.json`, JSON.stringify({
      runId, checkedAt: new Date().toISOString(), provider: purpose,
      result: 'EXACT_VERSION_ROUNDTRIP_PASSED', byteCount: bytes.length, sha256: identity.sha256,
      repositoryIdentityHash: sha256(Buffer.from(`${driveId}\n${folderId}`)),
      versionIdentityHash: sha256(Buffer.from(`${identity.itemId}\n${identity.versionId}`)),
      fixtureRetained: true,
      limitations: ['Does not establish Entra SPA sign-in, external-change recovery, consent revocation, throttling or full T156 acceptance'],
    }, null, 2));
  });
}
