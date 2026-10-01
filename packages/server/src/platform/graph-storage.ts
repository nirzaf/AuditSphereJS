import { createHash } from 'node:crypto';

type DriveReference = { driveId: string; itemId: string; eTag: string; sha256: string };
const graph = 'https://graph.microsoft.com/v1.0';
const encode = encodeURIComponent;
const sha = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');

/** Server-only app credential; access tokens and preauthenticated URLs never leave this adapter. */
export class GraphStorage {
  private token?: { value: string; expires: number };
  constructor(private readonly config: { tenantId: string; clientId: string; clientSecret: string; sharepointDriveId: string; sharepointFolderId: string; onedriveDriveId: string; onedriveFolderId: string }, private readonly request: typeof fetch = fetch) {}
  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const response = await this.request(`https://login.microsoftonline.com/${encode(this.config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }), signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Graph authentication failed (${response.status})`);
    const data = await response.json() as { access_token: string; expires_in: number };
    if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error('Invalid Graph token response');
    this.token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }
  async put(filename: string, body: Uint8Array, purpose: 'evidence' | 'working' = 'evidence'): Promise<string> {
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) throw new Error('Invalid storage filename');
    if (body.byteLength > 250 * 1024 * 1024) throw new Error('File requires a Graph upload session');
    const driveId = purpose === 'evidence' ? this.config.sharepointDriveId : this.config.onedriveDriveId;
    const folderId = purpose === 'evidence' ? this.config.sharepointFolderId : this.config.onedriveFolderId;
    const response = await this.request(`${graph}/drives/${encode(driveId)}/items/${encode(folderId)}:/${encode(filename)}:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(body), redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Graph upload failed (${response.status})`);
    const item = await response.json() as { id: string; eTag: string };
    if (!item.id || !item.eTag) throw new Error('Graph upload returned incomplete identity');
    return `graph:${Buffer.from(JSON.stringify({ driveId, itemId: item.id, eTag: item.eTag, sha256: sha(body) })).toString('base64url')}`;
  }
  async get(reference: string): Promise<Buffer> {
    if (!reference.startsWith('graph:')) throw new Error('Invalid Graph object reference');
    const ref = JSON.parse(Buffer.from(reference.slice(6), 'base64url').toString()) as DriveReference;
    if (![this.config.sharepointDriveId, this.config.onedriveDriveId].includes(ref.driveId) || !ref.itemId || !ref.eTag || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid Graph object identity');
    const endpoint = `${graph}/drives/${encode(ref.driveId)}/items/${encode(ref.itemId)}`;
    const token = await this.accessToken();
    const metadata = await this.request(endpoint, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!metadata.ok) throw new Error(`Graph metadata failed (${metadata.status})`);
    if ((await metadata.json() as { eTag: string }).eTag !== ref.eTag) throw new Error('Stored evidence was changed outside AuditSphere');
    let response = await this.request(`${endpoint}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
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
    if (sha(body) !== ref.sha256) throw new Error('Stored evidence failed SHA-256 verification');
    return body;
  }
}

export function configuredGraphStorage(env = process.env) {
  const names = ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'SHAREPOINT_DRIVE_ID', 'SHAREPOINT_FOLDER_ID', 'ONEDRIVE_DRIVE_ID', 'ONEDRIVE_FOLDER_ID'] as const;
  for (const name of names) if (!env[name]) throw new Error(`Missing storage configuration: ${name}`);
  if (!/^[0-9a-f-]{36}$/i.test(env.M365_TENANT_ID!)) throw new Error('M365_TENANT_ID must be a tenant UUID');
  return new GraphStorage({ tenantId: env.M365_TENANT_ID!, clientId: env.M365_CLIENT_ID!, clientSecret: env.M365_CLIENT_SECRET!, sharepointDriveId: env.SHAREPOINT_DRIVE_ID!, sharepointFolderId: env.SHAREPOINT_FOLDER_ID!, onedriveDriveId: env.ONEDRIVE_DRIVE_ID!, onedriveFolderId: env.ONEDRIVE_FOLDER_ID! });
}
