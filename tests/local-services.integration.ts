import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import { randomBytes, randomUUID } from 'node:crypto';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

test('concurrent PostgreSQL test runs receive isolated databases and dynamic ports', { timeout: 120_000 }, async () => {
  const image = 'postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';
  const start = () => new PostgreSqlContainer(image)
    .withDatabase('auditsphere_isolation')
    .withUsername('test_owner')
    .withPassword(randomBytes(24).toString('hex'))
    .start();
  const containers = await Promise.all([start(), start()]);

  try {
    assert.notEqual(containers[0].getMappedPort(5432), containers[1].getMappedPort(5432), 'parallel database containers must receive isolated host ports');
    const markers = await Promise.all(containers.map(async (container, index) => {
      const result = await container.exec([
        'psql', '-U', 'test_owner', '-d', 'auditsphere_isolation', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c',
        `CREATE TABLE run_marker (value TEXT NOT NULL); INSERT INTO run_marker VALUES ('parallel-${index}'); SELECT value FROM run_marker;`,
      ]);
      assert.equal(result.exitCode, 0, result.output);
      return result.output.trim().split(/\r?\n/).at(-1);
    }));
    assert.deepEqual(markers, ['parallel-0', 'parallel-1']);
  } finally {
    await Promise.all(containers.map(container => container.stop()));
  }
});

test('isolated queue Redis containers assert the selected version and durable queue settings', { timeout: 60_000 }, async () => {
  const start = () => new GenericContainer('redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee')
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
    .start();

  const containers = await Promise.all([start(), start()]);
  try {
    assert.notEqual(containers[0].getMappedPort(6379), containers[1].getMappedPort(6379), 'parallel containers must receive isolated host ports');
    for (const container of containers) {
      const run = async (args: string[]) => {
        const result = await container.exec(['redis-cli', '--raw', ...args]);
        assert.equal(result.exitCode, 0, result.output);
        return result.output.trim();
      };

      const info = await run(['INFO', 'server']);
      const version = info.match(/^redis_version:(.+)$/m)?.[1];
      assert.ok(version?.startsWith('8.10.'), `expected Redis 8.10.x, received ${version ?? 'no version'}`);
      assert.equal(await run(['CONFIG', 'GET', 'maxmemory-policy']), 'maxmemory-policy\nnoeviction');
      assert.equal(await run(['CONFIG', 'GET', 'appendonly']), 'appendonly\nyes');
    }
  } finally {
    await Promise.all(containers.map(container => container.stop()));
  }
});

test('digest-pinned Mailpit accepts a synthetic message over SMTP without external delivery', { timeout: 60_000 }, async () => {
  const container = await new GenericContainer('ghcr.io/axllent/mailpit:v1.31.3@sha256:13de4ffbd28f3089be6dff32afbc8210edb5a593d738fa877ae7272cc73aeb67')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const socket = createConnection({ host: container.getHost(), port: container.getMappedPort(1025) });
  const replies = createInterface({ input: socket });
  const lines = replies[Symbol.asyncIterator]();
  const response = async (expected: number) => {
    const received: string[] = [];
    while (true) {
      const line = await lines.next();
      assert.equal(line.done, false, 'SMTP connection closed before a complete response');
      received.push(line.value);
      if (/^\d{3} /.test(line.value)) break;
    }
    assert.ok(received[0]?.startsWith(`${expected}`), `expected SMTP ${expected}, received ${received.join(' | ')}`);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    await response(220);
    socket.write('EHLO auditsphere.test\r\n');
    await response(250);
    socket.write('MAIL FROM:<sender@example.test>\r\n');
    await response(250);
    socket.write('RCPT TO:<recipient@example.test>\r\n');
    await response(250);
    socket.write('DATA\r\n');
    await response(354);
    socket.write(`From: sender@example.test\r\nTo: recipient@example.test\r\nSubject: Synthetic acceptance ${randomUUID()}\r\n\r\nLocal-only test message.\r\n.\r\n`);
    await response(250);
    socket.write('QUIT\r\n');
    await response(221);
  } finally {
    replies.close();
    socket.destroy();
    await container.stop();
  }
});
