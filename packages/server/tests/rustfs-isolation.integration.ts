import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, ListBucketsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';
import { currentCorrelationId, runWithCorrelationId } from '../src/platform/observability/correlation.js';

const image = 'rustfs/rustfs@sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff';

test('parallel RustFS test instances isolate same-named synthetic buckets and objects', { timeout: 120_000 }, async () => {
  const previousEnvironment = Object.fromEntries(['NODE_ENV', 'STORAGE_PROVIDER', 'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'].map(key => [key, process.env[key]]));
  const accessKeyId = 'auditsphere_test_access_key';
  const secretAccessKey = 'auditsphere_test_secret_key_with_at_least_32_chars';
  const start = () => new GenericContainer(image)
    .withEnvironment({ RUSTFS_ACCESS_KEY: accessKeyId, RUSTFS_SECRET_KEY: secretAccessKey, RUSTFS_ADDRESS: ':9000' })
    .withCommand(['/data'])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const containers = await Promise.all([start(), start()]);
  const clients = containers.map(container => new S3Client({
    endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  }));
  const deniedClient = new S3Client({
    endpoint: `http://${containers[0].getHost()}:${containers[0].getMappedPort(9000)}`,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey: 'intentionally-wrong-synthetic-secret' },
    forcePathStyle: true,
  });
  const bucket = `auditsphere-isolation-${randomUUID().replaceAll('-', '')}`;
  const key = 'synthetic-fixture.txt';

  try {
    await Promise.all(clients.map(client => client.send(new CreateBucketCommand({ Bucket: bucket }))));
    await Promise.all(clients.map((client, index) => client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: `isolated-instance-${index}`,
    }))));

    const values = await Promise.all(clients.map(async client => {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      assert.ok(response.Body, 'the synthetic object must be readable in its own instance');
      return response.Body.transformToString();
    }));

    assert.deepEqual(values, ['isolated-instance-0', 'isolated-instance-1']);
    await assert.rejects(deniedClient.send(new ListBucketsCommand({})), 'RustFS must reject invalid synthetic credentials');

    Object.assign(process.env, {
      NODE_ENV: 'test', STORAGE_PROVIDER: 'local-s3',
      S3_ENDPOINT: `http://${containers[0].getHost()}:${containers[0].getMappedPort(9000)}`,
      S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey, S3_BUCKET: bucket,
    });
    const storage = await import('../src/platform/storage.js');
    const metrics = (await import('../src/platform/observability/metrics.js')).operationalMetrics;
    const trackedKey = `correlation-${randomUUID()}.txt`;
    const trace = 'rustfs-storage-correlation-041';
    await runWithCorrelationId(trace, async () => {
      const reference = await storage.storeBytes(trackedKey, Buffer.from('synthetic correlated object'), 'text/plain');
      assert.equal(currentCorrelationId(), trace, 'the request trace remains active across RustFS network operations');
      assert.equal(await storage.retrieve(reference), 'synthetic correlated object');
      await storage.removeObject(reference);
    });
    assert.equal(metrics.dependencyState('local-s3'), 'up');
    assert.match(metrics.render(), /provider="local-s3",operation="upload",outcome="success"/);
  } finally {
    deniedClient.destroy();
    await Promise.all(clients.map(async client => {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* bucket may not have been created */ }
      try { await client.send(new DeleteBucketCommand({ Bucket: bucket })); } catch { /* bucket may not have been created */ }
      client.destroy();
    }));
    await Promise.all(containers.map(container => container.stop()));
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
