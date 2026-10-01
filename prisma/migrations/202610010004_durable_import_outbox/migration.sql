ALTER TABLE "OutboxEvent" ADD COLUMN "completedAt" timestamptz;
CREATE INDEX "OutboxEvent_unfinished" ON "OutboxEvent"("createdAt") WHERE "completedAt" IS NULL;
