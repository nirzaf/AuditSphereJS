from pathlib import Path
import json, re, shutil
root=Path(__file__).resolve().parents[1]
def write(path, value):
    p=root/path; p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text((json.dumps(value,indent=2) if isinstance(value,dict) else value).strip()+'\n',encoding='utf-8')
old=json.loads((root/'package.json').read_text())
pins=json.loads((root/'docs/evidence/T005/candidate-pins.json').read_text())
allpins={**old['dependencies'],**old['devDependencies'],**pins}
def subset(names): return {n:allpins[n] for n in names.split()}
server=root/'packages/server/src'; server.mkdir(parents=True,exist_ok=True)
for directory in ['modules','platform']:
    origin=root/'apps/api/src'/directory
    target=server/directory
    if target.exists(): raise RuntimeError('Target already exists')
    shutil.move(str(origin),str(target))
worker=(root/'apps/worker/src/main.ts').read_text()
worker=worker.replace('../../api/src/platform/db','./platform/db').replace('../../api/src/platform/storage','./platform/storage').replace('../../api/src/modules/fieldwork/parser','./modules/fieldwork/parser')
worker=worker.replace('async function main()', 'export async function runWorker()')
worker=worker[:worker.rfind("main().catch")]
write('packages/server/src/worker.ts',worker)
for p in server.rglob('*.ts'):
    s=p.read_text().replace('../../../../../packages/contracts/src','@auditsphere/contracts')
    if p.name=='db.ts': s=s.replace("'@prisma/client'","'../generated/prisma/client'")
    else: s=s.replace("'@prisma/client'","'../../generated/prisma/client'")
    s=re.sub(r"(from\s+['\"])(\.[^'\"]+)(['\"])",lambda m:m[1]+m[2]+('' if Path(m[2]).suffix else '.js')+m[3],s)
    p.write_text(s,encoding='utf-8')
write('packages/server/src/index.ts', '''export { db } from './platform/db.js';
export { InternalGuard, fixtureUser } from './platform/auth.js';
export { FieldworkController } from './modules/fieldwork/controller.js';
export { parseTrialBalance } from './modules/fieldwork/parser.js';
export { runWorker } from './worker.js';
export { ensureBucket, store, retrieve } from './platform/storage.js';''')
api=(root/'apps/api/src/main.ts').read_text()
api=api.replace("import { FieldworkController } from './modules/fieldwork/controller';\nimport { InternalGuard } from './platform/auth';\nimport { db } from './platform/db';", "import { FieldworkController, InternalGuard, db } from '@auditsphere/server';")
write('apps/api/src/main.ts',api)
write('apps/worker/src/main.ts',"import 'reflect-metadata';\nimport 'dotenv/config';\nimport { runWorker } from '@auditsphere/server';\nrunWorker().catch(error => { console.error(error); process.exitCode = 1; });")
for base in ['tests','scripts','prisma']:
    for p in (root/base).rglob('*.ts'):
        s=p.read_text()
        s=re.sub(r"from ['\"][^'\"]*packages/contracts/src['\"]", "from '@auditsphere/contracts'",s)
        s=re.sub(r"from ['\"][^'\"]*apps/api/src/(?:modules/fieldwork/parser|platform/db|platform/auth)['\"]", "from '@auditsphere/server'",s)
        p.write_text(s,encoding='utf-8')
web=(root/'apps/web/src/main.ts').read_text().replace("from '../../../packages/contracts/src'", "from '@auditsphere/contracts'")
write('apps/web/src/main.ts',web)
schema=(root/'prisma/schema.prisma').read_text().replace('provider = "prisma-client-js"','provider = "prisma-client"\n  output = "../packages/server/src/generated/prisma"\n  moduleFormat = "esm"')
write('prisma/schema.prisma',schema)
base={'compilerOptions':{'target':'ES2023','module':'NodeNext','moduleResolution':'NodeNext','experimentalDecorators':True,'emitDecoratorMetadata':True,'strict':True,'esModuleInterop':True,'skipLibCheck':True,'declaration':True,'composite':True,'sourceMap':True,'ignoreDeprecations':'6.0'}}
write('tsconfig.server.json',base)
write('tsconfig.json',{'files':[],'references':[{'path':x} for x in ['packages/contracts','packages/server','apps/api','apps/worker']]})
for path,refs in [('packages/contracts',[]),('packages/server',['../contracts']),('apps/api',['../../packages/server']),('apps/worker',['../../packages/server'])]:
    write(path+'/tsconfig.json',{'extends':'../../tsconfig.server.json','compilerOptions':{'rootDir':'src','outDir':'dist','tsBuildInfoFile':'dist/.tsbuildinfo'},'include':['src/**/*.ts'],'references':[{'path':x} for x in refs]})
