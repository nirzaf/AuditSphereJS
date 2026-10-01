-- Financial and lifecycle guardrails independently enforced by PostgreSQL.
ALTER TABLE "Engagement" ADD CONSTRAINT engagement_state_check CHECK (state IN (
  'LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING',
  'PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL',
  'DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'));
ALTER TABLE "User" ADD CONSTRAINT internal_role_check CHECK (role IN ('PREPARER','REVIEWER','APPROVER','ADMIN'));
ALTER TABLE "TbImport" ADD CONSTRAINT import_status_check CHECK (status IN ('UPLOADED','QUEUED','PARSING','VALIDATING','MAPPING_REQUIRED','READY_TO_FINALIZE','FINALIZING','FINALIZED','FAILED'));
ALTER TABLE "Document" ADD CONSTRAINT document_engagement_fk FOREIGN KEY ("engagementId") REFERENCES "Engagement"(id);
ALTER TABLE "TbImport" ADD CONSTRAINT import_document_fk FOREIGN KEY ("documentId") REFERENCES "Document"(id);

CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE FUNCTION protect_finalized_rows() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN batch_id := OLD."importId"; ELSE batch_id := NEW."importId"; END IF;
  IF EXISTS (SELECT 1 FROM "TbImport" WHERE id = batch_id AND status = 'FINALIZED') THEN
    RAISE EXCEPTION 'Finalized import is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER finalized_rows_immutable BEFORE INSERT OR UPDATE OR DELETE ON "TbRow"
FOR EACH ROW EXECUTE FUNCTION protect_finalized_rows();
