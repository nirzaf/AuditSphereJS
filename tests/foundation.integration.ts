import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('compiled ESM API and worker dependency injection uses real PostgreSQL', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import 'reflect-metadata';
    import { NestFactory } from '@nestjs/core';
    import { RuntimeModule, Readiness, db } from '@auditsphere/server';
    const app = await NestFactory.createApplicationContext(RuntimeModule, {logger:false});
    const result = await app.get(Readiness).check();
    if(result.status !== 'ready') throw new Error('Readiness failed');
    await app.close(); await db.$disconnect(); console.log('compiled DI ready');
  `], { encoding: 'utf8', cwd: 'apps/api', timeout: 30_000, env: { ...process.env, DOTENV_CONFIG_PATH: '../../.env' } });
  assert.match(output, /compiled DI ready/);
});
