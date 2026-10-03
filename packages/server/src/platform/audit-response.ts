export function toAuditEventView(event: {
  [key: string]: unknown;
  id: string; actorKind: string; actorId: string | null; action: string; resourceType: string | null;
  resourceId: string | null; resourceVersion: number | null; correlationId: string | null;
  payload: unknown; beforeState: unknown; afterState: unknown; createdAt: Date | string;
}) {
  return {
    id: event.id, actorKind: event.actorKind, actorId: event.actorId, action: event.action,
    resourceType: event.resourceType, resourceId: event.resourceId, resourceVersion: event.resourceVersion,
    correlationId: event.correlationId, payload: event.payload, beforeState: event.beforeState, afterState: event.afterState,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : new Date(event.createdAt).toISOString(),
  };
}
