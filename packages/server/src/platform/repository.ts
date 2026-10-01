import { db } from './db.js';
import type { GraphRepository } from './graph-storage.js';

export type RepositoryPurpose = 'evidence' | 'working';
/** Accepts either the pooled client or a transaction client. */
export type RepositoryClient = Pick<typeof db, 'clientRepository'>;

/**
 * Resolve the repository for one client and purpose.
 *
 * Production fails closed when no binding exists, so evidence can never fall back into a shared
 * location. The development fallback reads the local fixture configuration and is impossible in
 * production because NODE_ENV is checked first.
 */
export async function resolveClientRepository(client: RepositoryClient, firmId: string, clientId: string, purpose: RepositoryPurpose): Promise<GraphRepository> {
  const binding = await client.clientRepository.findFirst({
    where: { firmId, clientId, purpose, provider: 'graph', retiredAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (binding) return { driveId: binding.driveId, folderId: binding.folderId, purpose };
  if (process.env.NODE_ENV === 'production') throw new Error(`No ${purpose} repository is provisioned for this client`);
  const driveId = purpose === 'evidence' ? process.env.SHAREPOINT_DRIVE_ID : process.env.ONEDRIVE_DRIVE_ID;
  const folderId = purpose === 'evidence' ? process.env.SHAREPOINT_FOLDER_ID : process.env.ONEDRIVE_FOLDER_ID;
  if (!driveId || !folderId) throw new Error(`No ${purpose} repository binding or local fixture configuration is available`);
  return { driveId, folderId, purpose };
}
