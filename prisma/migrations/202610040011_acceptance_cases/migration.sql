-- T056-T059: the acceptance/continuance questionnaire system feeding the dual-key gate's
-- Key 2. A case records the track (new client or continuance), the exact template version it
-- answers, structured answers with evidence references, and the partner clearance that cites
-- the reviewed version. Post-clearance answers bump the review version and require re-clearance.

CREATE TABLE "AcceptanceCase" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL UNIQUE,
  "track" text NOT NULL CHECK ("track" IN ('NEW_CLIENT', 'CONTINUANCE')),
  "templateVersion" text NOT NULL CHECK (length("templateVersion") BETWEEN 1 AND 40),
  "answers" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'REVIEW_COMPLETE', 'CLEARED')),
  "reviewVersion" integer NOT NULL DEFAULT 1 CHECK ("reviewVersion" >= 1),
  "completedBy" uuid REFERENCES "User"("id") ON DELETE RESTRICT,
  "completedAt" timestamptz,
  "clearedBy" uuid REFERENCES "User"("id") ON DELETE RESTRICT,
  "clearedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT
);

-- The Key 2 clearance must cite the acceptance case and the exact reviewed version.
ALTER TABLE "RiskClearance"
  ADD COLUMN "acceptanceCaseId" uuid REFERENCES "AcceptanceCase"("id") ON DELETE RESTRICT,
  ADD COLUMN "reviewVersion" integer;
