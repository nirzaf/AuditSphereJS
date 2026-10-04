import { Prisma } from '../generated/prisma/client.js';
import { db } from './db.js';
import { currentCorrelationId } from './observability/correlation.js';

/**
 * Audit write helpers (T025). Existing module call sites keep writing USER events through
 * `tx.auditEvent.create`; these helpers add resource identity, correlation, service actors and
 * redacted before/after payloads without changing the v1 canonical digest inputs.
 */

/** Structural subset satisfied by the pooled client and any interactive transaction client. */
type AuditClient = Pick<typeof db, 'auditEvent' | 'securityEvent'>;

export const redactedMarker = '[REDACTED]';
const sensitiveKeyPattern = /password|passphrase|secret|token|authorization|cookie|credential|api[-_]?key|private[-_]?key|access[-_]?key/i;
const maxRedactionDepth = 6;

/** Replaces values of sensitive keys with a marker. Structure and non-sensitive values are preserved. */
export function redactValue(value: unknown, depth = 0): unknown {
  // Fail closed when the bound is exceeded: returning the original subtree could leak a secret
  // nested deeper than the walk limit.
  if (depth > maxRedactionDepth) return redactedMarker;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = sensitiveKeyPattern.test(key) ? redactedMarker : redactValue(item, depth + 1);
  }
  return out;
}

export type AuditEventInput = {
  engagementId: string;
  action: string;
  /** Required for USER events; SERVICE events leave it empty instead of a fake user id. */
  actorId?: string | null;
  actorKind?: 'USER' | 'SERVICE';
  payload?: unknown;
  resource?: { type: string; id: string; version?: number | null } | null;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
};

export function recordAuditEvent(client: AuditClient, input: AuditEventInput) {
  return client.auditEvent.create({
    data: {
      engagementId: input.engagementId,
      actorKind: input.actorKind ?? (input.actorId ? 'USER' : 'SERVICE'),
      actorId: input.actorId ?? null,
      action: input.action,
      payload: redactValue(input.payload ?? {}) as Prisma.InputJsonValue,
      resourceType: input.resource?.type ?? null,
      resourceId: input.resource?.id ?? null,
      resourceVersion: input.resource?.version ?? null,
      correlationId: input.correlationId ?? currentCorrelationId() ?? null,
      beforeState: (input.before === undefined ? null : redactValue(input.before)) as Prisma.InputJsonValue,
      afterState: (input.after === undefined ? null : redactValue(input.after)) as Prisma.InputJsonValue,
    },
  });
}

export type SecurityEventInput = {
  action: string;
  /** Claimed scope, recorded even when the identifier is unknown or foreign. */
  engagementId?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  detail?: unknown;
};

export function recordSecurityEvent(client: AuditClient, input: SecurityEventInput) {
  return client.securityEvent.create({
    data: {
      action: input.action,
      engagementId: input.engagementId ?? null,
      actorId: input.actorId ?? null,
      correlationId: input.correlationId ?? currentCorrelationId() ?? null,
      detail: (input.detail === undefined ? {} : redactValue(input.detail)) as Prisma.InputJsonValue,
    },
  });
}
