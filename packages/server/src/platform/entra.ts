import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export type EntraConfig = { tenantId: string; audience: string; scope: string };
export class EntraIdentity {
  private readonly keys: JWTVerifyGetKey;
  constructor(private readonly config: EntraConfig, keys?: JWTVerifyGetKey) {
    if (!/^[0-9a-f-]{36}$/i.test(config.tenantId) || !config.audience || !config.scope) throw new Error('Invalid Entra API configuration');
    this.keys = keys || createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
  }
  async authenticate(token: string) {
    const { payload } = await jwtVerify(token, this.keys, { issuer: `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`, audience: this.config.audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'oid', 'tid'] });
    if (payload.tid !== this.config.tenantId || typeof payload.oid !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.oid) || typeof payload.scp !== 'string' || !payload.scp.split(' ').includes(this.config.scope)) throw new Error('Entra API scope or tenant denied');
    if (!Number.isSafeInteger(payload.iat)) throw new Error('Entra API token issue time is invalid');
    return { tenantId: this.config.tenantId, objectId: payload.oid, issuedAt: payload.iat! };
  }
}
let identity: EntraIdentity | undefined;
export function configuredEntraIdentity() {
  return identity ||= new EntraIdentity({ tenantId: process.env.M365_TENANT_ID || '', audience: process.env.ENTRA_API_AUDIENCE || '', scope: process.env.ENTRA_API_SCOPE || '' });
}
