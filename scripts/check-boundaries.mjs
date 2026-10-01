import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modules = ['commercial','governance','fieldwork','reporting','practice'];
export function violations(source, owner) {
  const errors = [];
  if (owner === 'web' && /@auditsphere\/server|@prisma\/|packages\/server/.test(source)) errors.push('browser imports server persistence');
  if (/from\s*['"][^'"]*apps\/(api|worker)\/src/.test(source)) errors.push('shared code imports app entrypoint');
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) for (const other of modules.filter(m => m !== owner)) if (match[1].includes(`../${other}/`) && !match[1].endsWith(`/${other}/public.js`)) errors.push(`${owner} imports private ${other} implementation`);
  return errors;
}
export function check() {
  const errors = [];
  for (const owner of [...modules, 'web']) {
    const base = owner === 'web' ? 'apps/web/src' : `packages/server/src/modules/${owner}`;
    for (const file of readdirSync(base, {recursive:true}).filter(f => f.endsWith('.ts'))) for (const message of violations(readFileSync(`${base}/${file}`, 'utf8'), owner)) errors.push(`${base}/${file}: ${message}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Module and browser import boundaries passed');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) check();
