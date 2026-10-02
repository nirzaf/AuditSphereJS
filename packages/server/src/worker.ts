import 'reflect-metadata';
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { db } from './platform/db.js';
import { ensureBucket, retrieve } from './platform/storage.js';
import { resolveClientRepository } from './platform/repository.js';
import { sweepUnreferencedUploads } from './modules/fieldwork/uploads.js';
import { parseTrialBalance } from './modules/fieldwork/parser.js';
import { parseImportJob } from './modules/fieldwork/import-job.js';
import { createHash } from 'node:crypto';
import { RuntimeModule, Readiness } from './platform/runtime.js';
import { readConfiguration } from './platform/config.js';
@Module({ imports: [RuntimeModule] }) class WorkerModule {}
export async function runWorker() {
  readConfiguration();
  const app = await NestFactory.createApplicationContext(WorkerModule); app.enableShutdownHooks(); await app.get(Readiness).check(); await ensureBucket();
  const u = new URL(process.env.REDIS_URL!); const connection = { host: u.hostname, port: Number(u.port || 6379), username: u.username ? decodeURIComponent(u.username) : undefined, password: u.password ? decodeURIComponent(u.password) : undefined, ...(u.protocol === 'rediss:' ? { tls: { servername: u.hostname, rejectUnauthorized: true } } : {}) };
  const queue = new Queue('tb-import', { connection });
  const worker = new Worker('tb-import', async job => {
    const scope = parseImportJob(job.data);
    const batch = await db.tbImport.findFirst({ where: scope });
    if (!batch) throw new Error('Scoped trial-balance import not found');
    if (['MAPPING_REQUIRED','FINALIZED'].includes(batch.status)) { await db.outboxEvent.updateMany({ where: { id: job.id }, data: { completedAt: new Date() } }); return; }
    try {
      const claimed = await db.tbImport.updateMany({ where: { ...scope, status: { in: ['QUEUED', 'PARSING', 'FAILED'] } }, data: { status: 'PARSING', error: null } });
      if (!claimed.count) return;
      const document = await db.document.findFirst({ where: { id: batch.documentId, engagementId: scope.engagementId } });
      if (!document) throw new Error('Scoped trial-balance evidence not found');
      const repository = document.key.startsWith('graph:') ? await resolveClientRepository(db, batch.firmId, batch.clientId, 'evidence') : undefined;
      const content = await retrieve(document.key, repository);
      if (createHash('sha256').update(content).digest('hex') !== document.sha256) throw new Error('Evidence hash mismatch');
      const rows = parseTrialBalance(content);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "TbImport" WHERE id = ${batch.id}::uuid AND "firmId" = ${scope.firmId}::uuid AND "clientId" = ${scope.clientId}::uuid AND "engagementId" = ${scope.engagementId}::uuid FOR UPDATE`;
        const latest = await tx.tbImport.findFirst({ where: scope });
        if (!latest) throw new Error('Scoped trial-balance import not found');
        if (['MAPPING_REQUIRED', 'FINALIZED'].includes(latest.status)) return;
        await tx.tbRow.deleteMany({ where: { importId: batch.id } });
        for (let i = 0; i < rows.length; i += 1000) await tx.tbRow.createMany({ data: rows.slice(i, i + 1000).map(row => ({ ...row, importId: batch.id })) });
        await tx.tbImport.updateMany({ where: scope, data: { status: 'MAPPING_REQUIRED', rowCount: rows.length } });
        await tx.outboxEvent.updateMany({ where: { id: job.id }, data: { completedAt: new Date() } });
      }, { timeout: 120_000 });
    } catch (error) {
      const terminal = job.attemptsMade + 1 >= (job.opts.attempts || 1);
      await db.$transaction(async tx => {
        const changed = await tx.tbImport.updateMany({ where: { ...scope, status: 'PARSING' }, data: { status: terminal ? 'FAILED' : 'QUEUED', error: error instanceof Error ? error.message.slice(0, 500) : 'Import failed' } });
        if (terminal && changed.count) await tx.outboxEvent.updateMany({ where: { id: job.id }, data: { completedAt: new Date() } });
      });
      throw error;
    }
  }, { connection, concurrency: 1 });
  worker.on('failed', (job, error) => console.error('Import failed', job?.id, error.message));
  let publishing = false;
  const timer = setInterval(async () => {
    if (publishing) return; publishing = true;
    try { for (const event of await db.outboxEvent.findMany({ where: { completedAt: null, type: 'tb.import' }, orderBy: { createdAt: 'asc' }, take: 100 })) {
      const scope = parseImportJob(event.payload);
      const batch = await db.tbImport.findFirst({ where: scope });
      if (!batch || ['FAILED', 'MAPPING_REQUIRED', 'FINALIZED'].includes(batch.status)) { await db.outboxEvent.update({ where: { id: event.id }, data: { completedAt: new Date() } }); continue; }
      if (await queue.getJob(event.id)) continue;
      await queue.add('parse', event.payload, { jobId: event.id, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
      await db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
    } } catch (error) { console.error('Outbox retry', error); } finally { publishing = false; }
  }, 1000);
  // Unreferenced uploads are cleaned only after a grace period, and Graph evidence is never deleted.
  const sweepTimer = setInterval(() => {
    sweepUnreferencedUploads({ olderThanMinutes: 60 }).then((result) => { if (result.scanned) console.log('Upload sweep', JSON.stringify({ scanned: result.scanned, cleaned: result.cleaned, reviewRequired: result.reviewRequired })); }).catch((error) => console.error('Upload sweep', error));
  }, 600_000);
  const shutdown = async () => { clearInterval(timer); clearInterval(sweepTimer); await worker.close(); await queue.close(); await db.$disconnect(); await app.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
