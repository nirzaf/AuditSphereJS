-- T037: in-app status plus durable, idempotent outbound notification intent.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK ("capability" IN (
  'ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE',
  'TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR',
  'REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND',
  'COMMERCIAL_MANAGE','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD',
  'TEAM_ASSIGNMENT_MANAGE','EXTERNAL_COMMUNICATION_READ','EXTERNAL_COMMUNICATION_SEND','EXTERNAL_COMMUNICATION_RECONCILE'
));

CREATE TABLE "Notification" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagementId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "eventKey" VARCHAR(200) NOT NULL,
  kind TEXT NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "readAt" TIMESTAMPTZ(6),
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Notification_membership_scope_fkey" FOREIGN KEY ("recipientUserId", "engagementId") REFERENCES "Membership"("userId", "engagementId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT notification_kind_check CHECK (kind IN ('PROPOSAL','LETTER','INVOICE','PAYMENT_RECEIPT','FEE_NOTE','PBC_REQUEST','CONFIRMATION','REVIEW_NOTE','LIFECYCLE')),
  CONSTRAINT notification_event_key_check CHECK (length("eventKey") BETWEEN 1 AND 200),
  CONSTRAINT notification_version_check CHECK (version = 1),
  CONSTRAINT notification_read_state_check CHECK ("readAt" IS NULL OR "readAt" >= "createdAt")
);
CREATE UNIQUE INDEX "Notification_recipient_engagement_event_key" ON "Notification"("recipientUserId", "engagementId", "eventKey");
CREATE INDEX "Notification_recipient_engagement_created" ON "Notification"("recipientUserId", "engagementId", "createdAt" DESC);

