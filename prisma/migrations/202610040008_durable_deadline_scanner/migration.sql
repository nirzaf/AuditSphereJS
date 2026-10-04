CREATE TABLE scheduled_deadlines (
  id uuid NOT NULL,
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "eventType" varchar(120) NOT NULL,
  classification varchar(16) NOT NULL,
  "dueAt" timestamptz(6) NOT NULL,
  payload jsonb NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'SCHEDULED',
  "queuedAt" timestamptz(6),
  "completedAt" timestamptz(6),
  "failedAt" timestamptz(6),
  "cancelledAt" timestamptz(6),
  "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(6) NOT NULL,
  CONSTRAINT scheduled_deadlines_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_deadlines_scope_id_key UNIQUE ("firmId", "clientId", "engagementId", id),
  CONSTRAINT scheduled_deadlines_scope_key_key UNIQUE ("firmId", "clientId", "engagementId", "idempotencyKey"),
  CONSTRAINT scheduled_deadlines_idempotency_key_check CHECK (btrim("idempotencyKey") <> ''),
  CONSTRAINT scheduled_deadlines_event_type_check CHECK ("eventType" ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  CONSTRAINT scheduled_deadlines_classification_check CHECK (classification IN ('INFORMATIONAL', 'ENFORCEMENT')),
  CONSTRAINT scheduled_deadlines_state_check CHECK (
    (state = 'SCHEDULED' AND "queuedAt" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    (state = 'QUEUED' AND "queuedAt" IS NOT NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    (state = 'COMPLETED' AND "queuedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    (state = 'FAILED' AND "queuedAt" IS NOT NULL AND "completedAt" IS NULL AND "failedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
    (state = 'CANCELLED' AND "queuedAt" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NOT NULL)
  ),
  CONSTRAINT scheduled_deadlines_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT scheduled_deadlines_scope_fkey FOREIGN KEY ("firmId", "clientId", "engagementId")
    REFERENCES "Engagement" ("firmId", "clientId", id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX scheduled_deadlines_due ON scheduled_deadlines (state, "dueAt", id);

ALTER TABLE "OutboxEvent"
  ADD COLUMN "deadlineId" uuid,
  ADD CONSTRAINT "OutboxEvent_deadlineId_key" UNIQUE ("deadlineId"),
  ADD CONSTRAINT "OutboxEvent_deadline_scope_id_key" UNIQUE ("firmId", "clientId", "engagementId", "deadlineId"),
  ADD CONSTRAINT "OutboxEvent_deadline_scope_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId", "deadlineId")
    REFERENCES scheduled_deadlines ("firmId", "clientId", "engagementId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OutboxEvent_deadline_link_check" CHECK (
    (type = 'tb.import' AND "importId" IS NOT NULL AND "deadlineId" IS NULL) OR
    (type = 'scheduler.deadline' AND "importId" IS NULL AND "deadlineId" IS NOT NULL) OR
    (type NOT IN ('tb.import', 'scheduler.deadline') AND "deadlineId" IS NULL)
  );
