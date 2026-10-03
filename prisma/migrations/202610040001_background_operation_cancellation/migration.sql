ALTER TABLE background_operations
  ADD COLUMN "cancelledAt" timestamptz(6);

ALTER TABLE background_operations
  DROP CONSTRAINT "background_operations_state_check";

ALTER TABLE background_operations
  ADD CONSTRAINT "background_operations_state_check" CHECK (
    ("state" IN ('QUEUED', 'RUNNING') AND "result" IS NULL AND "errorCode" IS NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'COMPLETED' AND "unknownCode" IS NULL AND "errorCode" IS NULL AND "completedAt" IS NOT NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'FAILED' AND "result" IS NULL AND "errorCode" IS NOT NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'UNKNOWN' AND "result" IS NULL AND "errorCode" IS NULL AND "unknownCode" IS NOT NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'CANCELLED' AND "result" IS NULL AND "errorCode" IS NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NOT NULL)
  );
