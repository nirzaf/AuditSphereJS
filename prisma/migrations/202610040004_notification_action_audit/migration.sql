-- Preserve the already-applied T037 base migration and add read-versioning plus append-only action history.
ALTER TABLE "Notification" DROP CONSTRAINT notification_version_check;
ALTER TABLE "Notification" ADD CONSTRAINT notification_version_check CHECK (version >= 1);
CREATE OR REPLACE FUNCTION prevent_notification_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (to_jsonb(NEW) - ARRAY['readAt','version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['readAt','version']) OR
     NEW.version <> OLD.version + 1 OR OLD."readAt" IS NOT NULL OR NEW."readAt" IS NULL THEN
    RAISE EXCEPTION 'notification content is immutable; only an unread item may be marked read';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_delivery_attempt_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     NOT ((OLD.state = 'STARTED' AND NEW.state IN ('SENT','FAILED','UNKNOWN')) OR
          (OLD.state = 'UNKNOWN' AND NEW.state IN ('RECONCILED_SENT','RECONCILED_NOT_SENT'))) OR
     NEW.id IS DISTINCT FROM OLD.id OR NEW."outboundMessageId" IS DISTINCT FROM OLD."outboundMessageId" OR
     NEW.sequence IS DISTINCT FROM OLD.sequence OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt" OR
     NEW."completedAt" IS NULL OR NEW."completedAt" < OLD."startedAt" THEN
    RAISE EXCEPTION 'delivery attempt is immutable after its single terminal observation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE "OutboundMessageAction" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "outboundMessageId" UUID NOT NULL REFERENCES "OutboundMessage"(id) ON DELETE RESTRICT,
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  outcome TEXT,
  reason VARCHAR(1000) NOT NULL,
  "evidenceReference" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT outbound_action_type_check CHECK (action IN ('CREATED','MANUAL_RETRY','RECONCILE')),
  CONSTRAINT outbound_action_reason_check CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  CONSTRAINT outbound_action_outcome_check CHECK (outcome IS NULL OR outcome IN ('SENT','NOT_SENT')),
  CONSTRAINT outbound_action_evidence_check CHECK ((action = 'RECONCILE' AND "evidenceReference" IS NOT NULL AND outcome IS NOT NULL) OR (action <> 'RECONCILE' AND "evidenceReference" IS NULL AND outcome IS NULL))
);
CREATE INDEX "OutboundMessageAction_message_created" ON "OutboundMessageAction"("outboundMessageId", "createdAt", id);
CREATE FUNCTION prevent_outbound_action_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'outbound message actions are append-only';
END;
$$;
CREATE TRIGGER outbound_action_append_only BEFORE UPDATE OR DELETE ON "OutboundMessageAction"
FOR EACH ROW EXECUTE FUNCTION prevent_outbound_action_rewrite();
