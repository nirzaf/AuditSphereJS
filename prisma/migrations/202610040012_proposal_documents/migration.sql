-- T060-T062: versioned proposal documents (brief quote and comprehensive proposal) rendered
-- from the pinned proposal snapshot. A dispatched document is immutable; regeneration of the
-- same snapshot produces a new revision that retains the prior one for provenance.
CREATE TABLE "ProposalDocument" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "proposalId" uuid NOT NULL REFERENCES "CommercialProposal"("id") ON DELETE RESTRICT,
  "engagementId" uuid NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('BRIEF_QUOTE', 'COMPREHENSIVE')),
  "revision" integer NOT NULL CHECK ("revision" >= 1),
  "content" jsonb NOT NULL,
  "contentHash" text NOT NULL CHECK (length("contentHash") = 64),
  "dispatchedAt" timestamptz,
  "createdBy" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("proposalId", "kind", "revision")
);
CREATE FUNCTION prevent_dispatched_document_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."dispatchedAt" IS NOT NULL THEN RAISE EXCEPTION 'A dispatched proposal document is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_document_dispatched_immutable BEFORE UPDATE ON "ProposalDocument"
FOR EACH ROW WHEN (OLD."dispatchedAt" IS NOT NULL) EXECUTE FUNCTION prevent_dispatched_document_mutation();
CREATE TRIGGER proposal_document_delete_immutable BEFORE DELETE ON "ProposalDocument"
FOR EACH ROW WHEN (OLD."dispatchedAt" IS NOT NULL) EXECUTE FUNCTION prevent_dispatched_document_mutation();
