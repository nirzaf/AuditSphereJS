import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { config } from 'dotenv';
import { configuredGraphStorage, decodeGraphReference } from '../../packages/server/src/platform/graph-storage.js';

// Explicit opt-in only. The fixture is synthetic artwork in its own firm-private folder.
const privateFile = process.env.M365_ACCEPTANCE_ENV_FILE;
if (privateFile) {
  const loaded = config({ path: privateFile, quiet: true });
  if (loaded.error) throw new Error('Cannot read the designated private acceptance environment');
}
assert.equal(process.env.M365_ACCEPTANCE_NONPRODUCTION, '1', 'Set M365_ACCEPTANCE_NONPRODUCTION=1 only for explicitly designated test repositories');
const driveId = process.env.M365_ACCEPTANCE_TEMPLATE_ASSETS_DRIVE_ID;
const folderId = process.env.M365_ACCEPTANCE_TEMPLATE_ASSETS_FOLDER_ID;
assert.ok(driveId && folderId, 'Configure the dedicated firm-private template asset acceptance folder');
const storage = configuredGraphStorage();
const runId = randomUUID();
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('live SharePoint firm-private template asset folder: exact version roundtrip and selected-folder boundary', async () => {
  const repository = { driveId, folderId, purpose: 'template-assets-private' as const };
  const filename = `auditspherejs-template-asset-${runId}.png`;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');
  let reference: string | undefined;
  let identity: ReturnType<typeof decodeGraphReference> | undefined;
  try {
    reference = await storage.put(repository, filename, bytes);
    identity = decodeGraphReference(reference);
    assert.equal(identity.driveId, driveId);
    assert.equal(identity.repositoryFolderId, folderId, 'Provider reference must retain the firm-private folder boundary');
    assert.equal(identity.sha256, sha256(bytes));
    assert.equal(identity.sizeBytes, bytes.length);
    assert.ok(identity.versionId);
    assert.deepEqual(await storage.get(repository, reference), bytes, 'The accepted immutable provider version must return the exact synthetic image bytes');
    await assert.rejects(
      storage.put({ driveId, folderId: 'root', purpose: 'template-assets-private' }, `auditspherejs-template-denied-${runId}.png`, bytes),
      /Graph upload failed \(403\)/,
      'The storage app must not be able to write outside its selected acceptance folder',
    );
  } finally {
    if (reference) await storage.deleteStaged(repository, reference);
  }
  assert.ok(identity, 'The synthetic provider fixture must have been created before evidence is recorded');
  await assert.rejects(storage.get(repository, reference!), /Graph version metadata failed \(404\)/, 'A recycled template fixture must fail closed on subsequent reads');
  await mkdir('test-results/m365-live', { recursive: true });
  await writeFile(`test-results/m365-live/template-assets-${runId}.json`, JSON.stringify({
    runId,
    checkedAt: new Date().toISOString(),
    provider: 'SHAREPOINT',
    result: 'FIRM_PRIVATE_TEMPLATE_ASSET_VERSION_ROUNDTRIP_AND_SELECTED_FOLDER_BOUNDARY_PASSED',
    sizeBytes: identity.sizeBytes,
    sha256: identity.sha256,
    repositoryIdentityHash: sha256(Buffer.from(`${driveId}\n${folderId}`)),
    versionIdentityHash: sha256(Buffer.from(`${identity.itemId}\n${identity.versionId}`)),
    fixtureRetained: false,
    cleanupOutcome: 'RECYCLED_AND_READ_FAILS_CLOSED',
    limitations: ['Synthetic provider-adapter acceptance only; does not establish professional approval of signature artwork or full report-release acceptance'],
  }, null, 2));
});
