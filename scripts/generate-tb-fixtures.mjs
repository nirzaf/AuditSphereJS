import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFiles } from '../fixtures/trial-balance/generator.mjs';

const directory = resolve(fileURLToPath(new URL('../fixtures/trial-balance/generated/', import.meta.url)));
const expected = fixtureFiles();
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const actualNames = readdirSync(directory).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Fixture inventory differs. Expected ${expectedNames.join(', ')}; found ${actualNames.join(', ')}`);
  }
  for (const [filename, bytes] of expected) {
    const actual = readFileSync(resolve(directory, filename));
    if (!actual.equals(bytes)) throw new Error(`Generated fixture is not byte-stable: ${filename}`);
  }
  console.log(`Trial Balance fixtures are byte-stable (${expected.size} files, ${[...expected.values()].reduce((sum, bytes) => sum + bytes.length, 0)} bytes).`);
} else {
  mkdirSync(directory, { recursive: true });
  for (const [filename, bytes] of expected) writeFileSync(resolve(directory, filename), bytes);
  console.log(`Wrote ${expected.size} deterministic Trial Balance fixture files to ${directory}.`);
}
