import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { configuredGraphStorage, type GraphRepository } from './graph-storage.js';
export const storageProvider = () => process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'production' ? 'graph' : 'local-s3');
let graphStorage: ReturnType<typeof configuredGraphStorage> | undefined;
const graph = () => graphStorage ||= configuredGraphStorage();
const client = new S3Client({ region: 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
const Bucket = process.env.S3_BUCKET || 'evidence';
export async function ensureBucket() {
  if (storageProvider() === 'graph') { graph(); return; }
  if (storageProvider() !== 'local-s3' || process.env.NODE_ENV === 'production') throw new Error('Production requires Microsoft Graph storage');
  try { await client.send(new HeadBucketCommand({ Bucket })); } catch (e: any) { if (e.$metadata?.httpStatusCode !== 404) throw e; await client.send(new CreateBucketCommand({ Bucket })); }
}
export async function storeBytes(key: string, bytes: Uint8Array, contentType: string, repository?: GraphRepository): Promise<string> {
  await ensureBucket();
  if (storageProvider() === 'graph') {
    if (!repository) throw new Error('Microsoft Graph storage requires a client repository binding');
    return graph().put(repository, key.replaceAll('/', '_'), Buffer.from(bytes));
  }
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: Buffer.from(bytes), ContentType: contentType, IfNoneMatch: '*' }));
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
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(path), ContentLength: sizeBytes, ContentType: contentType, IfNoneMatch: '*' }));
  return key;
}
export async function store(key: string, body: string, repository?: GraphRepository): Promise<string> {
  return storeBytes(key, Buffer.from(body), 'text/csv', repository);
}
/**
 * Removes an unreferenced object. Only the local storage fixture is automated: durable SharePoint
 * evidence is never deleted by a background sweep, and a caller must resolve it manually.
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
  await client.send(new DeleteObjectCommand({ Bucket, Key: reference }));
}
export async function retrieve(key: string, repository?: GraphRepository) {
  if (key.startsWith('graph:')) {
    if (!repository) throw new Error('Graph references require the owning client repository binding');
    return (await graph().get(repository, key)).toString('utf8');
  }
  if (process.env.NODE_ENV === 'production' || storageProvider() !== 'local-s3') throw new Error('Local storage references are disabled');
  const result = await client.send(new GetObjectCommand({ Bucket, Key: key })); return result.Body!.transformToString();
}
