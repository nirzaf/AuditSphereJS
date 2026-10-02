-- Platform audit and command records are engagement-scoped. Chain rows must preserve the
-- exact engagement of their immutable source event, not just its globally unique UUID.
CREATE UNIQUE INDEX "AuditEvent_engagementId_id_key"
  ON "AuditEvent" ("engagementId", "id");

CREATE UNIQUE INDEX "AuditChainRecord_engagementId_eventId_key"
  ON "AuditChainRecord" ("engagementId", "eventId");

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditChainHead"
  ADD CONSTRAINT "AuditChainHead_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditChainRecord"
  DROP CONSTRAINT "AuditChainRecord_eventId_fkey",
  ADD CONSTRAINT "AuditChainRecord_event_scope_fkey"
    FOREIGN KEY ("engagementId", "eventId")
    REFERENCES "AuditEvent" ("engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommandReceipt"
  ADD CONSTRAINT "CommandReceipt_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
