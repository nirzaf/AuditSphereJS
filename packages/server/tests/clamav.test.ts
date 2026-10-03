import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MalwareDetectedError, MalwareScannerUnavailableError, scanFileWithClamAv } from '../src/platform/clamav.js';

const tempDirectories: string[] = [];
const servers: Server[] = [];

async function fixture(contents: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-clamav-test-'));
  tempDirectories.push(directory);
  const filePath = join(directory, 'content.bin');
  await writeFile(filePath, contents);
  return filePath;
}

async function fakeClamAv() {
  let resolveReceived!: (value: { bytes: Buffer; frameSizes: number[] }) => void;
  const received = new Promise<{ bytes: Buffer; frameSizes: number[] }>(resolve => { resolveReceived = resolve; });
  const server = createServer(socket => {
    let input = Buffer.alloc(0);
    let commandReceived = false;
    let scanned = Buffer.alloc(0);
    const frameSizes: number[] = [];
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      if (!commandReceived) {
        const commandEnd = input.indexOf(0);
        if (commandEnd < 0) return;
        if (input.subarray(0, commandEnd).toString('ascii') !== 'zINSTREAM') {
          socket.end(Buffer.from('UNKNOWN COMMAND\0'));
          return;
        }
        input = input.subarray(commandEnd + 1);
        commandReceived = true;
      }
      while (input.length >= 4) {
        const chunkLength = input.readUInt32BE(0);
        if (input.length < chunkLength + 4) return;
        input = input.subarray(4);
        if (chunkLength === 0) {
          const infected = scanned.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'));
          resolveReceived({ bytes: scanned, frameSizes });
          socket.end(Buffer.from(infected ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0'));
          return;
        }
        frameSizes.push(chunkLength);
        scanned = Buffer.concat([scanned, input.subarray(0, chunkLength)]);
        input = input.subarray(chunkLength);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake ClamAV server did not bind a TCP port');
  return { options: { host: '127.0.0.1', port: address.port }, received };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('ClamAV INSTREAM adapter', () => {
  it('streams large inputs in bounded, length-prefixed frames and accepts NUL-terminated clean replies', async () => {
    const bytes = Buffer.alloc(150_000, 0x61);
    const filePath = await fixture(bytes);
    const scanner = await fakeClamAv();
    await expect(scanFileWithClamAv(filePath, scanner.options)).resolves.toBeUndefined();
    const result = await scanner.received;
    expect(result.bytes).toEqual(bytes);
    expect(result.frameSizes.length).toBeGreaterThan(1);
    expect(result.frameSizes.every(size => size > 0 && size <= 64 * 1024)).toBe(true);
  });

  it('rejects a detected signature without converting it to scanner unavailability', async () => {
    const filePath = await fixture(Buffer.from('%PDF-1.7\nEICAR-STANDARD-ANTIVIRUS-TEST-FILE\n'));
    const scanner = await fakeClamAv();
    await expect(scanFileWithClamAv(filePath, scanner.options)).rejects.toBeInstanceOf(MalwareDetectedError);
    await scanner.received;
  });

  it('fails closed when the scanner cannot be reached', async () => {
    const filePath = await fixture(Buffer.from('test'));
    await expect(scanFileWithClamAv(filePath, { host: '127.0.0.1', port: 1, timeoutMs: 100 })).rejects.toBeInstanceOf(MalwareScannerUnavailableError);
  });
});
