CREATE TABLE "operation_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "engagementId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" VARCHAR(120) NOT NULL,
  "callerKey" VARCHAR(255) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
  "result" JSONB,
  "unknownCode" VARCHAR(120),
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operation_requests_action_check" CHECK (btrim("action") <> ''),
  CONSTRAINT "operation_requests_caller_key_check" CHECK (btrim("callerKey") <> ''),
  CONSTRAINT "operation_requests_request_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "operation_requests_state_check" CHECK (
    ("state" = 'IN_PROGRESS' AND "result" IS NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL) OR
    ("state" = 'COMPLETED' AND "result" IS NOT NULL AND "unknownCode" IS NULL AND "completedAt" IS NOT NULL) OR
    ("state" = 'UNKNOWN' AND "result" IS NULL AND "unknownCode" IS NOT NULL AND "completedAt" IS NULL)
  ),
  CONSTRAINT "operation_requests_engagement_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId")
    REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operation_requests_actor_fkey" FOREIGN KEY ("actorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "operation_requests_scope_action_key"
  ON "operation_requests"("firmId", "clientId", "engagementId", "actorId", "action", "callerKey");
CREATE INDEX "operation_requests_state_updated"
  ON "operation_requests"("state", "updatedAt");
