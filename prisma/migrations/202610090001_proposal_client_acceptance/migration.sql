-- B03 security correction: acceptance credentials cannot authenticate staff or grant portal access.
ALTER TABLE "PortalCredentialToken"
  ADD COLUMN "proposalId" uuid REFERENCES "CommercialProposal"(id) ON DELETE RESTRICT,
  ADD COLUMN "proposalRevision" integer,
  ADD COLUMN "termsDigest" varchar(64);
ALTER TABLE "PortalCredentialToken" DROP CONSTRAINT "PortalCredentialToken_purpose_check";
ALTER TABLE "PortalCredentialToken" ADD CONSTRAINT "PortalCredentialToken_purpose_check"
  CHECK (purpose IN ('INVITATION', 'PASSWORD_RESET', 'PROPOSAL_ACCEPTANCE'));
ALTER TABLE "PortalCredentialToken" ADD CONSTRAINT proposal_credential_binding_check CHECK (
  (purpose = 'PROPOSAL_ACCEPTANCE' AND "portalMembershipId" IS NOT NULL AND "proposalId" IS NOT NULL
    AND "proposalRevision" IS NOT NULL AND "proposalRevision" > 0 AND "termsDigest" IS NOT NULL AND "termsDigest" ~ '^[0-9a-f]{64}$')
  OR (purpose <> 'PROPOSAL_ACCEPTANCE' AND "proposalId" IS NULL AND "proposalRevision" IS NULL AND "termsDigest" IS NULL)
);
ALTER TABLE "AuditEvent" DROP CONSTRAINT audit_event_actor_kind_check;
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_event_actor_kind_check CHECK ("actorKind" IN ('USER', 'SERVICE', 'PORTAL'));
ALTER TABLE "AuditEvent" DROP CONSTRAINT audit_event_actor_traceability_check;
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_event_actor_traceability_check CHECK (
  ("actorKind" IN ('USER', 'PORTAL') AND "actorId" IS NOT NULL)
  OR ("actorKind" = 'SERVICE' AND "correlationId" IS NOT NULL AND length("correlationId") BETWEEN 1 AND 200)
);
CREATE FUNCTION validate_proposal_credential_binding() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.purpose = 'PROPOSAL_ACCEPTANCE' THEN RAISE EXCEPTION 'Proposal acceptance credentials are append-only'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.purpose = 'PROPOSAL_ACCEPTANCE' AND NOT EXISTS (
    SELECT 1 FROM "CommercialProposal" p JOIN "PortalMembership" m
      ON m."firmId" = p."firmId" AND m."clientId" = p."clientId" AND m."engagementId" = p."engagementId"
    WHERE p.id = NEW."proposalId" AND m.id = NEW."portalMembershipId" AND m."portalUserId" = NEW."portalUserId"
  ) THEN RAISE EXCEPTION 'Proposal credential membership scope does not match'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.purpose = 'PROPOSAL_ACCEPTANCE' THEN
    IF (to_jsonb(NEW) - 'consumedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'consumedAt')
      OR OLD."consumedAt" IS NOT NULL THEN RAISE EXCEPTION 'Proposal credential binding is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER proposal_credential_binding BEFORE INSERT OR UPDATE OR DELETE ON "PortalCredentialToken"
  FOR EACH ROW EXECUTE FUNCTION validate_proposal_credential_binding();
-- Preserve past evidence. Staff-recorded legacy acceptance is refused by the new Key 1 predicate.
CREATE FUNCTION freeze_accepted_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.status = 'ACCEPTED' THEN RAISE EXCEPTION 'Accepted proposal terms are immutable; create a new revision'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER accepted_proposal_immutable BEFORE UPDATE OR DELETE ON "CommercialProposal"
  FOR EACH ROW EXECUTE FUNCTION freeze_accepted_proposal();
