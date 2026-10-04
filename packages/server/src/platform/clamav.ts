import { createReadStream } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { createCorrelationId, currentCorrelationId } from './observability/correlation.js';
import { operationalMetrics } from './observability/metrics.js';
import { safeOperationalCode } from './observability/logging.js';

const CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 4 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export class MalwareDetectedError extends Error {
  constructor() { super('The uploaded file was detected by malware scanning'); }
}

export class MalwareScannerUnavailableError extends Error {
  constructor(message = 'The malware scanner is unavailable') { super(message); }
}

export type ClamAvOptions = { host: string; port: number; timeoutMs?: number };

function write(socket: Socket, bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(bytes, error => error ? reject(error) : resolve());
  });
}

async function readReply(socket: Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error?: Error, response?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve(response ?? '');
    };
    const onData = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_REPLY_BYTES) {
        finish(new Error('scanner response exceeded its size limit'));
        socket.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
      // clamd keeps command sockets open in several supported modes. Its NUL response
      // terminator, rather than EOF, is the protocol boundary for a single command.
      if (chunk.includes(0)) finish(undefined, Buffer.concat(chunks, size).toString('utf8').split('\0', 1)[0]);
    };
    const onEnd = () => finish(undefined, Buffer.concat(chunks, size).toString('utf8').replace(/[\0\r\n]+$/g, '').trim());
    const onError = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new Error('scanner response timed out')), timeoutMs);
    timer.unref();
    socket.on('data', onData);
    socket.once('end', onEnd);
    socket.once('error', onError);
  });
}

/** Streams a local private spool through clamd's INSTREAM protocol; file bytes are never buffered whole. */
export async function scanFileWithClamAv(filePath: string, options: ClamAvOptions): Promise<void> {
  if (!options.host || !Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new MalwareScannerUnavailableError('The malware scanner endpoint is not configured');
  }

  const socket = createConnection({ host: options.host, port: options.port });
  const correlationId = createCorrelationId(currentCorrelationId());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('scanner connection timed out')));

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });

    const responsePromise = readReply(socket, timeoutMs);
    await write(socket, Buffer.from('zINSTREAM\0', 'ascii'));
    for await (const chunk of createReadStream(filePath)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(bytes.byteLength);
      await write(socket, length);
      await write(socket, bytes);
    }
    socket.end(Buffer.alloc(4));
    const response = await responsePromise;
    socket.destroy();

    if (/\bFOUND$/i.test(response)) {
      operationalMetrics.recordProvider('clamav', 'scan', true);
      throw new MalwareDetectedError();
    }
    if (!/^stream:\s*OK$/i.test(response)) throw new Error(`scanner returned an unexpected response: ${response.slice(0, 160)}`);
    operationalMetrics.recordProvider('clamav', 'scan', true);
  } catch (error) {
    socket.destroy();
    if (error instanceof MalwareDetectedError) throw error;
    const previous = operationalMetrics.dependencyState('clamav');
    operationalMetrics.recordProvider('clamav', 'scan', false);
    if (previous !== 'down') console.error(JSON.stringify({ event: 'dependency.provider_transition', dependency: 'clamav', state: 'down', errorCode: safeOperationalCode(error, 'CLAMAV_UNAVAILABLE'), correlationId, action: 'Restore the private ClamAV INSTREAM service; uploads remain blocked until scanning succeeds.' }));
    throw new MalwareScannerUnavailableError();
  }
}
