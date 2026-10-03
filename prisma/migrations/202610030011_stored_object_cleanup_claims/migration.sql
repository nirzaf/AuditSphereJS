-- Track storage writes and cleanup claims so a sweeper cannot delete an object while a
-- finalization transaction is attaching it as immutable evidence.
ALTER TABLE "StoredObject" DROP CONSTRAINT stored_object_status_check;
ALTER TABLE "StoredObject" ADD CONSTRAINT stored_object_status_check
  CHECK ("status" IN ('UPLOADING', 'PENDING', 'REFERENCED', 'DUPLICATE', 'CLEANING', 'CLEANED'));
ALTER TABLE "StoredObject" ADD COLUMN "cleanupStartedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION prevent_invalid_stored_object_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."status" = 'UPLOADING' AND NEW."status" IN ('PENDING', 'CLEANING')) OR
    (OLD."status" = 'PENDING' AND NEW."status" IN ('REFERENCED', 'DUPLICATE', 'CLEANING')) OR
    (OLD."status" = 'DUPLICATE' AND NEW."status" = 'CLEANING') OR
    (OLD."status" = 'CLEANING' AND NEW."status" IN ('PENDING', 'DUPLICATE', 'CLEANED'))
  ) THEN
    RAISE EXCEPTION 'invalid stored object state transition: % -> %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'REFERENCED' AND (NEW."documentId" IS NULL OR NEW."resolvedAt" IS NULL) THEN
    RAISE EXCEPTION 'referenced stored objects require a document and resolution time';
  END IF;
  IF NEW."status" <> 'REFERENCED' AND NEW."documentId" IS NOT NULL THEN
    RAISE EXCEPTION 'unreferenced stored objects cannot point to a document';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stored_object_transition_guard
BEFORE UPDATE ON "StoredObject"
FOR EACH ROW EXECUTE FUNCTION prevent_invalid_stored_object_transition();
