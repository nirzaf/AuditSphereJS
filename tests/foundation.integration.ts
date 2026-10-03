import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('compiled ESM API and worker dependency injection uses real PostgreSQL', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import 'reflect-metadata';
    import { NestFactory } from '@nestjs/core';
    import { RuntimeModule, Readiness, db, CLOCK } from '@auditsphere/server';
    const app = await NestFactory.createApplicationContext(RuntimeModule, {logger:false});
    const clock = app.get(CLOCK);
    const instant = clock.now();
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) throw new Error('Runtime clock is not injectable');
    const result = await app.get(Readiness).check();
    if(result.status !== 'ready') throw new Error('Readiness failed');
    await app.close(); await db.$disconnect(); console.log('compiled DI ready');
  `], { encoding: 'utf8', cwd: 'apps/api', timeout: 30_000, env: { ...process.env, DOTENV_CONFIG_PATH: '../../.env' } });
  assert.match(output, /compiled DI ready/);
});
test('compiled integration detects a missing Nest injection token', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import 'reflect-metadata';
    import { NestFactory } from '@nestjs/core';
    import { RuntimeModule } from '@auditsphere/server';
    try { await NestFactory.createApplicationContext({module:RuntimeModule,providers:[{provide:'broken',inject:['missing-token'],useFactory:value=>value}]},{logger:false,abortOnError:false}); throw new Error('Broken DI accepted'); }
    catch(error) { if(!String(error).includes('missing-token')) throw error; console.log('missing injection token detected'); }
  `], { encoding: 'utf8', cwd: 'apps/api', timeout: 30_000, env: { ...process.env, DOTENV_CONFIG_PATH: '../../.env' } });
  assert.match(output, /missing injection token detected/);
});
