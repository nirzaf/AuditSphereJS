import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { RuntimeModule, Readiness, db } from '@auditsphere/server';
const serverRequire = createRequire(new URL('../packages/server/package.json', import.meta.url));
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const load = (name, owner = serverRequire) => import(pathToFileURL(owner.resolve(name)).href);
const results = { runtime: process.version, platform: process.platform, architecture: process.arch, checks: [] };
const { NestFactory } = await load('@nestjs/core');
const app = await NestFactory.createApplicationContext(RuntimeModule, { logger: false });
try {
  assert.equal((await app.get(Readiness).check()).status, 'ready'); results.checks.push('compiled Nest DI and PostgreSQL readiness');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE compatibility_money (amount numeric(20,2)) ON COMMIT DROP');
    await tx.$executeRawUnsafe("INSERT INTO compatibility_money VALUES (0.10), (0.20)");
    const rows = await tx.$queryRawUnsafe('SELECT sum(amount)::text AS total FROM compatibility_money');
    assert.equal(rows[0].total, '0.30');
  }); results.checks.push('PostgreSQL NUMERIC transaction');
  const { default: fastify } = await load('fastify', apiRequire);
  const http = fastify();
  await http.register((await load('@fastify/helmet', apiRequire)).default);
  await http.register((await load('@fastify/cookie', apiRequire)).default);
  await http.register((await load('@fastify/csrf-protection', apiRequire)).default);
  await http.register((await load('@fastify/rate-limit', apiRequire)).default, { max: 2, timeWindow: 60_000 });
  http.get('/smoke', () => ({ ready: true }));
  assert.equal((await http.inject('/smoke')).statusCode, 200);
  await http.inject('/smoke'); assert.equal((await http.inject('/smoke')).statusCode, 429);
  await http.close(); results.checks.push('Fastify plugins and denied rate limit');
  const { Queue, Worker, QueueEvents } = await load('bullmq');
  const redis = new URL(process.env.REDIS_URL);
  const connection = { host: redis.hostname, port: Number(redis.port || 6379) };
  const name = `compatibility-${randomUUID()}`;
  const queue = new Queue(name, { connection }); const events = new QueueEvents(name, { connection });
  const worker = new Worker(name, async job => job.data.value + 1, { connection });
  try { await events.waitUntilReady(); const job = await queue.add('smoke', { value: 41 }); assert.equal(await job.waitUntilFinished(events, 15_000), 42); }
  finally { await worker.close(); await events.close(); await queue.obliterate({ force: true }); await queue.close(); }
  results.checks.push('BullMQ job against Redis');
  const { Server } = await load('socket.io'); const { io } = await import('socket.io-client');
  const transport = createServer(); const socketServer = new Server(transport);
  await new Promise(resolve => transport.listen(0, '127.0.0.1', resolve));
  const client = io(`http://127.0.0.1:${transport.address().port}`, { transports: ['websocket'], reconnection: false, timeout: 5000 });
  try { await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); }); }
  finally { client.close(); await new Promise(resolve => socketServer.close(resolve)); }
  results.checks.push('Socket.IO websocket handshake');
  const playwright = await load('playwright'); const browser = await (playwright.chromium || playwright.default.chromium).launch({ headless: true });
  try { const page = await browser.newPage(); await page.route('**/*', route => route.abort()); await page.setContent('<html><body><h1>AuditSphere runtime proof</h1></body></html>'); const pdf = await page.pdf({ format: 'A4' }); assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); }
  finally { await browser.close(); }
  results.checks.push('Linux Chromium PDF executable');
  console.log(JSON.stringify(results, null, 2));
} finally { await app.close(); await db.$disconnect(); }
