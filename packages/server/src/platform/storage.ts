import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
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
export async function store(key: string, body: string, repository?: GraphRepository): Promise<string> {
  await ensureBucket();
  if (storageProvider() === 'graph') {
    if (!repository) throw new Error('Microsoft Graph storage requires a client repository binding');
    return graph().put(repository, key.replaceAll('/', '_'), Buffer.from(body));
  }
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: 'text/csv', IfNoneMatch: '*' }));
  return key;
}
/**
 * Removes an unreferenced object. Only the local storage fixture is automated: durable SharePoint
 * evidence is never deleted by a background sweep, and a caller must resolve it manually.
 */
export async function removeObject(reference: string) {
  if (reference.startsWith('graph:')) throw new Error('Graph evidence deletion is not automated; review the object manually');
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
