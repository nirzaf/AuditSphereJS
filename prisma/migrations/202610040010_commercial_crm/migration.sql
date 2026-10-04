-- T052/T053/T054: the commercial CRM foundation. Clients gain legal profiles, an
-- organizational hierarchy (cycle-checked in the service, self-parenting rejected here),
-- and scoped status; contacts carry MD/GM, CFO/FD and audit-liaison routing roles with one
-- primary contact per role; leads record multi-channel intake with duplicate visibility and
-- a gated profile-to-proposal progression.

ALTER TABLE "Client"
  ADD COLUMN "legalName" text,
  ADD COLUMN "taxId" text,
  ADD COLUMN "legalForm" text,
  ADD COLUMN "address" text,
  ADD COLUMN "status" text NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  ADD COLUMN "parentClientId" uuid REFERENCES "Client"("id") ON DELETE RESTRICT;
ALTER TABLE "Client" ADD CONSTRAINT client_parent_not_self CHECK ("parentClientId" IS NULL OR "parentClientId" <> "id");
CREATE INDEX client_parent_idx ON "Client" ("parentClientId");

CREATE TABLE "ClientContact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "name" text NOT NULL CHECK (length("name") BETWEEN 2 AND 200),
  "email" text NOT NULL CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  "role" text NOT NULL CHECK ("role" IN ('MANAGING_DIRECTOR', 'CFO_FD', 'AUDIT_LIAISON')),
  "isPrimary" boolean NOT NULL DEFAULT false,
  "createdBy" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("firmId", "clientId") REFERENCES "Client"("firmId", "id") ON DELETE RESTRICT
);
-- One primary contact per role per client: routing is deterministic.
CREATE UNIQUE INDEX client_contact_primary_role_idx ON "ClientContact" ("clientId", "role") WHERE "isPrimary";

CREATE TABLE "Lead" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "source" text NOT NULL CHECK ("source" IN ('PHONE', 'WHATSAPP', 'EMAIL', 'WEB', 'REFERRAL')),
  "legalName" text NOT NULL CHECK (length("legalName") BETWEEN 3 AND 200),
  "contactName" text,
  "contactEmail" text,
  "scope" text,
  "status" text NOT NULL DEFAULT 'NEW' CHECK ("status" IN ('NEW', 'PROFILED', 'PROPOSAL_ENTRY', 'CONVERTED', 'REJECTED')),
  "duplicateOfId" uuid REFERENCES "Lead"("id") ON DELETE SET NULL,
  "createdBy" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_firm_status_idx ON "Lead" ("firmId", "status");
