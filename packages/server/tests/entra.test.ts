import { it, expect } from 'vitest';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { EntraIdentity } from '../src/platform/entra.js';
const tenantId = '11111111-1111-4111-8111-111111111111';
const objectId = '22222222-2222-4222-8222-222222222222';
it('accepts only signed tenant-specific API tokens with delegated scope', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test' }] });
  const identity = new EntraIdentity({ tenantId, audience: 'audit-api', scope: 'access_as_user' }, keys);
  const token = (audience = 'audit-api', scope = 'access_as_user', tid = tenantId, expires = '2m', issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`) => new SignJWT({
    tid, oid: objectId, scp: scope,
    wids: ['synthetic-global-administrator-role-id'], roles: ['Global Administrator'],
  }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expires).sign(privateKey);
  const valid = await identity.authenticate(await token());
  expect(valid).toMatchObject({ tenantId, objectId });
  expect(Object.keys(valid).sort()).toEqual(['issuedAt', 'objectId', 'tenantId']);
  expect(valid).not.toHaveProperty('wids');
  expect(valid).not.toHaveProperty('roles');
  expect(Number.isSafeInteger(valid.issuedAt)).toBe(true);
  await expect(identity.authenticate(await token('https://graph.microsoft.com'))).rejects.toThrow();
  await expect(identity.authenticate(await token('audit-api', 'access_as_user', tenantId, '2m', 'https://attacker.example/v2.0'))).rejects.toThrow();
  await expect(identity.authenticate(await token('audit-api', 'unrelated'))).rejects.toThrow();
  await expect(identity.authenticate(await token('audit-api', 'access_as_user', objectId))).rejects.toThrow();
  await expect(identity.authenticate(await token('audit-api', 'access_as_user', tenantId, '-1m'))).rejects.toThrow();
  await expect(identity.authenticate('not-a-jwt')).rejects.toThrow();
});
