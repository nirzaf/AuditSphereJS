/** Entra access-token iat is measured in whole seconds. Advance the cutoff to the next
 * second so every token already issued in the current second is invalidated as well. */
export function sessionRevocationCutoff(now = new Date()): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000 + 1000);
}

export function wasSessionRevoked(issuedAt: number, revokedBefore: Date): boolean {
  return Number.isSafeInteger(issuedAt) && issuedAt * 1000 < revokedBefore.getTime();
}
