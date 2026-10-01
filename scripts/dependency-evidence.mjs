import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const candidates = {
  '@nestjs/cli': 'latest', '@nestjs/schematics': 'latest', '@nestjs/bullmq': '12.0.0',
  '@nestjs/websockets': '12.1.2', '@nestjs/platform-socket.io': '12.1.2',
  '@angular/router': '22.2.1', '@angular/material': '22.2.1', tslib: 'latest',
  'socket.io': 'latest', 'socket.io-client': 'latest', playwright: '1.58.2',
  jsdom: 'latest', testcontainers: 'latest', '@testcontainers/postgresql': 'latest',
  eslint: 'latest', 'angular-eslint': 'latest', 'typescript-eslint': 'latest', prettier: 'latest',
  '@fastify/helmet': 'latest', '@fastify/cookie': 'latest', '@fastify/csrf-protection': 'latest',
  '@fastify/rate-limit': 'latest', 'openapi-typescript': 'latest', pnpm: '12.8.1',
};
const selected = { ...manifest.dependencies, ...manifest.devDependencies };
for (const directory of ['apps', 'packages']) for (const child of readdirSync(directory)) {
  const path = `${directory}/${child}/package.json`;
  if (!existsSync(path)) continue;
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  Object.assign(selected, pkg.dependencies, pkg.devDependencies);
}
for (const name of Object.keys(selected)) if (selected[name].startsWith('workspace:')) delete selected[name];
Object.assign(selected, Object.fromEntries(Object.entries(candidates).filter(([name]) => !selected[name])));
mkdirSync('docs/evidence/T005', { recursive: true });
const rows = [];
const entries = Object.entries(selected);
for (let start = 0; start < entries.length; start += 6) {
  const results = await Promise.allSettled(entries.slice(start, start + 6).map(async ([name, requested]) => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    const response = await fetch(url); if (!response.ok) throw new Error(`${name}: registry ${response.status}`);
    const registry = await response.json();
    const version = requested === 'latest' ? registry['dist-tags'].latest : requested;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${name}: prerelease/range rejected: ${version}`);
    const pkg = registry.versions[version]; if (!pkg) throw new Error(`${name}@${version} unavailable`);
    return { name, version, engines: pkg.engines || {}, peers: pkg.peerDependencies || {}, peerMeta: pkg.peerDependenciesMeta || {}, license: pkg.license || 'NOT_DECLARED', deprecated: pkg.deprecated || null, integrity: pkg.dist.integrity, published: registry.time[version], source: `${url}/${version}`, repository: pkg.repository?.url, scripts: pkg.scripts || {}, disposition: candidates[name] ? 'CANDIDATE_REVIEWED_NOT_EXECUTED' : 'EXISTING_PIN_REVIEWED_REQUIRES_TARGET_SMOKE' };
  }));
  for (const result of results) { if (result.status === 'rejected') throw result.reason; rows.push(result.value); }
}
writeFileSync('docs/evidence/T005/registry-metadata.json', JSON.stringify({ capturedDate: '2026-10-01', target: 'Node 24 LTS / Linux amd64; local host Windows Node 24.19.0', prismaDecision: 'Prisma registry latest is an 8 RC. Keep exact stable CLI/client/adapter 7.10.0; no GA assertion.', rows }, null, 2) + '\n');
writeFileSync('docs/evidence/T005/candidate-pins.json', JSON.stringify(Object.fromEntries(rows.filter(row => candidates[row.name]).map(row => [row.name, row.version])), null, 2) + '\n');
console.log(rows.map(row => `${row.name}@${row.version} | ${row.license} | ${JSON.stringify(row.engines)}`).join('\n'));
