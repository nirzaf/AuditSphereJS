-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","engagementId")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "state" TEXT NOT NULL DEFAULT 'LEAD_INGESTION',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TbImport" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TbImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TbRow" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "current" DECIMAL(20,2) NOT NULL,
    "prior" DECIMAL(20,2) NOT NULL,
    "fsli" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TbRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "key" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Document_key_key" ON "Document"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TbImport_engagementId_sha256_key" ON "TbImport"("engagementId", "sha256");

-- CreateIndex
CREATE INDEX "TbRow_importId_position_idx" ON "TbRow"("importId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TbRow_importId_code_key" ON "TbRow"("importId", "code");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbImport" ADD CONSTRAINT "TbImport_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbRow" ADD CONSTRAINT "TbRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TbImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