CREATE FUNCTION prevent_notification_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (to_jsonb(NEW) - ARRAY['readAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['readAt']) OR
     OLD."readAt" IS NOT NULL OR NEW."readAt" IS NULL THEN
    RAISE EXCEPTION 'notification content is immutable; only an unread item may be marked read';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_append_only BEFORE UPDATE OR DELETE ON "Notification"
FOR EACH ROW EXECUTE FUNCTION prevent_notification_rewrite();

CREATE TABLE "OutboundMessage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagementId" UUID NOT NULL REFERENCES "Engagement"(id) ON DELETE RESTRICT,
  "createdBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "eventKey" VARCHAR(200) NOT NULL,
  "eventType" TEXT NOT NULL,
  "recipientRole" TEXT NOT NULL,
  "recipientSnapshot" JSONB NOT NULL,
  subject VARCHAR(300) NOT NULL,
  "textBody" VARCHAR(20000) NOT NULL,
  provider TEXT NOT NULL DEFAULT 'GRAPH',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  version INTEGER NOT NULL DEFAULT 1,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerReceipt" TEXT,
  "failureCode" TEXT,
  "unknownAt" TIMESTAMPTZ(6),
  "deliveredAt" TIMESTAMPTZ(6),
  reconciliation JSONB,
  "claimToken" UUID,
  "claimExpiresAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT outbound_event_key_check CHECK (length("eventKey") BETWEEN 1 AND 200),
  CONSTRAINT outbound_event_type_check CHECK ("eventType" IN ('PROPOSAL','ENGAGEMENT_LETTER','DELIVERABLES','INVOICE','PAYMENT_RECEIPT','FEE_NOTE','PBC_REQUEST','CONFIRMATION','HOLDING_LETTER')),
  CONSTRAINT outbound_recipient_role_check CHECK ("recipientRole" IN ('MD_GM','CFO_FD','AUDIT_LIAISON')),
  CONSTRAINT outbound_recipient_snapshot_check CHECK (jsonb_typeof("recipientSnapshot") = 'array' AND jsonb_array_length("recipientSnapshot") BETWEEN 1 AND 20),
  CONSTRAINT outbound_provider_check CHECK (provider = 'GRAPH'),
  CONSTRAINT outbound_status_check CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','UNKNOWN','RECONCILED_SENT','CANCELLED')),
  CONSTRAINT outbound_version_check CHECK (version >= 1 AND "attemptCount" >= 0),
  CONSTRAINT outbound_delivery_state_check CHECK (
    (status IN ('SENT','RECONCILED_SENT') AND "deliveredAt" IS NOT NULL AND "failureCode" IS NULL AND "unknownAt" IS NULL) OR
    (status = 'UNKNOWN' AND "unknownAt" IS NOT NULL AND "deliveredAt" IS NULL) OR
    (status NOT IN ('SENT','RECONCILED_SENT','UNKNOWN') AND "deliveredAt" IS NULL AND "unknownAt" IS NULL)
  ),
  CONSTRAINT outbound_claim_state_check CHECK ((status = 'SENDING' AND "claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL) OR (status <> 'SENDING' AND "claimToken" IS NULL AND "claimExpiresAt" IS NULL))
);
CREATE UNIQUE INDEX "OutboundMessage_engagement_event_key" ON "OutboundMessage"("engagementId", "eventKey");
CREATE INDEX "OutboundMessage_dispatch_order" ON "OutboundMessage"(status, "claimExpiresAt", "createdAt");
CREATE INDEX "OutboundMessage_engagement_created" ON "OutboundMessage"("engagementId", "createdAt" DESC);

CREATE FUNCTION prevent_outbound_message_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW."engagementId" IS DISTINCT FROM OLD."engagementId" OR
     NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR
     NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."recipientRole" IS DISTINCT FROM OLD."recipientRole" OR
     NEW."recipientSnapshot" IS DISTINCT FROM OLD."recipientSnapshot" OR NEW.subject IS DISTINCT FROM OLD.subject OR
     NEW."textBody" IS DISTINCT FROM OLD."textBody" OR NEW.provider IS DISTINCT FROM OLD.provider OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW.version <> OLD.version + 1 OR
     (OLD.status = 'QUEUED' AND NEW.status NOT IN ('SENDING','CANCELLED')) OR
     (OLD.status = 'SENDING' AND NEW.status NOT IN ('SENT','FAILED','UNKNOWN','QUEUED')) OR
     (OLD.status = 'FAILED' AND NEW.status NOT IN ('QUEUED','CANCELLED')) OR
     (OLD.status = 'UNKNOWN' AND NEW.status NOT IN ('RECONCILED_SENT','FAILED')) OR
     (OLD.status IN ('SENT','RECONCILED_SENT','CANCELLED') AND NEW.status <> OLD.status) OR
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
CREATE TRIGGER outbound_message_append_only BEFORE UPDATE OR DELETE ON "OutboundMessage"
FOR EACH ROW EXECUTE FUNCTION prevent_outbound_message_rewrite();

CREATE TABLE "DeliveryAttempt" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "outboundMessageId" UUID NOT NULL REFERENCES "OutboundMessage"(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  state TEXT NOT NULL,
  "providerStatus" INTEGER,
  "providerReceipt" TEXT,
  "failureCode" TEXT,
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT delivery_attempt_sequence_check CHECK (sequence > 0),
  CONSTRAINT delivery_attempt_state_check CHECK (state IN ('STARTED','SENT','FAILED','UNKNOWN','RECONCILED_SENT','RECONCILED_NOT_SENT')),
  CONSTRAINT delivery_attempt_time_check CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt")
);
CREATE UNIQUE INDEX "DeliveryAttempt_message_sequence" ON "DeliveryAttempt"("outboundMessageId", sequence);
CREATE INDEX "DeliveryAttempt_started_at" ON "DeliveryAttempt"("startedAt");
CREATE FUNCTION prevent_delivery_attempt_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivery attempts are append-only';
END;
$$;
CREATE TRIGGER delivery_attempt_append_only BEFORE UPDATE OR DELETE ON "DeliveryAttempt"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_attempt_rewrite();
