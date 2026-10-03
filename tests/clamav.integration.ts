import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MalwareDetectedError, scanFileWithClamAv } from '../packages/server/src/platform/clamav.js';

test('the configured ClamAV daemon accepts clean evidence and rejects the EICAR test signature', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-clamav-live-'));
  try {
    const cleanPath = join(directory, 'clean.pdf');
    const infectedPath = join(directory, 'eicar.txt');
    await writeFile(cleanPath, Buffer.from('%PDF-1.7\nSynthetic clean acceptance fixture\n'));
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    assert.equal(Buffer.byteLength(eicar), 68, 'EICAR fixture must use the exact 68-byte standard test string');
    await writeFile(infectedPath, Buffer.from(eicar));
    const endpoint = { host: process.env.CLAMAV_HOST ?? '127.0.0.1', port: Number(process.env.CLAMAV_PORT ?? 3310), timeoutMs: 150_000 };
    await scanFileWithClamAv(cleanPath, endpoint);
    await assert.rejects(scanFileWithClamAv(infectedPath, endpoint), MalwareDetectedError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
