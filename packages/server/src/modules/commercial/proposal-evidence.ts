import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { hasConsumedProposalCredential } from '../../platform/proposal-credentials.js';
import type { TransactionClient } from '../../platform/unit-of-work.js';

type ProposalTerms = { revision: number; service: string; periodStart: Date; periodEnd: Date; totalAmount: { toFixed: (digits: number) => string }; currency: string };
export function proposalTerms(proposal: ProposalTerms) {
  return { revision: proposal.revision, service: proposal.service, periodStart: proposal.periodStart.toISOString().slice(0, 10),
    periodEnd: proposal.periodEnd.toISOString().slice(0, 10), totalAmount: proposal.totalAmount.toFixed(2), currency: proposal.currency };
}
export const proposalTermsDigest = (proposal: ProposalTerms) => createHash('sha256').update(JSON.stringify(proposalTerms(proposal))).digest('hex');
export function hasCurrentPresentedTerms(proposal: ProposalTerms & { presentedSnapshot: Prisma.JsonValue | null }) {
  const snapshot = proposal.presentedSnapshot;
  return snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot)
    && Object.entries(proposalTerms(proposal)).every(([key, value]) => snapshot[key] === value);
}
export function isPortalAcceptedProposal(proposal: ProposalTerms & { presentedSnapshot: Prisma.JsonValue | null; clientResponse: Prisma.JsonValue | null }) {
  const response = proposal.clientResponse;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof response['acceptedByPortalUserId'] === 'string' && uuid.test(response['acceptedByPortalUserId'])
    && typeof response['tokenId'] === 'string' && uuid.test(response['tokenId'])
    && typeof response['acceptedAt'] === 'string' && response['revision'] === proposal.revision
    && response['termsDigest'] === proposalTermsDigest(proposal)
    && hasCurrentPresentedTerms(proposal);
}
export async function hasClientAcceptanceEvidence(tx: TransactionClient | typeof import('../../platform/db.js').db,
  proposal: ProposalTerms & { id: string; presentedSnapshot: Prisma.JsonValue | null; clientResponse: Prisma.JsonValue | null }) {
  if (!isPortalAcceptedProposal(proposal)) return false;
  const response = proposal.clientResponse as { tokenId: string; acceptedByPortalUserId: string; termsDigest: string };
  return hasConsumedProposalCredential(tx, { tokenId: response.tokenId, portalUserId: response.acceptedByPortalUserId,
    proposalId: proposal.id, revision: proposal.revision, termsDigest: response.termsDigest });
}
