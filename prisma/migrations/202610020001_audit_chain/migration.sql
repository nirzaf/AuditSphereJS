-- Sidecar records preserve historical AuditEvent bytes. All inserts, including legacy
-- module call sites, pass through the same transactionally serialized chain writer.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE "AuditChainHead" (
  "engagementId" uuid PRIMARY KEY,
  "sequence" bigint NOT NULL CHECK ("sequence" >= 0),
  "digest" text NOT NULL CHECK (length("digest") = 64)
);
CREATE TABLE "AuditChainRecord" (
  "eventId" uuid PRIMARY KEY REFERENCES "AuditEvent"(id) ON DELETE RESTRICT,
  "engagementId" uuid NOT NULL,
  "sequence" bigint NOT NULL CHECK ("sequence" > 0),
  "formatVersion" integer NOT NULL CHECK ("formatVersion" = 1),
  "previousDigest" text NOT NULL CHECK (length("previousDigest") = 64),
  "digest" text NOT NULL CHECK (length("digest") = 64),
  "canonicalText" text NOT NULL,
  UNIQUE ("engagementId", "sequence")
);
CREATE FUNCTION audit_event_canonical(event public."AuditEvent") RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('formatVersion', 1, 'id', event.id,
    'engagementId', event."engagementId", 'actorId', event."actorId",
    'action', event.action, 'payload', event.payload,
    'createdAt', to_char(event."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US'))::text
$$;
CREATE FUNCTION audit_chain_append(event public."AuditEvent") RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE head public."AuditChainHead"; canonical text; next_digest text;
BEGIN
  INSERT INTO public."AuditChainHead" VALUES (event."engagementId", 0, repeat('0', 64)) ON CONFLICT DO NOTHING;
  SELECT * INTO head FROM public."AuditChainHead" WHERE "engagementId" = event."engagementId" FOR UPDATE;
  canonical := public.audit_event_canonical(event);
  next_digest := encode(public.digest(convert_to(head.digest || E'\n' || canonical, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public."AuditChainRecord" VALUES (event.id, event."engagementId", head.sequence + 1, 1, head.digest, next_digest, canonical);
  UPDATE public."AuditChainHead" SET sequence = head.sequence + 1, digest = next_digest WHERE "engagementId" = event."engagementId";
END $$;
REVOKE ALL ON FUNCTION audit_chain_append(public."AuditEvent") FROM PUBLIC;
-- The historical chain begins at migration time; it does not attest that pre-existing
-- events were intact before this migration. No AuditEvent is updated or deleted.
DO $$ DECLARE event public."AuditEvent"; BEGIN
  FOR event IN SELECT * FROM public."AuditEvent" ORDER BY "engagementId", "createdAt", id LOOP
    PERFORM public.audit_chain_append(event);
  END LOOP;
END $$;
CREATE FUNCTION audit_chain_insert_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN PERFORM public.audit_chain_append(NEW); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION audit_chain_insert_trigger() FROM PUBLIC;
CREATE TRIGGER audit_chain_on_insert AFTER INSERT ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION audit_chain_insert_trigger();
CREATE FUNCTION audit_chain_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit chain records are immutable'; END $$;
CREATE TRIGGER audit_chain_record_immutable BEFORE UPDATE OR DELETE ON "AuditChainRecord"
FOR EACH ROW EXECUTE FUNCTION audit_chain_immutable();
REVOKE ALL ON "AuditChainHead", "AuditChainRecord" FROM PUBLIC;
