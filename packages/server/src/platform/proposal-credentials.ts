import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { TransactionClient } from './unit-of-work.js';

export const credentialDigest = (value: string) => createHash('sha256').update(value).digest('hex');
export const invalidProposalCredential = () => new ForbiddenException('Proposal acceptance is unavailable or the credential is invalid');

export async function hasConsumedProposalCredential(tx: TransactionClient | typeof import('./db.js').db, binding: {
  tokenId: string; portalUserId: string; proposalId: string; revision: number; termsDigest: string;
}) {
  return Boolean(await tx.portalCredentialToken.findFirst({ where: { id: binding.tokenId, portalUserId: binding.portalUserId,
    proposalId: binding.proposalId, proposalRevision: binding.revision, termsDigest: binding.termsDigest,
    purpose: 'PROPOSAL_ACCEPTANCE', consumedAt: { not: null } }, select: { id: true } }));
}

export async function proposalPortalIdentity(tx: TransactionClient, sessionToken: string, csrfToken?: string) {
  const session = await tx.portalSession.findFirst({ where: {
    tokenHash: credentialDigest(sessionToken), revokedAt: null, expiresAt: { gt: new Date() }, mustChangePassword: false,
    portalUser: { active: true, mustChangePassword: false },
  } });
  if (!session || (csrfToken !== undefined && session.csrfHash !== credentialDigest(csrfToken))) throw invalidProposalCredential();
  return session.portalUserId;
}

export async function issueProposalCredential(tx: TransactionClient, binding: {
  portalUserId: string; portalMembershipId: string; proposalId: string; proposalRevision: number; termsDigest: string;
}) {
  const now = new Date();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await tx.portalCredentialToken.updateMany({ where: { proposalId: binding.proposalId, purpose: 'PROPOSAL_ACCEPTANCE', consumedAt: null }, data: { consumedAt: now } });
  const credential = await tx.portalCredentialToken.create({ data: { ...binding, purpose: 'PROPOSAL_ACCEPTANCE', tokenHash: credentialDigest(token), expiresAt } });
  return { credentialId: credential.id, token, expiresAt };
}

export async function consumeProposalCredential(tx: TransactionClient, token: string, portalUserId: string, proposalId: string, revision: number, termsDigest: string) {
  const now = new Date();
  const credential = await tx.portalCredentialToken.findFirst({ where: {
    tokenHash: credentialDigest(token), portalUserId, proposalId, proposalRevision: revision, termsDigest,
    purpose: 'PROPOSAL_ACCEPTANCE', consumedAt: null, expiresAt: { gt: now },
    membership: { revokedAt: null, archivedAt: null, releasedAt: null },
  } });
  if (!credential) throw invalidProposalCredential();
  const consumed = await tx.portalCredentialToken.updateMany({ where: { id: credential.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
  if (consumed.count !== 1) throw invalidProposalCredential();
  return credential.id;
}
