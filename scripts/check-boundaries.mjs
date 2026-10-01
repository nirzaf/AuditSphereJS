import { readdirSync, readFileSync } from 'node:fs';
const modules = ['commercial','governance','fieldwork','reporting','practice'];
let errors = [];
for (const module of modules) { const base = `packages/server/src/modules/${module}`; for (const file of readdirSync(base, {recursive:true}).filter(f=>f.endsWith('.ts'))) { const text = readFileSync(`${base}/${file}`, 'utf8'); for (const other of modules.filter(m=>m!==module)) if (text.includes(`../${other}/`)) errors.push(`${module}/${file} imports ${other}`); } }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); } console.log('Module import boundaries passed');
