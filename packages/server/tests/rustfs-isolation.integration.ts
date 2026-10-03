import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, ListBucketsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';

const image = 'rustfs/rustfs@sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff';

test('parallel RustFS test instances isolate same-named synthetic buckets and objects', { timeout: 120_000 }, async () => {
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
  } finally {
    deniedClient.destroy();
    await Promise.all(clients.map(async client => {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* bucket may not have been created */ }
      try { await client.send(new DeleteBucketCommand({ Bucket: bucket })); } catch { /* bucket may not have been created */ }
      client.destroy();
    }));
    await Promise.all(containers.map(container => container.stop()));
  }
});
