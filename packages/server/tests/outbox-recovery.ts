import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { db } from '../dist/index.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
if (process.env.NODE_ENV === 'production' || process.env.STORAGE_PROVIDER === 'graph') throw new Error('Fault injection is restricted to local S3 test fixtures');
const storage = new S3Client({ region: 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
const csv = `code,name,current,prior\n${randomUUID()},Recovery,1.00,0.00\n${randomUUID()},Offset,-1.00,0.00`;
const url = new URL(process.env.REDIS_URL!);
const queue = new Queue('tb-import', { connection: { host: url.hostname, port: Number(url.port || 6379) } });
const response = await fetch('http://127.0.0.1:3000/api/v1/engagements/00000000-0000-4000-8000-000000000002/imports', {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ filename: 'recovery.csv', csv }),
});
assert.equal(response.status, 201);
const batch = await response.json() as { id: string };
const event = await db.outboxEvent.findFirstOrThrow({ where: { payload: { path: ['importId'], equals: batch.id } } });
// Simulate a previously published job lost from Redis, without flushing shared data.
assert.equal(await queue.getJob(event.id), undefined);
await db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
const imported = await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } });
const document = await db.document.findUniqueOrThrow({ where: { id: imported.documentId } });
const object = { Bucket: process.env.S3_BUCKET || 'evidence', Key: document.key };
await storage.send(new PutObjectCommand({ ...object, Body: 'corrupted test content' }));
const worker = spawn(process.execPath, ['apps/worker/dist/main.js'], { stdio: 'ignore' });
try {
  let retried = false;
  for (let count = 0; count < 60; count++) {
    const job = await queue.getJob(event.id);
    if (job && job.attemptsMade >= 1) {
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } })).status, 'QUEUED');
      assert.equal((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).completedAt, null);
      assert.equal(await db.tbRow.count({ where: { importId: batch.id } }), 0);
      await storage.send(new PutObjectCommand({ ...object, Body: csv })); retried = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(retried, true, 'Transient failure must remain recoverable');
  let completed = false;
  for (let count = 0; count < 60; count++) {
    const latest = await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } });
    if (latest.status === 'MAPPING_REQUIRED') { completed = true; break; }
    if (latest.status === 'FAILED') throw new Error(latest.error || 'Recovery failed');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(completed, true, 'Published PostgreSQL operation must recreate its missing job');
  assert.ok((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).completedAt);
  assert.equal(await db.tbRow.count({ where: { importId: batch.id } }), 2);
  console.log('Published-but-missing queue job reconstructed; corrupted evidence rejected; transient retry completed atomically');
} finally { worker.kill(); await queue.close(); await db.$disconnect(); }
