-- Source-line and raw-value provenance for staged Trial Balance rows (T043).
-- Rows staged before this migration never recorded a source line; they keep both columns NULL and
-- must not be presented as traceable to an exact file row.
ALTER TABLE "TbRow"
  ADD COLUMN "sourceLine" integer,
  ADD COLUMN "rawValues" jsonb;

ALTER TABLE "TbRow" ADD CONSTRAINT "TbRow_source_provenance_check" CHECK (
  ("sourceLine" IS NULL AND "rawValues" IS NULL)
  OR ("sourceLine" >= 2 AND "rawValues" IS NOT NULL)
);

-- Source values are fixed once parsed. Mapping still updates fsli and version, and the
-- finalized-import trigger continues to block every change after finalization.
CREATE FUNCTION protect_staged_source_values() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."position" IS DISTINCT FROM NEW."position"
    OR OLD."importId" IS DISTINCT FROM NEW."importId"
    OR OLD.code IS DISTINCT FROM NEW.code
    OR OLD.name IS DISTINCT FROM NEW.name
    OR OLD.current IS DISTINCT FROM NEW.current
    OR OLD.prior IS DISTINCT FROM NEW.prior
    OR OLD."sourceLine" IS DISTINCT FROM NEW."sourceLine"
    OR OLD."rawValues" IS DISTINCT FROM NEW."rawValues" THEN
    RAISE EXCEPTION 'Staged trial-balance source values are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staged_source_values_immutable BEFORE UPDATE ON "TbRow"
FOR EACH ROW EXECUTE FUNCTION protect_staged_source_values();
