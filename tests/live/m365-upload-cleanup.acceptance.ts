import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { config } from 'dotenv';
import test from 'node:test';

const privateFile = process.env.M365_ACCEPTANCE_ENV_FILE;
if (privateFile) {
  const loaded = config({ path: privateFile, quiet: true });
  if (loaded.error) throw new Error('Cannot read the designated private acceptance environment');
}
assert.equal(process.env.M365_ACCEPTANCE_NONPRODUCTION, '1', 'Set M365_ACCEPTANCE_NONPRODUCTION=1 only for explicitly designated test repositories');

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('live Graph upload sweeper cleans only expired synthetic stages through an isolated PostgreSQL database', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722')
    .withDatabase('auditsphere_live_upload_cleanup')
    .withUsername('cleanup_acceptance')
    .withPassword(randomBytes(24).toString('hex'))
    .start();
  const redis = await new GenericContainer(redisImage)
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
    .start();
  const uri = container.getConnectionUri();
  const priorEnvironment = new Map(['NODE_ENV', 'SERVICE_NAME', 'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'STORAGE_PROVIDER'].map(name => [name, process.env[name]]));
  const fixtures: Array<{ provider: 'SHAREPOINT' | 'ONEDRIVE'; repository: { driveId: string; folderId: string }; reference: string; sha256: string; sizeBytes: number }> = [];
  let db: typeof import('@auditsphere/server').db | undefined;
  let graph: Awaited<ReturnType<typeof import('../../packages/server/src/platform/graph-storage.js').configuredGraphStorage>> | undefined;
  let workerProcess: ReturnType<typeof spawn> | undefined;
  let workerOutput = '';

  try {
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
      env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri },
      timeout: 90_000,
      stdio: 'pipe',
    });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'graph' });
    const server = await import('@auditsphere/server');
    const graphModule = await import('../../packages/server/src/platform/graph-storage.js');
    db = server.db;
    graph = graphModule.configuredGraphStorage();
    const outcomes: Array<{ provider: 'SHAREPOINT' | 'ONEDRIVE'; status: string; fixtureRetained: boolean; sha256: string; sizeBytes: number }> = [];

    for (const provider of ['SHAREPOINT', 'ONEDRIVE'] as const) {
      const driveId = process.env[`M365_ACCEPTANCE_${provider}_DRIVE_ID`];
      const folderId = process.env[`M365_ACCEPTANCE_${provider}_FOLDER_ID`];
      assert.ok(driveId && folderId, `Configure the designated ${provider} acceptance drive and folder`);
      const repository = { driveId, folderId };
      const firmId = randomUUID();
      const clientId = randomUUID();
      const engagementId = randomUUID();
      const bytes = Buffer.from(`AuditSphere synthetic upload-sweeper fixture\nProvider ${provider}\nRun ${randomUUID()}\nNo client or personal data.\n`);
      const filename = `${engagementId}_${randomUUID()}.txt`;
      const reference = await graph.put(repository, filename, bytes);
      const sha256 = digest(bytes);
      fixtures.push({ provider, repository, reference, sha256, sizeBytes: bytes.length });

      await db.firm.create({ data: { id: firmId, name: `Synthetic ${provider} cleanup acceptance` } });
      await db.client.create({ data: { id: clientId, firmId, name: `Synthetic ${provider} cleanup client` } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: `Synthetic ${provider} cleanup engagement`, state: 'FIELDWORK_EXECUTION' } });
      await db.clientRepository.create({ data: { firmId, clientId, purpose: 'evidence', provider: 'graph', driveId, folderId } });
      await db.storedObject.create({
        data: {
          engagementId,
          key: `${engagementId}/${randomUUID()}.txt`,
          reference,
          sha256,
          status: 'PENDING',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });
    }

    workerProcess = spawn(process.execPath, [resolve('apps/worker/dist/main.js')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SERVICE_NAME: 'auditsphere-worker',
        DATABASE_URL: uri,
        WORKER_DATABASE_URL: uri,
        MIGRATION_DATABASE_URL: uri,
        REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
        STORAGE_PROVIDER: 'graph',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    workerProcess.stdout?.on('data', chunk => { workerOutput += chunk.toString(); });
    workerProcess.stderr?.on('data', chunk => { workerOutput += chunk.toString(); });
    const deadline = Date.now() + 120_000;
    let cleaned = 0;
    while (Date.now() < deadline && (cleaned !== 2 || !workerOutput.includes('Upload sweep'))) {
      if (workerProcess.exitCode !== null) assert.fail(`worker exited before cleanup: ${workerOutput}`);
      cleaned = await db.storedObject.count({ where: { status: 'CLEANED' } });
      if (cleaned !== 2 || !workerOutput.includes('Upload sweep')) await sleep(100);
    }
    assert.equal(cleaned, 2, `the running worker must reclaim both expired provider stages; output: ${workerOutput}`);
    assert.match(workerOutput, /Upload sweep/);
    assert.equal(await db.storedObject.count({ where: { status: 'REVIEW_REQUIRED' } }), 0);
    const result = { scanned: 2, cleaned, reviewRequired: 0 };
    for (const fixture of fixtures) {
      await assert.rejects(graph.get(fixture.repository, fixture.reference), /Graph version metadata failed \(404\)/, `${fixture.provider} stage must be absent after the worker sweep`);
      outcomes.push({ provider: fixture.provider, status: 'CLEANED_AND_READ_FAILS_CLOSED', fixtureRetained: false, sha256: fixture.sha256, sizeBytes: fixture.sizeBytes });
    }

    const evidencePath = `test-results/m365-live/upload-sweep-${randomUUID()}.json`;
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir('test-results/m365-live', { recursive: true });
    await writeFile(evidencePath, JSON.stringify({
      checkedAt: new Date().toISOString(),
      runId: evidencePath.split('/').at(-1)?.replace(/^upload-sweep-|\.json$/g, ''),
      database: 'ephemeral PostgreSQL 18.6 Testcontainers database',
      redis: 'digest-pinned Redis 8.10 Testcontainers service',
      worker: 'apps/worker/dist/main.js long-running process',
      result: 'LIVE_GRAPH_CLEANUP_WORKER_PROCESS_PASSED',
      scanned: result.scanned,
      cleaned: result.cleaned,
      reviewRequired: result.reviewRequired,
      providers: outcomes,
      limitations: ['Only unique synthetic files in the designated nonproduction SharePoint and OneDrive acceptance folders were used.', 'This is an ephemeral acceptance database; it does not prove production backup, retention or legal-hold behavior.'],
    }, null, 2));
    console.log('the PostgreSQL upload sweeper cleaned both expired synthetic Graph stages; referenced evidence was not present or changed');
  } finally {
    if (workerProcess?.exitCode === null) {
      workerProcess.kill();
      await Promise.race([once(workerProcess, 'exit'), sleep(5_000)]);
    }
    if (graph) {
      for (const fixture of fixtures) await graph.deleteStaged(fixture.repository, fixture.reference);
    }
    await db?.$disconnect();
    for (const [name, value] of priorEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await redis.stop();
    await container.stop();
  }
});
