import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { configuredGraphStorage } from './graph-storage.js';
const provider = () => process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'production' ? 'graph' : 'local-s3');
let graphStorage: ReturnType<typeof configuredGraphStorage> | undefined;
const graph = () => graphStorage ||= configuredGraphStorage();
const client = new S3Client({ region: 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
const Bucket = process.env.S3_BUCKET || 'evidence';
export async function ensureBucket() {
  if (provider() === 'graph') { graph(); return; }
  if (provider() !== 'local-s3' || process.env.NODE_ENV === 'production') throw new Error('Production requires Microsoft Graph storage');
  try { await client.send(new HeadBucketCommand({ Bucket })); } catch (e: any) { if (e.$metadata?.httpStatusCode !== 404) throw e; await client.send(new CreateBucketCommand({ Bucket })); }
}
export async function store(key: string, body: string): Promise<string> {
  await ensureBucket();
  if (provider() === 'graph') return graph().put(key.replaceAll('/', '_'), Buffer.from(body));
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: 'text/csv', IfNoneMatch: '*' }));
  return key;
}
export async function retrieve(key: string) {
  if (key.startsWith('graph:')) return (await graph().get(key)).toString('utf8');
  if (process.env.NODE_ENV === 'production' || provider() !== 'local-s3') throw new Error('Local storage references are disabled');
  const result = await client.send(new GetObjectCommand({ Bucket, Key: key })); return result.Body!.transformToString();
}
