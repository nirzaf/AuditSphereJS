import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { contractSchemas } from '@auditsphere/contracts';
import { spawnSync } from 'node:child_process';
const mode = process.argv[2];
if (!['generate', 'check'].includes(mode)) throw new Error('Expected generate or check');
const schemas = Object.fromEntries(Object.entries(contractSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]));
const output = JSON.stringify(schemas, null, 2) + '\n';
const path = 'packages/contracts/schema.json';
if (mode === 'generate') writeFileSync(path, output);
else if (readFileSync(path, 'utf8') !== output) throw new Error('Contract schema drift: run pnpm contracts:generate');
console.log(`Contract schemas ${mode === 'check' ? 'match runtime definitions' : 'generated'}`);
if (mode === 'check') {
  const openApi = spawnSync(process.execPath, ['scripts/openapi.mjs', 'check'], { stdio: 'inherit' });
  if (openApi.status !== 0) process.exit(openApi.status || 1);
}
