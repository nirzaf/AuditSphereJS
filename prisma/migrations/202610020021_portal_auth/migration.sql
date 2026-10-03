-- CreateTable
CREATE TABLE "PortalUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PortalUser"
  ADD CONSTRAINT "PortalUser_email_lowercase_check" CHECK ("email" = lower("email") AND length("email") <= 320);

-- CreateTable
CREATE TABLE "PortalMembership" (
    "id" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "advanceClearedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PortalMembership"
  ADD CONSTRAINT "PortalMembership_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "PortalMembership_release_gate_check" CHECK ("releasedAt" IS NULL OR "advanceClearedAt" IS NOT NULL),
  ADD CONSTRAINT "PortalMembership_archive_gate_check" CHECK ("archivedAt" IS NULL OR "releasedAt" IS NOT NULL);

-- CreateTable
CREATE TABLE "PortalCredentialToken" (
    "id" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "portalMembershipId" UUID,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalCredentialToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PortalCredentialToken"
  ADD CONSTRAINT "PortalCredentialToken_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "PortalCredentialToken_purpose_check" CHECK ("purpose" IN ('INVITATION', 'PASSWORD_RESET'));

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PortalSession"
  ADD CONSTRAINT "PortalSession_token_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "PortalSession_csrf_hash_check" CHECK ("csrfHash" ~ '^[a-f0-9]{64}$');

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_email_key" ON "PortalUser"("email");

-- CreateIndex
CREATE INDEX "PortalMembership_firmId_clientId_engagementId_idx" ON "PortalMembership"("firmId", "clientId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalMembership_portalUserId_engagementId_key" ON "PortalMembership"("portalUserId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalMembership_portalUserId_id_key" ON "PortalMembership"("portalUserId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PortalMembership_firmId_clientId_engagementId_id_key" ON "PortalMembership"("firmId", "clientId", "engagementId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PortalCredentialToken_tokenHash_key" ON "PortalCredentialToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalCredentialToken_portalUserId_purpose_expiresAt_idx" ON "PortalCredentialToken"("portalUserId", "purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_portalUserId_expiresAt_idx" ON "PortalSession"("portalUserId", "expiresAt");

-- AddForeignKey
ALTER TABLE "PortalMembership" ADD CONSTRAINT "PortalMembership_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMembership" ADD CONSTRAINT "PortalMembership_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalCredentialToken" ADD CONSTRAINT "PortalCredentialToken_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalCredentialToken" ADD CONSTRAINT "PortalCredentialToken_portalUserId_portalMembershipId_fkey" FOREIGN KEY ("portalUserId", "portalMembershipId") REFERENCES "PortalMembership"("portalUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
