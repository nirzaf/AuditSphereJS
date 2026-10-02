import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenericContainer, Wait } from 'testcontainers';

test('isolated queue Redis containers assert the selected version and durable queue settings', { timeout: 60_000 }, async () => {
  const start = () => new GenericContainer('redis:8.10')
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
