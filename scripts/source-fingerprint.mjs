import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function sourceFingerprint() {
  const paths = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'Dockerfile', 'angular.json', 'prisma.config.ts', 'tsconfig.json', 'tsconfig.server.json'];
  function visit(base) { for (const item of readdirSync(base, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'generated'].includes(item.name)) continue;
    const path = `${base}/${item.name}`;
    if (item.isDirectory()) visit(path); else paths.push(path);
  } }
  for (const directory of ['apps', 'packages', 'scripts', 'prisma']) visit(directory);
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(path).update('\0').update(readFileSync(path)).update('\0');
  return hash.digest('hex');
}
