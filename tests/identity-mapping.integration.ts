import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const image = 'postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';

test('Entra identity mapping binds only an existing active user and never provisions authorization', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer(image).withDatabase('identity_mapping').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db } = await import('@auditsphere/server');
    const { inspectEntraIdentityMapping, mapEntraIdentityToExistingUser } = await import('../packages/server/src/platform/entra-user-mapping.js');
    try {
      const tenantId = randomUUID();
      const objectId = randomUUID();
      const localUserId = randomUUID();
      const inactiveUserId = randomUUID();
      const competingUserId = randomUUID();
      const claimedUserId = randomUUID();
      const racingUserId = randomUUID();
      const cliUserId = randomUUID();
      const unmatched = { localUserId, tenantId, objectId };
      await db.user.createMany({ data: [
        { id: localUserId, email: `${localUserId}@example.test`, role: 'PREPARER' },
        { id: inactiveUserId, email: `${inactiveUserId}@example.test`, role: 'PREPARER', active: false },
        { id: competingUserId, email: `${competingUserId}@example.test`, role: 'PREPARER' },
        { id: claimedUserId, email: `${claimedUserId}@example.test`, role: 'PREPARER' },
        { id: racingUserId, email: `${racingUserId}@example.test`, role: 'PREPARER' },
        { id: cliUserId, email: `${cliUserId}@example.test`, role: 'PREPARER' },
      ] });

      assert.deepEqual(await inspectEntraIdentityMapping(unmatched), { localUserId, status: 'READY' });
      assert.deepEqual(await mapEntraIdentityToExistingUser(unmatched), { localUserId, changed: true });
      assert.deepEqual(await mapEntraIdentityToExistingUser(unmatched), { localUserId, changed: false }, 'exact replay is idempotent');
      assert.equal(await db.roleGrant.count({ where: { userId: localUserId } }), 0, 'identity binding does not grant capabilities');
      assert.equal(await db.membership.count({ where: { userId: localUserId } }), 0, 'identity binding does not assign engagements');
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: localUserId } })).role, 'PREPARER', 'directory identity does not change the local role');

      const cliTenantId = randomUUID();
      const cliObjectId = randomUUID();
      const cliArgs = ['--local-user-id', cliUserId, '--tenant-id', cliTenantId, '--object-id', cliObjectId];
      const cliEnv = { ...process.env, M365_TENANT_ID: cliTenantId };
      const dryRun = execFileSync(process.execPath, ['--import', 'tsx', 'packages/server/scripts/map-entra-identity.ts', ...cliArgs], { env: cliEnv, encoding: 'utf8', timeout: 30_000, stdio: 'pipe' });
      assert.match(dryRun, /Dry run valid.*no database change made/);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: cliUserId } })).tenantId, null, 'CLI default must not modify the user');
      const applied = execFileSync(process.execPath, ['--import', 'tsx', 'packages/server/scripts/map-entra-identity.ts', ...cliArgs, '--apply'], { env: cliEnv, encoding: 'utf8', timeout: 30_000, stdio: 'pipe' });
      assert.match(applied, /Mapped Entra identity.*No memberships or role grants were created/);
      const cliUser = await db.user.findUniqueOrThrow({ where: { id: cliUserId } });
      assert.equal(cliUser.tenantId, cliTenantId);
      assert.equal(cliUser.entraObjectId, cliObjectId);
      assert.equal(await db.roleGrant.count({ where: { userId: cliUserId } }), 0);
      assert.equal(await db.membership.count({ where: { userId: cliUserId } }), 0);

      await assert.rejects(inspectEntraIdentityMapping({ ...unmatched, localUserId: randomUUID() }), /does not exist/);
      await assert.rejects(inspectEntraIdentityMapping({ ...unmatched, localUserId: inactiveUserId }), /inactive/);
      await assert.rejects(mapEntraIdentityToExistingUser({ ...unmatched, localUserId, objectId: randomUUID() }), /already has an Entra identity mapping/);

      const claimedTenantId = randomUUID();
      const claimedObjectId = randomUUID();
      await db.user.update({ where: { id: claimedUserId }, data: { tenantId: claimedTenantId, entraObjectId: claimedObjectId } });
      await assert.rejects(inspectEntraIdentityMapping({ localUserId: competingUserId, tenantId: claimedTenantId, objectId: claimedObjectId }), /already mapped to another local user/);
      await assert.rejects(inspectEntraIdentityMapping({ localUserId: competingUserId, tenantId: 'not-a-uuid', objectId }), /must be UUIDs/);

      const raceTenantId = randomUUID();
      const raceObjectId = randomUUID();
      const contenders = [
        mapEntraIdentityToExistingUser({ localUserId: competingUserId, tenantId: raceTenantId, objectId: raceObjectId }),
        mapEntraIdentityToExistingUser({ localUserId: racingUserId, tenantId: raceTenantId, objectId: raceObjectId }),
      ];
      const outcomes = await Promise.allSettled(contenders);
      assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1, 'only one concurrent mapping can claim an Entra identity');
      assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(await db.user.count({ where: { tenantId: raceTenantId, entraObjectId: raceObjectId } }), 1);
      console.log('active-only Entra mapping, idempotence, no implicit grants, conflict denial and concurrent uniqueness passed');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
