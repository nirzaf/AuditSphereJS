-- WP06: scoped role grants with expiry and revocation.
--
-- Replaces the single implicit 'PREPARER' membership rule with an explicit, historical grant.
-- A grant carries the capability and the scope it applies to, and may expire or be revoked.
-- Revocation is recorded, never deleted, so historical authority stays auditable.

-- CreateTable
CREATE TABLE "RoleGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "firmId" UUID,
    "clientId" UUID,
    "engagementId" UUID,
    "grantedBy" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" UUID,
    "reason" TEXT,

    CONSTRAINT "RoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleGrant_userId_capability_idx" ON "RoleGrant"("userId", "capability");

-- CreateIndex
CREATE INDEX "RoleGrant_engagementId_idx" ON "RoleGrant"("engagementId");

-- AddForeignKey
ALTER TABLE "RoleGrant" ADD CONSTRAINT "RoleGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','LIFECYCLE_COMMAND'));

-- A narrower scope requires its parent scope, so a grant can never be ambiguous.
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_scope_check CHECK (
  ("clientId" IS NULL OR "firmId" IS NOT NULL)
  AND ("engagementId" IS NULL OR ("firmId" IS NOT NULL AND "clientId" IS NOT NULL)));

-- Revocation is all-or-nothing evidence.
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_revocation_check CHECK (
  ("revokedAt" IS NULL) = ("revokedBy" IS NULL));

-- An expiry must be after the grant time.
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_window_check CHECK (
  "expiresAt" IS NULL OR "expiresAt" > "grantedAt");
