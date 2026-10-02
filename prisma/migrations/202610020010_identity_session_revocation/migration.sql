CREATE TABLE "IdentitySessionRevocation" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL,
    "revokedBefore" timestamp(3) NOT NULL,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentitySessionRevocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentitySessionRevocation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "IdentitySessionRevocation_userId_revokedBefore_idx"
  ON "IdentitySessionRevocation"("userId", "revokedBefore");

CREATE FUNCTION reject_identity_session_revocation_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Identity session revocations are append-only';
END;
$$;

CREATE TRIGGER identity_session_revocation_append_only
  BEFORE UPDATE OR DELETE ON "IdentitySessionRevocation"
  FOR EACH ROW EXECUTE FUNCTION reject_identity_session_revocation_mutation();
