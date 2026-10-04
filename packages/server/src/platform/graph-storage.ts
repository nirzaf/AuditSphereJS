import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createCorrelationId, currentCorrelationId } from './observability/correlation.js';
import { operationalMetrics } from './observability/metrics.js';
import { safeOperationalCode } from './observability/logging.js';

/** A resolved client repository. Drive and folder always come from the client binding. */
export type GraphRepository = { driveId: string; folderId: string; purpose?: 'evidence' | 'working' | 'practice-private' | 'template-assets-private' };
export type GraphReference = { driveId: string; repositoryFolderId?: string; itemId: string; versionId: string; eTag: string; sha256: string; sizeBytes: number };
const graph = 'https://graph.microsoft.com/v1.0';
const encode = (value: string) => encodeURIComponent(value);
const sha = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const encodeReference = (reference: GraphReference) => 'graph:' + Buffer.from(JSON.stringify(reference)).toString('base64url');
export function decodeGraphReference(reference: string): GraphReference {
  if (!reference.startsWith('graph:')) throw new Error('Invalid Graph object reference');
  const parsed = JSON.parse(Buffer.from(reference.slice(6), 'base64url').toString()) as Partial<GraphReference>;
  if (!parsed.driveId || !parsed.itemId || !parsed.versionId || !parsed.eTag || !parsed.sha256 || !/^[a-f0-9]{64}$/.test(parsed.sha256)) throw new Error('Invalid Graph object identity');
  if (parsed.repositoryFolderId !== undefined && (typeof parsed.repositoryFolderId !== 'string' || !parsed.repositoryFolderId.trim())) throw new Error('Invalid Graph repository folder identity');
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
  private async providerRequest(url: string | URL, init: RequestInit | undefined, operation: string): Promise<Response> {
    const correlationId = createCorrelationId(currentCorrelationId());
    const headers = new Headers(init?.headers);
    headers.set('client-request-id', correlationId);
    headers.set('return-client-request-id', 'true');
    try {
      const response = await this.request(url, { ...init, headers });
      const expectedDownloadRedirect = operation === 'download' && (response.status === 302 || response.status === 400);
      this.recordProviderResult(response.ok || expectedDownloadRedirect, `GRAPH_HTTP_${response.status}`, operation, correlationId);
      return response;
    } catch (error) {
      this.recordProviderResult(false, safeOperationalCode(error, 'GRAPH_NETWORK_ERROR'), operation, correlationId);
      throw error;
    }
  }
  private recordProviderResult(success: boolean, errorCode: string, operation: string, correlationId: string): void {
    const previous = operationalMetrics.dependencyState('graph');
    operationalMetrics.recordProvider('graph', operation, success);
    const state = success ? 'up' : 'down';
    if (previous === state) return;
    const transition = { event: 'dependency.provider_transition', dependency: 'graph', state, operation, correlationId,
      ...(!success ? { errorCode, action: 'Check Microsoft Graph availability, tenant consent and the selected repository-folder grant.' } : {}) };
    if (!success) console.error(JSON.stringify(transition));
    else if (previous === 'down') console.info(JSON.stringify(transition));
  }
  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const response = await this.providerRequest(`https://login.microsoftonline.com/${encode(this.config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }), signal: AbortSignal.timeout(30_000), redirect: 'error',
    }, 'auth');
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
    const response = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(repository.folderId)}:/${encode(filename)}:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(body), redirect: 'error', signal: AbortSignal.timeout(120_000),
    }, 'upload');
    if (!response.ok) throw new Error(`Graph upload failed (${response.status})`);
    const item = await response.json() as { id?: string; eTag?: string };
    if (!item.id || !item.eTag) throw new Error('Graph upload returned no item identity');
    // driveItemVersion exposes id and size, but has no eTag property. The upload
    // driveItem eTag is retained as provenance, never compared with a version.
    const versions = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(item.id)}/versions?$top=1&$select=id,size`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'version');
    if (!versions.ok) throw new Error(`Graph version lookup failed (${versions.status})`);
    const latest = (await versions.json() as { value?: Array<{ id?: string; size?: number }> }).value?.[0];
    if (!latest?.id || latest.size !== body.byteLength) throw new Error('Graph returned no matching immutable version identity');
    const reference: GraphReference = { driveId: repository.driveId, repositoryFolderId: repository.folderId, itemId: item.id, versionId: latest.id, eTag: item.eTag, sha256: sha(body), sizeBytes: body.byteLength };
    const encoded = encodeReference(reference);
    // A competing external edit can become the newest version between upload
    // and lookup. Verify its exact bytes before accepting the evidence identity.
    await this.get(repository, encoded);
    return encoded;
  }
  async putStream(repository: GraphRepository, filename: string, body: NodeJS.ReadableStream, sizeBytes: number, sha256: string, contentType = 'application/octet-stream', onStored?: (reference: string) => Promise<void>): Promise<string> {
    if (!repository.driveId || !repository.folderId) throw new Error('A client repository binding is required');
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) throw new Error('Invalid storage filename');
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 250 * 1024 * 1024) throw new Error('File size is outside the supported Graph upload range');
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid expected SHA-256');
    const token = await this.accessToken();
    const uploadOptions: RequestInit & { duplex: 'half' } = {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      body: Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>, duplex: 'half', redirect: 'error', signal: AbortSignal.timeout(120_000),
    };
    const response = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(repository.folderId)}:/${encode(filename)}:/content?@microsoft.graph.conflictBehavior=fail`, uploadOptions, 'upload');
    if (!response.ok) throw new Error(`Graph upload failed (${response.status})`);
    const item = await response.json() as { id?: string; eTag?: string };
    if (!item.id || !item.eTag) throw new Error('Graph upload returned no item identity');
    const versions = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(item.id)}/versions?$top=1&$select=id,size`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'version');
    if (!versions.ok) throw new Error(`Graph version lookup failed (${versions.status})`);
    const latest = (await versions.json() as { value?: Array<{ id?: string; size?: number }> }).value?.[0];
    if (!latest?.id || latest.size !== sizeBytes) throw new Error('Graph returned no matching immutable version identity');
    const reference = encodeReference({ driveId: repository.driveId, repositoryFolderId: repository.folderId, itemId: item.id, versionId: latest.id, eTag: item.eTag, sha256, sizeBytes });
    // Persist the exact provider identity before the follow-up read can fail. A later cleanup
    // claim can then target only this unique, unreferenced item in its bound client folder.
    await onStored?.(reference);
    await this.get(repository, reference);
    return reference;
  }
  async deleteStaged(repository: GraphRepository, encodedReference: string): Promise<void> {
    const reference = decodeGraphReference(encodedReference);
    if (reference.driveId !== repository.driveId || reference.repositoryFolderId !== repository.folderId) throw new Error('Staged object does not belong to this client repository');
    const token = await this.accessToken();
    const versions = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(reference.itemId)}/versions?$top=1&$select=id`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'version');
    if (versions.status === 404) return;
    if (!versions.ok) throw new Error(`Graph staged-object version lookup failed (${versions.status})`);
    const latest = (await versions.json() as { value?: Array<{ id?: string }> }).value?.[0];
    if (latest?.id !== reference.versionId) throw new Error('Staged Graph object changed after upload; cleanup requires review');
    await this.get(repository, encodedReference);
    const response = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(reference.itemId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'If-Match': reference.eTag }, redirect: 'error', signal: AbortSignal.timeout(30_000),
    }, 'cleanup');
    if (!response.ok && response.status !== 404) throw new Error(`Graph staged-object recycle-bin cleanup failed (${response.status})`);
  }
  async deleteStagedByName(repository: GraphRepository, filename: string, expectedSha256: string): Promise<void> {
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Invalid staged Graph object cleanup identity');
    const token = await this.accessToken();
    const response = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(repository.folderId)}:/${encode(filename)}?$select=id,name,eTag,size,parentReference`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'lookup');
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`Graph staged-object lookup failed (${response.status})`);
    const item = await response.json() as { id?: string; name?: string; eTag?: string; size?: number; parentReference?: { id?: string } };
    if (!item.id || item.name !== filename || !item.eTag || item.parentReference?.id !== repository.folderId || !Number.isSafeInteger(item.size) || (item.size ?? 0) <= 0) throw new Error('Graph staged-object identity or client-folder binding could not be verified');
    const versions = await this.providerRequest(`${graph}/drives/${encode(repository.driveId)}/items/${encode(item.id)}/versions?$top=1&$select=id`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'version');
    if (!versions.ok) throw new Error(`Graph staged-object version lookup failed (${versions.status})`);
    const latest = (await versions.json() as { value?: Array<{ id?: string }> }).value?.[0];
    if (!latest?.id) throw new Error('Graph staged object has no version identity');
    const encodedReference = encodeReference({ driveId: repository.driveId, repositoryFolderId: repository.folderId, itemId: item.id, versionId: latest.id, eTag: item.eTag, sha256: expectedSha256, sizeBytes: item.size! });
    await this.deleteStaged(repository, encodedReference);
  }
  private async openVersion(repository: GraphRepository, reference: string) {
    const parsed = decodeGraphReference(reference);
    if (parsed.driveId !== repository.driveId) throw new Error('Evidence does not belong to this client repository');
    if (parsed.repositoryFolderId && parsed.repositoryFolderId !== repository.folderId) throw new Error('Evidence does not belong to this client repository folder');
    if (!parsed.repositoryFolderId && process.env.NODE_ENV === 'production') throw new Error('Legacy Graph evidence has no verified client repository folder');
    const base = `${graph}/drives/${encode(parsed.driveId)}/items/${encode(parsed.itemId)}/versions/${encode(parsed.versionId)}`;
    const token = await this.accessToken();
    const metadata = await this.providerRequest(base, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'metadata');
    if (!metadata.ok) throw new Error(`Graph version metadata failed (${metadata.status})`);
    const version = await metadata.json() as { id?: string; size?: number };
    if (version.id !== parsed.versionId || version.size !== parsed.sizeBytes) throw new Error('Stored evidence version identity or size was changed outside AuditSphere');
    let response = await this.providerRequest(`${base}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) }, 'download');
    const itemBase = `${graph}/drives/${encode(parsed.driveId)}/items/${encode(parsed.itemId)}`;
    let currentVersionDownload = false;
    if (response.status === 400) {
      // Graph cannot download the current version through /versions/.../content.
      // Use the current-item endpoint only while both the version and upload
      // eTag still match; historical references must never fall back blindly.
      const latestResponse = await this.providerRequest(`${itemBase}/versions?$top=1&$select=id`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'version');
      if (!latestResponse.ok) throw new Error(`Graph current version lookup failed (${latestResponse.status})`);
      const latest = (await latestResponse.json() as { value?: Array<{ id?: string }> }).value?.[0];
      if (latest?.id !== parsed.versionId) throw new Error('Historical evidence version cannot use current content');
      await this.verifyCurrentItem(itemBase, token, parsed);
      response = await this.providerRequest(`${itemBase}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) }, 'download');
      currentVersionDownload = true;
    }
    if (response.status === 302) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Missing Graph download location');
      const target = new URL(location);
      if (target.protocol !== 'https:' || target.username || target.password || !target.hostname.endsWith('.sharepoint.com')) throw new Error('Untrusted Graph download host');
      // The redirect URL authenticates itself. Never forward the Graph bearer token.
      const correlationId = createCorrelationId(currentCorrelationId());
      try {
        response = await this.request(target, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
        this.recordProviderResult(response.ok, `GRAPH_DOWNLOAD_HTTP_${response.status}`, 'download_redirect', correlationId);
      } catch (error) {
        this.recordProviderResult(false, safeOperationalCode(error, 'GRAPH_DOWNLOAD_NETWORK_ERROR'), 'download_redirect', correlationId);
        throw error;
      }
    }
    if (!response.ok) throw new Error(`Graph download failed (${response.status})`);
    if (!response.body) throw new Error('Graph download returned no content stream');
    return { parsed, token, itemBase, response, currentVersionDownload };
  }
  async get(repository: GraphRepository, reference: string): Promise<Buffer> {
    const { parsed, token, itemBase, response, currentVersionDownload } = await this.openVersion(repository, reference);
    const body = Buffer.from(await response.arrayBuffer());
    if (sha(body) !== parsed.sha256) throw new Error('Stored evidence failed SHA-256 verification');
    if (body.byteLength !== parsed.sizeBytes) throw new Error('Stored evidence size does not match its version identity');
    if (currentVersionDownload) await this.verifyCurrentItem(itemBase, token, parsed);
    return body;
  }
  /** Verify an immutable Graph version to a private staging file without buffering the binary. */
  async getToFile(repository: GraphRepository, reference: string, destination: string): Promise<void> {
    const { parsed, token, itemBase, response, currentVersionDownload } = await this.openVersion(repository, reference);
    const digest = createHash('sha256');
    let size = 0;
    const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;
      if (size > parsed.sizeBytes) return callback(new Error('Stored evidence size exceeds its immutable version identity'));
      digest.update(chunk);
      callback(null, chunk);
    } });
    await pipeline(
      Readable.fromWeb(response.body as never),
      verify,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    );
    if (size !== parsed.sizeBytes) throw new Error('Stored evidence size does not match its version identity');
    if (digest.digest('hex') !== parsed.sha256) throw new Error('Stored evidence failed SHA-256 verification');
    if (currentVersionDownload) await this.verifyCurrentItem(itemBase, token, parsed);
  }
  private async verifyCurrentItem(itemBase: string, token: string, reference: GraphReference) {
    const response = await this.providerRequest(`${itemBase}?$select=id,eTag,size`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) }, 'metadata');
    if (!response.ok) throw new Error(`Graph current item lookup failed (${response.status})`);
    const current = await response.json() as { id?: string; eTag?: string; size?: number };
    if (current.id !== reference.itemId || current.eTag !== reference.eTag || current.size !== reference.sizeBytes) throw new Error('Current evidence identity changed during version download');
  }
}

export function configuredGraphStorage(env = process.env) {
  for (const name of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET'] as const) if (!env[name]) throw new Error(`Missing storage configuration: ${name}`);
  if (!/^[0-9a-f-]{36}$/i.test(env.M365_TENANT_ID!)) throw new Error('M365_TENANT_ID must be a tenant UUID');
  return new GraphStorage({ tenantId: env.M365_TENANT_ID!, clientId: env.M365_CLIENT_ID!, clientSecret: env.M365_CLIENT_SECRET! });
}
