CREATE OR REPLACE FUNCTION is_valid_notification_recipient_snapshot(snapshot JSONB, expected_role TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  recipient JSONB;
  contact_id TEXT;
  recipient_role TEXT;
  address TEXT;
BEGIN
  IF jsonb_typeof(snapshot) <> 'array' OR jsonb_array_length(snapshot) < 1 OR jsonb_array_length(snapshot) > 20 THEN RETURN FALSE; END IF;
  FOR recipient IN SELECT value FROM jsonb_array_elements(snapshot)
  LOOP
    IF jsonb_typeof(recipient) <> 'object' OR NOT (recipient ?& ARRAY['contactId','role','email']) THEN RETURN FALSE; END IF;
    contact_id := recipient->>'contactId'; recipient_role := recipient->>'role'; address := recipient->>'email';
    IF contact_id IS NULL OR contact_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
       recipient_role IS DISTINCT FROM expected_role OR address IS NULL OR address <> lower(address) OR length(address) > 320 OR
       address ~ '[[:space:]<>]' OR address !~ '^[^@]+@[^@]+[.][^@.]+$' THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;
ALTER TABLE "OutboundMessage" DROP CONSTRAINT outbound_recipient_snapshot_check;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT outbound_recipient_snapshot_check CHECK (is_valid_notification_recipient_snapshot("recipientSnapshot", "recipientRole"));

CREATE OR REPLACE FUNCTION prevent_outbound_message_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW."engagementId" IS DISTINCT FROM OLD."engagementId" OR
     NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR
     NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."recipientRole" IS DISTINCT FROM OLD."recipientRole" OR
     NEW."recipientSnapshot" IS DISTINCT FROM OLD."recipientSnapshot" OR NEW.subject IS DISTINCT FROM OLD.subject OR
     NEW."textBody" IS DISTINCT FROM OLD."textBody" OR NEW.provider IS DISTINCT FROM OLD.provider OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW.version <> OLD.version + 1 OR
     (OLD.reconciliation IS NOT NULL AND NEW.reconciliation IS DISTINCT FROM OLD.reconciliation) OR
     (OLD.status IN ('SENT','RECONCILED_SENT','CANCELLED') AND
       (NEW.status <> OLD.status OR (to_jsonb(NEW) - ARRAY['version','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['version','updatedAt']))) OR
     (OLD.status = 'QUEUED' AND NEW.status NOT IN ('SENDING','CANCELLED')) OR
     (OLD.status = 'SENDING' AND NEW.status NOT IN ('SENT','FAILED','UNKNOWN','QUEUED')) OR
     (OLD.status = 'FAILED' AND NEW.status NOT IN ('QUEUED','CANCELLED')) OR
     (OLD.status = 'UNKNOWN' AND NEW.status NOT IN ('RECONCILED_SENT','FAILED')) OR
     (NEW.status = 'UNKNOWN' AND (NEW."unknownAt" IS NULL OR NEW."failureCode" IS NULL)) OR
     (NEW.status = 'SENT' AND (NEW."providerReceipt" IS NULL OR NEW."deliveredAt" IS NULL)) OR
     (NEW.status = 'RECONCILED_SENT' AND (NEW.reconciliation IS NULL OR NEW."deliveredAt" IS NULL)) OR
     (NEW.status = 'FAILED' AND NEW."failureCode" IS NULL) OR
     (NEW."attemptCount" < OLD."attemptCount" OR NEW."attemptCount" > OLD."attemptCount" + 1) OR
     (NEW.status = 'SENDING' AND NEW."attemptCount" <> OLD."attemptCount" + 1) THEN
    RAISE EXCEPTION 'outbound message has an invalid state transition or immutable field rewrite';
  END IF;
  RETURN NEW;
END;
$$;
