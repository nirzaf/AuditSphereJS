-- Durable Trial Balance validation evidence and advisory worker progress (T044).

-- Advisory progress: rows the current attempt has staged, written on its own connection so an
-- operator can see progress even when the staging transaction later rolls back.
ALTER TABLE background_operations ADD COLUMN "progressRows" integer;
ALTER TABLE background_operations ADD CONSTRAINT background_operations_progress_rows_check
  CHECK ("progressRows" IS NULL OR "progressRows" >= 0);

-- One record per rejected source-file line. Scope is bound to the import in PostgreSQL, and the
-- records are append-only so a later retry cannot rewrite the evidence of an earlier rejection.
CREATE TABLE "TbImportRowError" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "importId" uuid NOT NULL,
  "sourceLine" integer NOT NULL,
  message varchar(500) NOT NULL,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "TbImportRowError_sourceLine_check" CHECK ("sourceLine" >= 2),
  CONSTRAINT "TbImportRowError_import_scope_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId", "importId")
    REFERENCES "TbImport"("firmId", "clientId", "engagementId", id) ON DELETE RESTRICT,
  CONSTRAINT "TbImportRowError_importId_sourceLine_key" UNIQUE ("importId", "sourceLine")
);

CREATE FUNCTION tb_import_row_errors_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Trial-balance row validation records are append-only';
END;
$$;

CREATE TRIGGER "TbImportRowError_append_only" BEFORE UPDATE OR DELETE ON "TbImportRowError"
FOR EACH ROW EXECUTE FUNCTION tb_import_row_errors_append_only();
