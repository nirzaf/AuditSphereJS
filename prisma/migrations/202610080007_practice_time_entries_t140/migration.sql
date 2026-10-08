-- T140: daily hours carry their phase, FSLI and description. Time entries stay immutable (the T139 guard
-- accepts INSERT only), so a correction appends a replacement entry and links it to the original.

ALTER TABLE "PracticeTimeEntry"
  ADD COLUMN "phase" varchar(32),
  ADD COLUMN "fsli" varchar(120),
  ADD COLUMN "description" varchar(500);

-- Entries recorded before this migration have no phase, FSLI or description. The service requires all three for
-- every new entry, and the checks below keep any value that is stored well-formed.
ALTER TABLE "PracticeTimeEntry" ADD CONSTRAINT "PracticeTimeEntry_phase_check"
  CHECK ("phase" IS NULL OR "phase" IN ('PLANNING', 'FIELDWORK', 'REVIEW', 'REPORTING'));
ALTER TABLE "PracticeTimeEntry" ADD CONSTRAINT "PracticeTimeEntry_fsli_check"
  CHECK ("fsli" IS NULL OR char_length(btrim("fsli")) >= 1);
ALTER TABLE "PracticeTimeEntry" ADD CONSTRAINT "PracticeTimeEntry_description_check"
  CHECK ("description" IS NULL OR char_length(btrim("description")) >= 3);

-- A correction links an original entry to the replacement that stands in its place. An entry can be corrected once;
-- correcting a replacement appends another link, so the chain of earlier values is never rewritten.
CREATE TABLE "PracticeTimeEntryCorrection" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "staffUserId" uuid NOT NULL,
  "originalEntryId" uuid NOT NULL,
  "replacementEntryId" uuid NOT NULL,
  reason varchar(500) NOT NULL,
  "correctedBy" uuid NOT NULL,
  "correctedAt" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PracticeTimeEntryCorrection_firmId_originalEntryId_key" UNIQUE ("firmId", "originalEntryId"),
  CONSTRAINT "PracticeTimeEntryCorrection_firmId_replacementEntryId_key" UNIQUE ("firmId", "replacementEntryId"),
  CONSTRAINT "PracticeTimeEntryCorrection_original_fkey" FOREIGN KEY ("firmId", "originalEntryId")
    REFERENCES "PracticeTimeEntry"("firmId", id) ON DELETE RESTRICT,
  CONSTRAINT "PracticeTimeEntryCorrection_replacement_fkey" FOREIGN KEY ("firmId", "replacementEntryId")
    REFERENCES "PracticeTimeEntry"("firmId", id) ON DELETE RESTRICT,
  CONSTRAINT "PracticeTimeEntryCorrection_correctedBy_fkey" FOREIGN KEY ("correctedBy")
    REFERENCES "User"(id) ON DELETE RESTRICT,
  CONSTRAINT "PracticeTimeEntryCorrection_reason_check" CHECK (char_length(btrim(reason)) >= 10),
  CONSTRAINT "PracticeTimeEntryCorrection_distinct_check" CHECK ("originalEntryId" <> "replacementEntryId")
);

CREATE INDEX "PracticeTimeEntryCorrection_firmId_engagementId_idx" ON "PracticeTimeEntryCorrection" ("firmId", "engagementId");

-- A correction must keep the engagement and the staff member of both entries it links.
CREATE FUNCTION practice_time_entry_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original "PracticeTimeEntry"%ROWTYPE;
  replacement "PracticeTimeEntry"%ROWTYPE;
BEGIN
  SELECT * INTO original FROM "PracticeTimeEntry" WHERE "firmId" = NEW."firmId" AND id = NEW."originalEntryId";
  SELECT * INTO replacement FROM "PracticeTimeEntry" WHERE "firmId" = NEW."firmId" AND id = NEW."replacementEntryId";
  IF original.id IS NULL OR replacement.id IS NULL THEN
    RAISE EXCEPTION 'Practice time correction entries were not found in this firm';
  END IF;
  IF original."engagementId" <> NEW."engagementId" OR replacement."engagementId" <> NEW."engagementId"
     OR original."staffUserId" <> NEW."staffUserId" OR replacement."staffUserId" <> NEW."staffUserId" THEN
    RAISE EXCEPTION 'A practice time correction must keep the engagement and the staff member of the original entry';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PracticeTimeEntryCorrection_guard" BEFORE INSERT ON "PracticeTimeEntryCorrection"
FOR EACH ROW EXECUTE FUNCTION practice_time_entry_correction_guard();

CREATE FUNCTION practice_time_entry_correction_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Practice time corrections are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "PracticeTimeEntryCorrection_append_only" BEFORE UPDATE OR DELETE ON "PracticeTimeEntryCorrection"
FOR EACH ROW EXECUTE FUNCTION practice_time_entry_correction_append_only();
