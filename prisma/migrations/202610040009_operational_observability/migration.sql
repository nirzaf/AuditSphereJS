ALTER TABLE background_operations
  ADD COLUMN "correlationId" VARCHAR(64),
  ADD CONSTRAINT background_operations_correlation_check
    CHECK ("correlationId" IS NULL OR "correlationId" ~ '^[A-Za-z0-9_-]{1,64}$');

ALTER TABLE scheduled_deadlines
  ADD COLUMN "correlationId" VARCHAR(64),
  ADD CONSTRAINT scheduled_deadlines_correlation_check
    CHECK ("correlationId" IS NULL OR "correlationId" ~ '^[A-Za-z0-9_-]{1,64}$');

ALTER TABLE "OutboxEvent"
  ADD COLUMN "correlationId" VARCHAR(64),
  ADD CONSTRAINT "OutboxEvent_correlation_check"
    CHECK ("correlationId" IS NULL OR "correlationId" ~ '^[A-Za-z0-9_-]{1,64}$');

CREATE INDEX "OutboxEvent_correlation" ON "OutboxEvent" ("correlationId");
