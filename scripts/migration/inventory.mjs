#!/usr/bin/env node
// MIG-001 baseline inventory extractor.
//
// Reads the pinned AuditSphere source checkout (read-only) and emits machine-readable
// inventory under docs/migration/inventory/. The extraction is deliberately textual
// (regex over C#/Razor/SQL); every emitted record carries the exact file and line so a
// reviewer can verify it. Nothing here is a compiler-grade analysis and nothing here
// mutates the source checkout.
//
// Usage: node scripts/migration/inventory.mjs [--source tmp/AuditSphere] [--out docs/migration/inventory]

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const sourceRoot = path.resolve(arg('--source', 'tmp/AuditSphere'));
const outDir = path.resolve(arg('--out', 'docs/migration/inventory'));

if (!existsSync(sourceRoot)) {
  console.error('Source checkout not found at ' + sourceRoot + '. Clone nirzaf/AuditSphere at the pinned commit first.');
  process.exit(1);
}

async function walk(dir, filter, acc = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['bin', 'obj', 'node_modules', '.git'].includes(entry.name)) continue;
      await walk(full, filter, acc);
    } else if (filter(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const rel = (file) => path.relative(sourceRoot, file).split(path.sep).join('/');
const lines = (text) => text.split(/\r?\n/);

// --- 1. Manifest and project layout -------------------------------------------------
const projects = ['AuditSphereOps.Application', 'AuditSphereOps.Domain', 'AuditSphereOps.Infrastructure', 'AuditSphereOps.Web', 'AuditSphereOps.Worker'];
const csFiles = await walk(path.join(sourceRoot, 'src'), (n) => n.endsWith('.cs'));
const razorFiles = await walk(path.join(sourceRoot, 'src'), (n) => n.endsWith('.razor'));
const testFiles = await walk(path.join(sourceRoot, 'tests'), () => true);
const sqlFiles = await walk(path.join(sourceRoot, 'src'), (n) => n.endsWith('.sql'));
const docFiles = await walk(path.join(sourceRoot, 'docs'), (n) => n.endsWith('.md'));

const projectCounts = {};
for (const p of projects) {
  projectCounts[p] = csFiles.filter((f) => rel(f).startsWith('src/' + p + '/')).length;
}

// --- 2. DbSet -> table mapping ------------------------------------------------------
const dbContextFiles = csFiles.filter((f) => /AuditSphereDbContext.*\.cs$/.test(f));
const dbSets = [];
const tableBindings = [];
for (const file of dbContextFiles) {
  const text = await readFile(file, 'utf8');
  lines(text).forEach((line, i) => {
    const dbSet = line.match(/DbSet<([A-Za-z0-9_]+)>\s+([A-Za-z0-9_]+)\s*=>/);
    if (dbSet) dbSets.push({ entity: dbSet[1], property: dbSet[2], file: rel(file), line: i + 1, context: path.basename(file) });
  });
  const entityVars = new Map();
  lines(text).forEach((line, i) => {
    const decl = line.match(/var\s+([A-Za-z0-9_]+)\s*=\s*b\.Entity<([A-Za-z0-9_]+)>\(\)/);
    if (decl) entityVars.set(decl[1], { entity: decl[2], line: i + 1 });
    const toTable = line.match(/([A-Za-z0-9_]+)\.ToTable\("([^"]+)"([^)]*)/);
    if (toTable && entityVars.has(toTable[1])) {
      tableBindings.push({ entity: entityVars.get(toTable[1]).entity, variable: toTable[1], table: toTable[2], file: rel(file), line: i + 1 });
    }
  });
}

// --- 3. Decimal / precision declarations -------------------------------------------
const precision = [];
for (const file of [...csFiles, ...sqlFiles]) {
  const text = await readFile(file, 'utf8');
  lines(text).forEach((line, i) => {
    const hasPrecision = line.match(/HasPrecision\(\s*(\d+)\s*,\s*(\d+)\s*\)|HasColumnType\("numeric\((\d+),(\d+)\)"\)|decimal\((\d+)\s*,\s*(\d+)\)/);
    if (hasPrecision) {
      precision.push({ file: rel(file), line: i + 1, raw: line.trim().slice(0, 200) });
    }
  });
}

// --- 4. Money-bearing domain properties --------------------------------------------
const moneyProperties = [];
const domainRoot = path.join(sourceRoot, 'src', 'AuditSphereOps.Domain');
for (const file of csFiles.filter((f) => f.startsWith(domainRoot))) {
  const text = await readFile(file, 'utf8');
  lines(text).forEach((line, i) => {
    const match = line.match(/public\s+(?:required\s+)?decimal(?:\?)?\s+([A-Za-z0-9_]+)\s*\{/);
    if (match) moneyProperties.push({ entity: path.basename(file, '.cs'), property: match[1], file: rel(file), line: i + 1 });
  });
}

// --- 5. Application capability surfaces --------------------------------------------
const applicationRoot = path.join(sourceRoot, 'src', 'AuditSphereOps.Application');
const capabilitySurfaces = [];
for (const file of csFiles.filter((f) => f.startsWith(applicationRoot))) {
  const text = await readFile(file, 'utf8');
  const kind = /\b(?:class|record|interface|struct)\s+([A-Za-z0-9_]+)/.exec(text);
  if (!kind) continue;
  const relative = rel(file);
  capabilitySurfaces.push({
    capability: relative.split('/')[2] || 'root',
    name: kind[1],
    file: relative,
    bytes: (await stat(file)).size,
  });
}
const capabilitySummary = {};
for (const surface of capabilitySurfaces) {
  capabilitySummary[surface.capability] = capabilitySummary[surface.capability] || { files: 0, types: [] };
  capabilitySummary[surface.capability].files += 1;
  capabilitySummary[surface.capability].types.push(surface.name);
}

// --- 6. Razor routes ----------------------------------------------------------------
const routes = [];
for (const file of razorFiles) {
  const text = await readFile(file, 'utf8');
  lines(text).forEach((line, i) => {
    const match = line.match(/^@page\s+"([^"]+)"/);
    if (match) routes.push({ route: match[1], component: path.basename(file), file: rel(file), line: i + 1 });
  });
}

// --- 7. Durable job / hosted-service surfaces ---------------------------------------
const jobs = [];
for (const file of csFiles) {
  const text = await readFile(file, 'utf8');
  lines(text).forEach((line, i) => {
    const match = line.match(/class\s+([A-Za-z0-9_]*(?:Worker|Job|Scheduler|Dispatcher|Handler|HostedService)[A-Za-z0-9_]*)/);
    if (match) jobs.push({ type: match[1], file: rel(file), line: i + 1 });
  });
}

// --- 8. Tests ------------------------------------------------------------------------
const tests = [];
for (const file of testFiles) {
  const relative = rel(file);
  if (!relative.endsWith('.cs')) continue;
  const text = await readFile(file, 'utf8');
  const facts = (text.match(/\[(Fact|Theory)\]/g) || []).length;
  tests.push({ file: relative, testMethods: facts });
}

// --- 9. Migration files (EF Core migrations are .cs; keep SQL support for completeness)
const migrationFiles = [...csFiles.filter((f) => /Persistence\/Migrations\/.*\.cs$/.test(rel(f)) && !f.endsWith('.Designer.cs')), ...sqlFiles];
const migrations = [];
const numericTypes = {};
for (const file of migrationFiles) {
  const text = await readFile(file, 'utf8');
  const created = [
    ...text.matchAll(/CreateTable\(\s*name:\s*"([a-z0-9_]+)"/g),
    ...text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-z0-9_]+)"?/gi),
  ].map((m) => m[1]);
  for (const match of text.matchAll(/numeric\((\d+)\s*,\s*(\d+)\)/g)) {
    const key = match[1] + ',' + match[2];
    numericTypes[key] = (numericTypes[key] || 0) + 1;
  }
  migrations.push({ file: rel(file), createTable: created, bytes: (await stat(file)).size });
}
const createdTables = [...new Set(migrations.flatMap((m) => m.createTable))].sort();

// --- 10. Emit ------------------------------------------------------------------------
await mkdir(outDir, { recursive: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/migration/inventory.mjs',
  extractionMethod: 'textual (regex) over pinned C#/Razor/SQL; not compiler-verified',
  sourceRoot: path.relative(process.cwd(), sourceRoot).split(path.sep).join('/'),
  sourceCommit: (() => { try { return execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } })(),
  sourceWorktreeClean: (() => { try { return execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim().length === 0; } catch { return null; } })(),
  counts: {
    csFiles: csFiles.length,
    razorFiles: razorFiles.length,
    testFiles: testFiles.filter((f) => f.endsWith('.cs')).length,
    sqlFiles: sqlFiles.length,
    docFiles: docFiles.length,
    dbSets: dbSets.length,
    tableBindings: tableBindings.length,
    migrationFiles: migrations.length,
    createdTables: createdTables.length,
    razorRoutes: routes.length,
    jobSurfaces: jobs.length,
  },
  projectCounts,
  capabilitySummary,
};

const tables = tableBindings.map((binding) => ({
  table: binding.table,
  entity: binding.entity,
  boundViaVariable: binding.variable,
  declaredAsDbSet: dbSets.find((d) => d.property === binding.variable)?.property ?? null,
  file: binding.file,
  line: binding.line,
}));

await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(outDir, 'schema.json'), JSON.stringify({ generatedAt: manifest.generatedAt, dbSets, tableBindings, tables, precision, moneyProperties, migrations, createdTables, numericTypes }, null, 2) + '\n');
await writeFile(path.join(outDir, 'capabilities.json'), JSON.stringify({ generatedAt: manifest.generatedAt, capabilitySummary, capabilitySurfaces }, null, 2) + '\n');
await writeFile(path.join(outDir, 'routes.json'), JSON.stringify({ generatedAt: manifest.generatedAt, routes }, null, 2) + '\n');
await writeFile(path.join(outDir, 'jobs.json'), JSON.stringify({ generatedAt: manifest.generatedAt, jobs }, null, 2) + '\n');
await writeFile(path.join(outDir, 'tests.json'), JSON.stringify({ generatedAt: manifest.generatedAt, tests }, null, 2) + '\n');

const numericRows = Object.entries(numericTypes).sort((a, b) => b[1] - a[1]);
const summaryLines = [
  '# Source inventory summary',
  '',
  'Generated by `scripts/migration/inventory.mjs` from ' + manifest.sourceRoot + ' at ' + manifest.generatedAt + '.',
  '',
  'Extraction is textual (regex over C#/Razor/EF migrations). It reports what it found and does not',
  'claim compiler-grade completeness. Review each JSON artifact at the referenced file and line.',
  '',
  '## Counts',
  '',
  '| Artifact | Count |',
  '| --- | ---: |',
  '| C# files (src) | ' + manifest.counts.csFiles + ' |',
  '| Razor components (src) | ' + manifest.counts.razorFiles + ' |',
  '| Source test files | ' + manifest.counts.testFiles + ' |',
  '| EF migration files | ' + manifest.counts.migrationFiles + ' |',
  '| Distinct created tables | ' + manifest.counts.createdTables + ' |',
  '| Documentation files | ' + manifest.counts.docFiles + ' |',
  '| EF DbSet declarations | ' + manifest.counts.dbSets + ' |',
  '| ToTable bindings | ' + manifest.counts.tableBindings + ' |',
  '| Registered Razor routes | ' + manifest.counts.razorRoutes + ' |',
  '| Durable job / hosted-service types | ' + manifest.counts.jobSurfaces + ' |',
  '',
  '## Project file counts',
  '',
  '| Project | C# files |',
  '| --- | ---: |',
  ...Object.entries(projectCounts).map(([p, n]) => '| ' + p + ' | ' + n + ' |'),
  '',
  '## Application capability folders',
  '',
  '| Capability folder | Types |',
  '| --- | ---: |',
  ...Object.entries(capabilitySummary).sort().map(([c, v]) => '| ' + c + ' | ' + v.files + ' |'),
  '',
  '## Declared numeric precisions in migrations',
  '',
  '| numeric(p,s) | Occurrences |',
  '| --- | ---: |',
  ...numericRows.map(([k, n]) => '| numeric(' + k + ') | ' + n + ' |'),
  '',
].join('\n');
await writeFile(path.join(outDir, 'SUMMARY.md'), summaryLines);
console.log(JSON.stringify(manifest.counts, null, 2));
console.log('Wrote inventory to ' + path.relative(process.cwd(), outDir));
