import { db } from './db.js';

export type EntraUserMapping = {
  localUserId: string;
  tenantId: string;
  objectId: string;
};

export type EntraUserMappingClient = Pick<typeof db, 'user'>;
export type EntraUserMappingPlan = { localUserId: string; status: 'READY' | 'ALREADY_MAPPED' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** Binds an existing local account only; it never creates business membership or capabilities. */
export async function inspectEntraIdentityMapping(
  input: EntraUserMapping,
  client: EntraUserMappingClient = db,
): Promise<EntraUserMappingPlan> {
  if (![input.localUserId, input.tenantId, input.objectId].every((value) => uuid.test(value))) {
    throw new Error('Local user, tenant and Entra object identifiers must be UUIDs');
  }

  const tenantId = input.tenantId.toLowerCase();
  const objectId = input.objectId.toLowerCase();
  const current = await client.user.findUnique({
    where: { id: input.localUserId },
    select: { id: true, active: true, tenantId: true, entraObjectId: true },
  });
  if (!current) throw new Error('The selected local user does not exist');
  if (!current.active) throw new Error('An inactive local user cannot be mapped');
  if (current.tenantId?.toLowerCase() === tenantId && current.entraObjectId?.toLowerCase() === objectId) {
    return { localUserId: current.id, status: 'ALREADY_MAPPED' };
  }
  if (current.tenantId !== null || current.entraObjectId !== null) {
    throw new Error('The selected local user already has an Entra identity mapping');
  }

  const claimed = await client.user.findUnique({
    where: { tenantId_entraObjectId: { tenantId, entraObjectId: objectId } },
    select: { id: true },
  });
  if (claimed) throw new Error('The Entra identity is already mapped to another local user');

  return { localUserId: current.id, status: 'READY' };
}

/** Binds an existing local account only; it never creates business membership or capabilities. */
export async function mapEntraIdentityToExistingUser(
  input: EntraUserMapping,
  client: EntraUserMappingClient = db,
): Promise<{ localUserId: string; changed: boolean }> {
  const plan = await inspectEntraIdentityMapping(input, client);
  if (plan.status === 'ALREADY_MAPPED') return { localUserId: plan.localUserId, changed: false };
  const tenantId = input.tenantId.toLowerCase();
  const objectId = input.objectId.toLowerCase();

  try {
    const result = await client.user.updateMany({
      where: { id: plan.localUserId, active: true, tenantId: null, entraObjectId: null },
      data: { tenantId, entraObjectId: objectId },
    });
    if (result.count !== 1) throw new Error('The local user changed during mapping; reload and review before retrying');
    return { localUserId: plan.localUserId, changed: true };
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('The Entra identity was concurrently mapped to another local user');
    throw error;
  }
}
