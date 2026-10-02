-- T025: audit write integrity. Audit events gain actor kind, resource identity, correlation and
-- redacted before/after payloads; service actors no longer need a synthetic user id; a separate
-- append-only security log records authorization denials that must survive transaction rollback.
-- The v1 canonical digest keeps covering only the original columns, so historical sidecar
-- records and independent checkpoints remain verifiable; the new columns are protected by the
-- same row-level immutability triggers and role grants.

ALTER TABLE "AuditEvent" ADD COLUMN "actorKind" text NOT NULL DEFAULT 'USER';
ALTER TABLE "AuditEvent" ADD COLUMN "resourceType" text;
ALTER TABLE "AuditEvent" ADD COLUMN "resourceId" text;
ALTER TABLE "AuditEvent" ADD COLUMN "resourceVersion" integer;
ALTER TABLE "AuditEvent" ADD COLUMN "correlationId" text;
ALTER TABLE "AuditEvent" ADD COLUMN "beforeState" jsonb;
ALTER TABLE "AuditEvent" ADD COLUMN "afterState" jsonb;
ALTER TABLE "AuditEvent" ALTER COLUMN "actorId" DROP NOT NULL;

ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_event_actor_kind_check CHECK ("actorKind" IN ('USER', 'SERVICE'));
-- A USER event names its actor; a SERVICE event names the operation that initiated it.
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_event_actor_traceability_check CHECK (
  ("actorKind" = 'USER' AND "actorId" IS NOT NULL)
  OR ("actorKind" = 'SERVICE' AND "correlationId" IS NOT NULL AND length("correlationId") BETWEEN 1 AND 200)
);
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_event_resource_shape_check CHECK (
  ("resourceType" IS NULL AND "resourceId" IS NULL AND "resourceVersion" IS NULL)
  OR ("resourceType" IS NOT NULL AND length("resourceType") BETWEEN 1 AND 100
      AND "resourceId" IS NOT NULL AND length("resourceId") BETWEEN 1 AND 200)
);
-- Row-level UPDATE/DELETE are already blocked by audit_append_only; TRUNCATE bypasses row
-- triggers, so it needs its own statement-level guard even for the table owner.
CREATE FUNCTION prevent_audit_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_truncate();

CREATE TABLE "SecurityEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagementId" uuid,
  "actorId" uuid,
  "action" text NOT NULL CHECK (length("action") BETWEEN 1 AND 100),
  "correlationId" text CHECK ("correlationId" IS NULL OR length("correlationId") BETWEEN 1 AND 200),
  "detail" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION prevent_security_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Security events are append-only'; END;
$$;
CREATE TRIGGER security_event_append_only BEFORE UPDATE OR DELETE ON "SecurityEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_security_mutation();
CREATE TRIGGER security_event_no_truncate BEFORE TRUNCATE ON "SecurityEvent"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_truncate();
REVOKE ALL ON "SecurityEvent" FROM PUBLIC;
