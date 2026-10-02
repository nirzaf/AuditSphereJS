import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const userId = '29292929-2929-4929-8929-292929292929';
const tenantId = '30303030-3030-4030-8030-303030303030';
const objectId = '31313131-3131-4131-8131-313131313131';

test('Entra self-revocation invalidates old tokens and preserves tokens issued after the cutoff', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_session_revocation').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, AUTH_PROVIDER: 'entra' });
    const { db, authenticateEntraActor, revokeCurrentUserSessions } = await import('../dist/index.js');
    disconnect = () => db.$disconnect();
    await db.user.create({ data: { id: userId, email: 'session-user@example.test', role: 'PREPARER', tenantId, entraObjectId: objectId } });

    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'session-test' }] });
    const { EntraIdentity } = await import('../dist/platform/entra.js');
    const entra = new EntraIdentity({ tenantId, audience: 'audit-api', scope: 'access_as_user' }, keys);
    const token = (issuedAt: number) => new SignJWT({ tid: tenantId, oid: objectId, scp: 'access_as_user' })
      .setProtectedHeader({ alg: 'RS256', kid: 'session-test' })
      .setIssuer(`https://login.microsoftonline.com/${tenantId}/v2.0`)
      .setAudience('audit-api').setIssuedAt(issuedAt).setExpirationTime(issuedAt + 300).sign(privateKey);

    const oldToken = await token(Math.floor((Date.now() - 5_000) / 1000));
    assert.equal(await authenticateEntraActor(entra, oldToken), userId);
    const revocation = await revokeCurrentUserSessions(userId);
    const cutoff = new Date(revocation.revokedBefore);
    assert.equal(await db.identitySessionRevocation.count({ where: { userId } }), 1);
    await assert.rejects(authenticateEntraActor(entra, oldToken), /revoked/i);

    while (Date.now() < cutoff.getTime()) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(await authenticateEntraActor(entra, await token(Math.floor(Date.now() / 1000))), userId);
    await assert.rejects(db.$executeRawUnsafe('UPDATE "IdentitySessionRevocation" SET "revokedBefore" = now() WHERE "userId" = $1::uuid', userId), /append-only/i);
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM "IdentitySessionRevocation" WHERE "userId" = $1::uuid', userId), /append-only/i);
  } finally {
    await disconnect?.();
    await container.stop();
  }
});
