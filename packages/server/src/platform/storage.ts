import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { configuredGraphStorage, decodeGraphReference, type GraphRepository } from './graph-storage.js';
import { createCorrelationId, currentCorrelationId } from './observability/correlation.js';
import { operationalMetrics } from './observability/metrics.js';
import { safeOperationalCode } from './observability/logging.js';
export const storageProvider = () => process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'production' ? 'graph' : 'local-s3');
let graphStorage: ReturnType<typeof configuredGraphStorage> | undefined;
const graph = () => graphStorage ||= configuredGraphStorage();
const client = new S3Client({ region: 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
const Bucket = process.env.S3_BUCKET || 'evidence';
async function trackLocalS3<T>(operation: string, action: () => Promise<T>): Promise<T> {
  const correlationId = createCorrelationId(currentCorrelationId());
  const previous = operationalMetrics.dependencyState('local-s3');
  try {
    const result = await action();
    operationalMetrics.recordProvider('local-s3', operation, true);
    return result;
  } catch (error) {
    operationalMetrics.recordProvider('local-s3', operation, false);
    if (previous !== 'down') console.error(JSON.stringify({
      event: 'dependency.provider_transition', dependency: 'local-s3', state: 'down', operation, correlationId,
      errorCode: safeOperationalCode(error, 'OBJECT_STORAGE_UNAVAILABLE'),
      action: 'Restore the configured RustFS endpoint and credentials; retry the durable operation after recovery.',
    }));
    throw error;
  }
}
export async function ensureBucket() {
  if (storageProvider() === 'graph') { graph(); return; }
  if (storageProvider() !== 'local-s3' || process.env.NODE_ENV === 'production') throw new Error('Production requires Microsoft Graph storage');
  await trackLocalS3('bucket', async () => {
    try { await client.send(new HeadBucketCommand({ Bucket })); }
    catch (error) {
      if (error && typeof error === 'object' && '$metadata' in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        await client.send(new CreateBucketCommand({ Bucket }));
        return;
      }
      throw error;
    }
  });
}
export async function storeBytes(key: string, bytes: Uint8Array, contentType: string, repository?: GraphRepository): Promise<string> {
  await ensureBucket();
  if (storageProvider() === 'graph') {
    if (!repository) throw new Error('Microsoft Graph storage requires a client repository binding');
    return graph().put(repository, key.replaceAll('/', '_'), Buffer.from(bytes));
  }
  await trackLocalS3('upload', () => client.send(new PutObjectCommand({ Bucket, Key: key, Body: Buffer.from(bytes), ContentType: contentType, IfNoneMatch: '*' })));
  return key;
}
/** Stream a previously validated, bounded staging file into the selected server-side provider. */
export async function storeFile(key: string, path: string, sizeBytes: number, sha256: string, contentType: string, repository?: GraphRepository, onStored?: (reference: string) => Promise<void>): Promise<string> {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error('Stored object size is outside the supported range');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Stored object SHA-256 is invalid');
  await ensureBucket();
  if (storageProvider() === 'graph') {
    if (!repository) throw new Error('Microsoft Graph storage requires a client repository binding');
    return graph().putStream(repository, key.replaceAll('/', '_'), createReadStream(path), sizeBytes, sha256, contentType, onStored);
  }
  await trackLocalS3('upload', () => client.send(new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(path), ContentLength: sizeBytes, ContentType: contentType, IfNoneMatch: '*' })));
  await onStored?.(key);
  return key;
}
export async function store(key: string, body: string, repository?: GraphRepository): Promise<string> {
  return storeBytes(key, Buffer.from(body), 'text/csv', repository);
}
/**
 * Removes only an unreferenced staging object. Graph cleanup requires its owning client repository
 * and immutable version reference, verifies the accepted bytes, then uses conditional recycle-bin
 * deletion. The S3-compatible path is limited to the local non-production storage fixture.
 */
export async function removeObject(reference: string, repository?: GraphRepository, expectedSha256?: string) {
  if (reference.startsWith('graph:')) {
    if (!repository) throw new Error('Graph cleanup requires the client repository binding');
    await graph().deleteStaged(repository, reference);
    return;
  }
  if (repository) {
    if (storageProvider() !== 'graph' || !expectedSha256) throw new Error('Graph staging cleanup requires its provider SHA-256');
    await graph().deleteStagedByName(repository, reference.replaceAll('/', '_'), expectedSha256);
    return;
  }
  if (storageProvider() !== 'local-s3' || process.env.NODE_ENV === 'production') throw new Error('Object deletion is only automated for the local storage fixture');
  await trackLocalS3('delete', () => client.send(new DeleteObjectCommand({ Bucket, Key: reference })));
}
export async function retrieve(key: string, repository?: GraphRepository) {
  if (key.startsWith('graph:')) {
    if (!repository) throw new Error('Graph references require the owning client repository binding');
    return (await graph().get(repository, key)).toString('utf8');
  }
  if (process.env.NODE_ENV === 'production' || storageProvider() !== 'local-s3') throw new Error('Local storage references are disabled');
  return trackLocalS3('download', async () => {
    const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    return result.Body!.transformToString();
  });
}

/**
 * Byte-preserving read for binary evidence such as workbooks. `retrieve` decodes UTF-8 and would
 * corrupt a binary file, so binary imports must use this function.
 */
export async function retrieveBytes(key: string, repository?: GraphRepository): Promise<Buffer> {
  if (key.startsWith('graph:')) {
    if (!repository) throw new Error('Graph references require the owning client repository binding');
    return graph().get(repository, key);
  }
  if (process.env.NODE_ENV === 'production' || storageProvider() !== 'local-s3') throw new Error('Local storage references are disabled');
  return trackLocalS3('download', async () => {
    const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    return Buffer.from(await result.Body!.transformToByteArray());
  });
}

/** Verify provider bytes into a private file before the API begins streaming them to a caller. */
export async function retrieveToFile(key: string, destination: string, expected: { sha256: string; sizeBytes: number }, repository?: GraphRepository): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 0) throw new Error('Invalid immutable document metadata');
  if (key.startsWith('graph:')) {
    if (!repository) throw new Error('Graph references require the owning client repository binding');
    const identity = decodeGraphReference(key);
    if (identity.sha256 !== expected.sha256 || identity.sizeBytes !== expected.sizeBytes) throw new Error('Graph reference does not match immutable document metadata');
    await graph().getToFile(repository, key, destination);
    return;
  }
  if (process.env.NODE_ENV === 'production' || storageProvider() !== 'local-s3') throw new Error('Local storage references are disabled');
  const result = await trackLocalS3('download', () => client.send(new GetObjectCommand({ Bucket, Key: key })));
  if (!result.Body) throw new Error('Stored document has no content stream');
  const body = result.Body as unknown as { transformToWebStream?: () => ReadableStream<Uint8Array> };
  const source = body.transformToWebStream ? Readable.fromWeb(body.transformToWebStream() as never) : result.Body as unknown as Readable;
  const digest = createHash('sha256');
  let size = 0;
  const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.byteLength;
    if (size > expected.sizeBytes) return callback(new Error('Stored document exceeds its immutable size'));
    digest.update(chunk);
    callback(null, chunk);
  } });
  await pipeline(source, verify, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  if (size !== expected.sizeBytes || digest.digest('hex') !== expected.sha256) throw new Error('Stored document failed immutable version verification');
}
