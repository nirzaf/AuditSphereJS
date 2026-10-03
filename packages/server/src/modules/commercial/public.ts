import type { Prisma } from '../../generated/prisma/client.js';

export type AcceptedInvoiceContract = {
  proposalId: string;
  proposalRevision: number;
  totalAmount: string;
  currency: string;
  service: string;
};

function revisionOf(value: Prisma.JsonValue | null): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const revision = value['revision'];
  return typeof revision === 'number' && Number.isInteger(revision) ? revision : null;
}

/** Read the immutable commercial evidence Practice must snapshot when issuing an invoice. */
export async function acceptedInvoiceContract(
  tx: Prisma.TransactionClient,
  scope: { firmId: string; clientId: string; engagementId: string },
): Promise<AcceptedInvoiceContract | null> {
  const letter = await tx.engagementLetterRecord.findFirst({
    where: scope,
    include: { proposal: true },
  });
  const proposal = letter?.proposal;
  if (!proposal || proposal.status !== 'ACCEPTED'
    || revisionOf(proposal.presentedSnapshot) !== proposal.revision
    || revisionOf(proposal.clientResponse) !== proposal.revision) return null;
  return {
    proposalId: proposal.id,
    proposalRevision: proposal.revision,
    totalAmount: proposal.totalAmount.toString(),
    currency: proposal.currency,
    service: proposal.service,
  };
}
