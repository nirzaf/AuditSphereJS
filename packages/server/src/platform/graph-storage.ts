import { createHash } from 'node:crypto';

/** A resolved client repository. Drive and folder always come from the client binding. */
export type GraphRepository = { driveId: string; folderId: string; purpose?: 'evidence' | 'working' };
export type GraphReference = { driveId: string; itemId: string; versionId: string; eTag: string; sha256: string; sizeBytes: number };
const graph = 'https://graph.microsoft.com/v1.0';
const encode = (value: string) => encodeURIComponent(value);
const sha = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const encodeReference = (reference: GraphReference) => 'graph:' + Buffer.from(JSON.stringify(reference)).toString('base64url');
export function decodeGraphReference(reference: string): GraphReference {
  if (!reference.startsWith('graph:')) throw new Error('Invalid Graph object reference');
  const parsed = JSON.parse(Buffer.from(reference.slice(6), 'base64url').toString()) as Partial<GraphReference>;
  if (!parsed.driveId || !parsed.itemId || !parsed.versionId || !parsed.eTag || !parsed.sha256 || !/^[a-f0-9]{64}$/.test(parsed.sha256)) throw new Error('Invalid Graph object identity');
  if (!Number.isInteger(parsed.sizeBytes) || (parsed.sizeBytes as number) < 0) throw new Error('Invalid Graph object size');
  return parsed as GraphReference;
}

/**
 * Server-only Graph adapter. Access tokens and preauthenticated URLs never leave this module.
 *
 * Every write is bound to a client repository and records the provider's immutable version id.
 * Reads use the version endpoint, so an externally changed current item no longer breaks an
 * existing evidence reference and cannot silently substitute newer bytes.
 */
export class GraphStorage {
  private token?: { value: string; expires: number };
  constructor(private readonly config: { tenantId: string; clientId: string; clientSecret: string }, private readonly request: typeof fetch = fetch) {}
  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const response = await this.request(`https://login.microsoftonline.com/${encode(this.config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }), signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Graph authentication failed (${response.status})`);
    const data = await response.json() as { access_token: string; expires_in: number };
    if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error('Invalid Graph token response');
    this.token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }
  async put(repository: GraphRepository, filename: string, body: Uint8Array): Promise<string> {
    if (!repository.driveId || !repository.folderId) throw new Error('A client repository binding is required');
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) throw new Error('Invalid storage filename');
    if (body.byteLength > 250 * 1024 * 1024) throw new Error('File requires a Graph upload session');
    const token = await this.accessToken();
    const response = await this.request(`${graph}/drives/${encode(repository.driveId)}/items/${encode(repository.folderId)}:/${encode(filename)}:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(body), redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Graph upload failed (${response.status})`);
    const item = await response.json() as { id?: string; eTag?: string };
    if (!item.id) throw new Error('Graph upload returned no item identity');
    const versions = await this.request(`${graph}/drives/${encode(repository.driveId)}/items/${encode(item.id)}/versions?$top=1&$select=id,eTag,size`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!versions.ok) throw new Error(`Graph version lookup failed (${versions.status})`);
    const latest = (await versions.json() as { value?: Array<{ id?: string; eTag?: string; size?: number }> }).value?.[0];
    if (!latest?.id || !latest.eTag) throw new Error('Graph returned no immutable version identity');
    const reference: GraphReference = { driveId: repository.driveId, itemId: item.id, versionId: latest.id, eTag: latest.eTag, sha256: sha(body), sizeBytes: body.byteLength };
    return encodeReference(reference);
  }
  async get(repository: GraphRepository, reference: string): Promise<Buffer> {
    const parsed = decodeGraphReference(reference);
    if (parsed.driveId !== repository.driveId) throw new Error('Evidence does not belong to this client repository');
    const base = `${graph}/drives/${encode(parsed.driveId)}/items/${encode(parsed.itemId)}/versions/${encode(parsed.versionId)}`;
    const token = await this.accessToken();
    const metadata = await this.request(base, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!metadata.ok) throw new Error(`Graph version metadata failed (${metadata.status})`);
    if ((await metadata.json() as { eTag?: string }).eTag !== parsed.eTag) throw new Error('Stored evidence version was changed outside AuditSphere');
    let response = await this.request(`${base}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status === 302) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Missing Graph download location');
      const target = new URL(location);
      if (target.protocol !== 'https:' || target.username || target.password || !target.hostname.endsWith('.sharepoint.com')) throw new Error('Untrusted Graph download host');
      // The redirect URL authenticates itself. Never forward the Graph bearer token.
      response = await this.request(target, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
    }
    if (!response.ok) throw new Error(`Graph download failed (${response.status})`);
    const body = Buffer.from(await response.arrayBuffer());
    if (sha(body) !== parsed.sha256) throw new Error('Stored evidence failed SHA-256 verification');
    if (body.byteLength !== parsed.sizeBytes) throw new Error('Stored evidence size does not match its version identity');
    return body;
  }
}

export function configuredGraphStorage(env = process.env) {
  for (const name of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET'] as const) if (!env[name]) throw new Error(`Missing storage configuration: ${name}`);
  if (!/^[0-9a-f-]{36}$/i.test(env.M365_TENANT_ID!)) throw new Error('M365_TENANT_ID must be a tenant UUID');
  return new GraphStorage({ tenantId: env.M365_TENANT_ID!, clientId: env.M365_CLIENT_ID!, clientSecret: env.M365_CLIENT_SECRET! });
}