exports={'.':{'types':'./dist/index.d.ts','import':'./dist/index.js'}}
write('packages/contracts/package.json',{'name':'@auditsphere/contracts','private':True,'version':'0.1.0','type':'module','exports':exports,'dependencies':subset('zod')})
serverdeps=subset('@nestjs/common @nestjs/core @nestjs/swagger @nestjs/bullmq @nestjs/websockets @nestjs/platform-socket.io @prisma/client @prisma/adapter-pg pg bullmq ioredis csv-parse @aws-sdk/client-s3 reflect-metadata rxjs dotenv playwright socket.io zod')
serverdeps['@auditsphere/contracts']='workspace:*'
write('packages/server/package.json',{'name':'@auditsphere/server','private':True,'version':'0.1.0','type':'module','exports':exports,'dependencies':serverdeps})
apideps=subset('@nestjs/common @nestjs/core @nestjs/platform-fastify @nestjs/swagger fastify @fastify/static @fastify/helmet @fastify/cookie @fastify/csrf-protection @fastify/rate-limit reflect-metadata rxjs dotenv'); apideps['@auditsphere/server']='workspace:*'
write('apps/api/package.json',{'name':'@auditsphere/api','private':True,'version':'0.1.0','type':'module','dependencies':apideps})
write('apps/worker/package.json',{'name':'@auditsphere/worker','private':True,'version':'0.1.0','type':'module','dependencies':{'@auditsphere/server':'workspace:*','reflect-metadata':allpins['reflect-metadata'],'dotenv':allpins['dotenv']}})
webdeps=subset('@angular/core @angular/common @angular/compiler @angular/platform-browser @angular/forms @angular/router @angular/material @angular/cdk rxjs tslib'); webdeps['@auditsphere/contracts']='workspace:*'
write('apps/web/package.json',{'name':'@auditsphere/web','private':True,'version':'0.1.0','type':'module','dependencies':webdeps})
tools=subset('typescript @types/node @types/pg prisma vitest @angular/cli @angular/build @angular/compiler-cli @playwright/test concurrently tsx @nestjs/cli @nestjs/schematics jsdom testcontainers @testcontainers/postgresql eslint angular-eslint typescript-eslint prettier openapi-typescript socket.io-client dotenv zod')
write('package.json',{'name':'auditsphere','private':True,'type':'module','packageManager':'pnpm@12.8.1','engines':{'node':'>=24.15.0 <25'},'scripts':{**old['scripts'],'build:server':'prisma generate && tsc -b','build':'pnpm build:server && ng build web','typecheck':'pnpm build:server && tsc -p tsconfig.tests.json --noEmit && ng build web','dev:api':'node --watch apps/api/dist/main.js','dev:worker':'node --watch apps/worker/dist/main.js','dev':'pnpm build:server && concurrently -n compile,api,worker,web "tsc -b --watch" "pnpm dev:api" "pnpm dev:worker" "pnpm dev:web"','test:unit':'vitest run && ng test web --watch=false','test:integration':'node --import tsx --test tests/foundation.integration.ts','lint':'eslint . && pnpm boundaries','verify:task':'node scripts/verify-task.mjs','verify:all':'pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm test:e2e','dependencies:check':'node scripts/dependency-evidence.mjs','contracts:generate':'node scripts/contracts.mjs generate','contracts:check':'node scripts/contracts.mjs check'},'dependencies':{'@auditsphere/contracts':'workspace:*','@auditsphere/server':'workspace:*'},'devDependencies':tools})
write('tsconfig.tests.json',{'extends':'./tsconfig.server.json','compilerOptions':{'composite':False,'declaration':False,'noEmit':True},'include':['tests/**/*.ts','scripts/**/*.ts','prisma/seed.ts']})
write('pnpm-workspace.yaml', '''packages:
  - apps/*
  - packages/*
strictPeerDependencies: true
engineStrict: true
saveExact: true
allowBuilds:
  esbuild: true
  '@nestjs/core': true
  '@prisma/engines': true
  prisma: true
  '@parcel/watcher': true
  lmdb: true
  msgpackr-extract: true
  '@scarf/scarf': false
  cpu-features: false
  ssh2: false''')
write('.npmrc','# Registry/auth settings only. pnpm 12 build and peer policies are in pnpm-workspace.yaml.')
write('.node-version','24.21.0')
write('docs/AGENTS.md','Follow the root ../AGENTS.md. Task definitions and execution ledger are under docs/tasks and docs/guides. User decisions recorded in docs/decisions take precedence over earlier pending defaults; do not fabricate external acceptance evidence.')
register=json.loads((root/'docs/decisions/register.json').read_text())
for record in register:
    record.update(status='APPROVED_IMPLEMENTATION_DEFAULT',namedOwner='Codex, implementation defaults delegated by the user',approvedBy='User delegation to Codex',approvedAt='2026-10-01',approvalEvidence='User explicitly said: ignore it, you approve it',professionalCertification=False)
write('docs/decisions/register.json',register)
print('Shared server and explicit ESM package ownership prepared. Existing data preserved.')
