-- T036: versioned firm templates/assets with append-only approval and activation history.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK ("capability" IN (
  'ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE',
  'TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR',
  'REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND',
  'COMMERCIAL_MANAGE','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD',
  'TEAM_ASSIGNMENT_MANAGE','EXTERNAL_COMMUNICATION_READ','EXTERNAL_COMMUNICATION_SEND','EXTERNAL_COMMUNICATION_RECONCILE',
  'DOCUMENT_TEMPLATE_MANAGE'
));
ALTER TABLE "FirmRepository" DROP CONSTRAINT "FirmRepository_binding_check";
ALTER TABLE "FirmRepository" ADD CONSTRAINT "FirmRepository_binding_check" CHECK (
  "purpose" IN ('practice-private','template-assets-private') AND "provider" = 'graph' AND
  length(trim("driveId")) > 0 AND length(trim("folderId")) > 0
);

CREATE TABLE "DocumentTemplate" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  kind VARCHAR(40) NOT NULL,
  "engagementType" VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY (id),
  CONSTRAINT document_template_version_check CHECK (version > 0),
  CONSTRAINT document_template_kind_check CHECK (kind IN ('BRIEF_QUOTATION','COMPREHENSIVE_PROPOSAL','ENGAGEMENT_LETTER','D1_AUDITOR_REPORT','D2_MANAGEMENT_LETTER','D3_REPRESENTATION_LETTER','D4_CORRESPONDENCE_TRAIL','D5_FINAL_FEE_NOTE')),
  CONSTRAINT document_template_engagement_type_check CHECK ("engagementType" IN ('EXTERNAL_STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES')),
  CONSTRAINT "DocumentTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentTemplate_firmId_id_key" ON "DocumentTemplate"("firmId",id);
CREATE UNIQUE INDEX "DocumentTemplate_firmId_kind_engagementType_key" ON "DocumentTemplate"("firmId",kind,"engagementType");
CREATE INDEX "DocumentTemplate_firmId_kind_engagementType_idx" ON "DocumentTemplate"("firmId",kind,"engagementType");

CREATE TABLE "DocumentTemplateVersion" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  sequence INTEGER NOT NULL,
  blocks JSONB NOT NULL,
  "allowedVariables" JSONB NOT NULL,
  "contentSha256" VARCHAR(64) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY (id),
  CONSTRAINT document_template_sequence_check CHECK (sequence > 0),
  CONSTRAINT document_template_content_hash_check CHECK ("contentSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_template_blocks_check CHECK (jsonb_typeof(blocks) = 'array' AND jsonb_array_length(blocks) BETWEEN 1 AND 100),
  CONSTRAINT document_template_variables_check CHECK (jsonb_typeof("allowedVariables") = 'array' AND jsonb_array_length("allowedVariables") <= 30),
  CONSTRAINT "DocumentTemplateVersion_template_scope_fkey" FOREIGN KEY ("firmId","templateId") REFERENCES "DocumentTemplate"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentTemplateVersion_firmId_templateId_id_key" ON "DocumentTemplateVersion"("firmId","templateId",id);
CREATE UNIQUE INDEX "DocumentTemplateVersion_firmId_templateId_sequence_key" ON "DocumentTemplateVersion"("firmId","templateId",sequence);
CREATE INDEX "DocumentTemplateVersion_firmId_templateId_sequence_idx" ON "DocumentTemplateVersion"("firmId","templateId",sequence);

CREATE TABLE "FirmApprovedAsset" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  key VARCHAR(100) NOT NULL,
  category VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirmApprovedAsset_pkey" PRIMARY KEY (id),
  CONSTRAINT approved_asset_version_check CHECK (version > 0),
  CONSTRAINT approved_asset_category_check CHECK (category IN ('FIRM_PROFILE','REGISTRATION','CREDENTIAL','TEAM_CV','PARTNER_SIGNATURE','FIRM_SEAL')),
  CONSTRAINT "FirmApprovedAsset_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmApprovedAsset_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FirmApprovedAsset_firmId_id_key" ON "FirmApprovedAsset"("firmId",id);
CREATE UNIQUE INDEX "FirmApprovedAsset_firmId_key_key" ON "FirmApprovedAsset"("firmId",key);
CREATE INDEX "FirmApprovedAsset_firmId_category_idx" ON "FirmApprovedAsset"("firmId",category);

CREATE TABLE "FirmApprovedAssetVersion" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  sequence INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'UPLOADING',
  "storageKey" TEXT NOT NULL,
  "storageReference" TEXT,
  provider VARCHAR(24),
  "driveId" TEXT,
  "itemId" TEXT,
  "versionId" TEXT,
  "eTag" TEXT,
  "originalFilename" VARCHAR(200) NOT NULL,
  "contentType" VARCHAR(80) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirmApprovedAssetVersion_pkey" PRIMARY KEY (id),
  CONSTRAINT approved_asset_sequence_check CHECK (sequence > 0),
  CONSTRAINT approved_asset_status_check CHECK (status IN ('UPLOADING','CLEANING','CLEANED','STORED')),
  CONSTRAINT approved_asset_hash_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT approved_asset_size_check CHECK ("sizeBytes" BETWEEN 1 AND 5000000),
  CONSTRAINT approved_asset_content_type_check CHECK ("contentType" IN ('application/pdf','image/png','image/jpeg')),
  CONSTRAINT approved_asset_storage_state_check CHECK (
    ("storageReference" IS NULL AND provider IS NULL AND "driveId" IS NULL AND "itemId" IS NULL AND "versionId" IS NULL AND "eTag" IS NULL)
    OR ("storageReference" IS NOT NULL AND provider = 'graph' AND "driveId" IS NOT NULL AND "itemId" IS NOT NULL AND "versionId" IS NOT NULL AND "eTag" IS NOT NULL)
    OR ("storageReference" IS NOT NULL AND provider = 'local-s3' AND "driveId" IS NULL AND "itemId" IS NULL AND "versionId" IS NOT NULL AND "eTag" IS NULL)
  ),
  CONSTRAINT "FirmApprovedAssetVersion_asset_scope_fkey" FOREIGN KEY ("firmId","assetId") REFERENCES "FirmApprovedAsset"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmApprovedAssetVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FirmApprovedAssetVersion_storageKey_key" ON "FirmApprovedAssetVersion"("storageKey");
CREATE UNIQUE INDEX "FirmApprovedAssetVersion_storageReference_key" ON "FirmApprovedAssetVersion"("storageReference");
CREATE UNIQUE INDEX "FirmApprovedAssetVersion_firmId_assetId_id_key" ON "FirmApprovedAssetVersion"("firmId","assetId",id);
CREATE UNIQUE INDEX "FirmApprovedAssetVersion_firmId_assetId_sequence_key" ON "FirmApprovedAssetVersion"("firmId","assetId",sequence);
CREATE UNIQUE INDEX "FirmApprovedAssetVersion_driveId_itemId_versionId_key" ON "FirmApprovedAssetVersion"("driveId","itemId","versionId");
CREATE INDEX "FirmApprovedAssetVersion_firmId_assetId_sequence_idx" ON "FirmApprovedAssetVersion"("firmId","assetId",sequence);
CREATE INDEX "FirmApprovedAssetVersion_firmId_status_createdAt_idx" ON "FirmApprovedAssetVersion"("firmId",status,"createdAt");

CREATE TABLE "DocumentTemplateApproval" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "templateVersionId" UUID NOT NULL,
  action VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateApproval_pkey" PRIMARY KEY (id),
  CONSTRAINT document_template_approval_action_check CHECK (action IN ('APPROVED','REVOKED')),
  CONSTRAINT document_template_approval_reason_check CHECK (length(trim(reason)) >= 10),
  CONSTRAINT "DocumentTemplateApproval_template_scope_fkey" FOREIGN KEY ("firmId","templateId") REFERENCES "DocumentTemplate"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateApproval_version_scope_fkey" FOREIGN KEY ("firmId","templateId","templateVersionId") REFERENCES "DocumentTemplateVersion"("firmId","templateId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateApproval_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DocumentTemplateApproval_firmId_templateId_templateVersionId_createdAt_idx" ON "DocumentTemplateApproval"("firmId","templateId","templateVersionId","createdAt");

CREATE TABLE "DocumentTemplateActivation" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "templateVersionId" UUID,
  action VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateActivation_pkey" PRIMARY KEY (id),
  CONSTRAINT document_template_activation_action_check CHECK (action IN ('ACTIVATED','DEACTIVATED')),
  CONSTRAINT document_template_activation_version_check CHECK ((action = 'ACTIVATED' AND "templateVersionId" IS NOT NULL) OR (action = 'DEACTIVATED' AND "templateVersionId" IS NULL)),
  CONSTRAINT document_template_activation_reason_check CHECK (length(trim(reason)) >= 10),
  CONSTRAINT "DocumentTemplateActivation_template_scope_fkey" FOREIGN KEY ("firmId","templateId") REFERENCES "DocumentTemplate"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateActivation_version_scope_fkey" FOREIGN KEY ("firmId","templateId","templateVersionId") REFERENCES "DocumentTemplateVersion"("firmId","templateId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateActivation_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DocumentTemplateActivation_firmId_templateId_createdAt_idx" ON "DocumentTemplateActivation"("firmId","templateId","createdAt");

CREATE TABLE "FirmApprovedAssetApproval" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "versionId" UUID NOT NULL,
  action VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirmApprovedAssetApproval_pkey" PRIMARY KEY (id),
  CONSTRAINT approved_asset_approval_action_check CHECK (action IN ('APPROVED','REVOKED')),
  CONSTRAINT approved_asset_approval_reason_check CHECK (length(trim(reason)) >= 10),
  CONSTRAINT "FirmApprovedAssetApproval_asset_scope_fkey" FOREIGN KEY ("firmId","assetId") REFERENCES "FirmApprovedAsset"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmApprovedAssetApproval_version_scope_fkey" FOREIGN KEY ("firmId","assetId","versionId") REFERENCES "FirmApprovedAssetVersion"("firmId","assetId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmApprovedAssetApproval_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FirmApprovedAssetApproval_firmId_assetId_versionId_createdAt_idx" ON "FirmApprovedAssetApproval"("firmId","assetId","versionId","createdAt");

CREATE TABLE "DocumentTemplateVersionAsset" (
  id UUID NOT NULL,
  "firmId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "templateVersionId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "assetVersionId" UUID NOT NULL,
  "use" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateVersionAsset_pkey" PRIMARY KEY (id),
  CONSTRAINT document_template_asset_use_check CHECK ("use" IN ('FIRM_PROFILE','REGISTRATION','CREDENTIAL','TEAM_CV','PARTNER_SIGNATURE','FIRM_SEAL')),
  CONSTRAINT "DocumentTemplateVersionAsset_template_version_fkey" FOREIGN KEY ("firmId","templateId","templateVersionId") REFERENCES "DocumentTemplateVersion"("firmId","templateId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateVersionAsset_asset_fkey" FOREIGN KEY ("firmId","assetId") REFERENCES "FirmApprovedAsset"("firmId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTemplateVersionAsset_asset_version_fkey" FOREIGN KEY ("firmId","assetId","assetVersionId") REFERENCES "FirmApprovedAssetVersion"("firmId","assetId",id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentTemplateVersionAsset_templateVersionId_assetVersionId_use_key" ON "DocumentTemplateVersionAsset"("templateVersionId","assetVersionId","use");
CREATE UNIQUE INDEX "DocumentTemplateVersionAsset_signature_use_key" ON "DocumentTemplateVersionAsset"("templateVersionId","use") WHERE "use" IN ('PARTNER_SIGNATURE','FIRM_SEAL');
CREATE INDEX "DocumentTemplateVersionAsset_firmId_templateVersionId_idx" ON "DocumentTemplateVersionAsset"("firmId","templateVersionId");

CREATE OR REPLACE FUNCTION reject_immutable_template_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME; END;
$$;
CREATE TRIGGER document_template_identity_no_delete BEFORE DELETE ON "DocumentTemplate" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER approved_asset_identity_no_delete BEFORE DELETE ON "FirmApprovedAsset" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER document_template_version_append_only BEFORE UPDATE OR DELETE ON "DocumentTemplateVersion" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER document_template_approval_append_only BEFORE UPDATE OR DELETE ON "DocumentTemplateApproval" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER document_template_activation_append_only BEFORE UPDATE OR DELETE ON "DocumentTemplateActivation" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER document_template_asset_append_only BEFORE UPDATE OR DELETE ON "DocumentTemplateVersionAsset" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER firm_approved_asset_approval_append_only BEFORE UPDATE OR DELETE ON "FirmApprovedAssetApproval" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();
CREATE TRIGGER firm_approved_asset_version_append_only BEFORE DELETE ON "FirmApprovedAssetVersion" FOR EACH ROW EXECUTE FUNCTION reject_immutable_template_row();

CREATE OR REPLACE FUNCTION constrain_template_parent_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."firmId" <> OLD."firmId" OR NEW.kind <> OLD.kind OR NEW."engagementType" <> OLD."engagementType"
    OR NEW.name <> OLD.name OR NEW."createdBy" <> OLD."createdBy" OR NEW."createdAt" <> OLD."createdAt"
    OR NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'DocumentTemplate identity is immutable; append a sequential revision'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_template_revision BEFORE UPDATE ON "DocumentTemplate" FOR EACH ROW EXECUTE FUNCTION constrain_template_parent_revision();

CREATE OR REPLACE FUNCTION constrain_asset_parent_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."firmId" <> OLD."firmId" OR NEW.key <> OLD.key OR NEW.category <> OLD.category
    OR NEW.name <> OLD.name OR NEW."createdBy" <> OLD."createdBy" OR NEW."createdAt" <> OLD."createdAt"
    OR NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'FirmApprovedAsset identity is immutable; append a sequential revision'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER approved_asset_revision BEFORE UPDATE ON "FirmApprovedAsset" FOR EACH ROW EXECUTE FUNCTION constrain_asset_parent_revision();

CREATE OR REPLACE FUNCTION finalize_approved_asset_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_category TEXT;
BEGIN
  SELECT category INTO asset_category FROM "FirmApprovedAsset" WHERE id = NEW."assetId" AND "firmId" = NEW."firmId" FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF (asset_category IN ('PARTNER_SIGNATURE','FIRM_SEAL') AND NEW."contentType" NOT IN ('image/png','image/jpeg'))
      OR NEW.status <> 'UPLOADING' OR NEW."storageReference" IS NOT NULL OR NEW.provider IS NOT NULL
      OR NEW."driveId" IS NOT NULL OR NEW."itemId" IS NOT NULL OR NEW."versionId" IS NOT NULL OR NEW."eTag" IS NOT NULL THEN
      RAISE EXCEPTION 'Approved asset initial version must be a private, tracked upload';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW."firmId" <> OLD."firmId" OR NEW."assetId" <> OLD."assetId" OR NEW.sequence <> OLD.sequence
    OR NEW."storageKey" <> OLD."storageKey" OR NEW."originalFilename" <> OLD."originalFilename"
    OR NEW."contentType" <> OLD."contentType" OR NEW.sha256 <> OLD.sha256 OR NEW."sizeBytes" <> OLD."sizeBytes"
    OR NEW."createdBy" <> OLD."createdBy" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Approved asset upload bytes and identity are immutable';
  END IF;
  IF OLD.status = 'UPLOADING' AND NEW.status = 'UPLOADING' THEN
    IF OLD."storageReference" IS NOT NULL OR NEW."storageReference" IS NULL OR NEW.provider NOT IN ('graph','local-s3') THEN
      RAISE EXCEPTION 'An upload reference may be recorded exactly once';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'UPLOADING' AND NEW.status = 'STORED' THEN
    IF NEW."storageReference" IS NULL OR NEW.provider IS NULL OR NEW.provider NOT IN ('graph','local-s3') THEN
      RAISE EXCEPTION 'Only a provider-verified asset upload may be finalized';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('UPLOADING','CLEANING') AND NEW.status = 'CLEANING' THEN
    IF NEW."storageReference" IS DISTINCT FROM OLD."storageReference" OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW."driveId" IS DISTINCT FROM OLD."driveId" OR NEW."itemId" IS DISTINCT FROM OLD."itemId"
      OR NEW."versionId" IS DISTINCT FROM OLD."versionId" OR NEW."eTag" IS DISTINCT FROM OLD."eTag" THEN
      RAISE EXCEPTION 'Cleanup claims cannot change the staged provider identity';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'CLEANING' AND NEW.status = 'CLEANED' THEN
    IF NEW."storageReference" IS DISTINCT FROM OLD."storageReference" OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW."driveId" IS DISTINCT FROM OLD."driveId" OR NEW."itemId" IS DISTINCT FROM OLD."itemId"
      OR NEW."versionId" IS DISTINCT FROM OLD."versionId" OR NEW."eTag" IS DISTINCT FROM OLD."eTag" THEN
      RAISE EXCEPTION 'Completed cleanup must preserve the staged provider identity';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Approved asset upload has an invalid state transition';
END;
$$;
CREATE TRIGGER approved_asset_version_finalize BEFORE INSERT OR UPDATE ON "FirmApprovedAssetVersion" FOR EACH ROW EXECUTE FUNCTION finalize_approved_asset_version();

CREATE OR REPLACE FUNCTION require_approved_template_asset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_category TEXT; latest_action TEXT;
BEGIN
  SELECT category INTO asset_category FROM "FirmApprovedAsset" WHERE id = NEW."assetId" AND "firmId" = NEW."firmId";
  SELECT action INTO latest_action FROM "FirmApprovedAssetApproval" WHERE "firmId" = NEW."firmId" AND "assetId" = NEW."assetId" AND "versionId" = NEW."assetVersionId" ORDER BY "createdAt" DESC,id DESC LIMIT 1;
  IF latest_action IS DISTINCT FROM 'APPROVED' OR asset_category IS DISTINCT FROM NEW."use"
    OR NOT EXISTS (SELECT 1 FROM "FirmApprovedAssetVersion" v WHERE v.id = NEW."assetVersionId" AND v."assetId" = NEW."assetId" AND v."firmId" = NEW."firmId" AND v.status = 'STORED') THEN
    RAISE EXCEPTION 'Template assets must bind the stored approved exact version and matching asset category';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_asset_approval_required BEFORE INSERT ON "DocumentTemplateVersionAsset" FOR EACH ROW EXECUTE FUNCTION require_approved_template_asset();

CREATE OR REPLACE FUNCTION prevent_revoking_active_template_assets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action = 'REVOKED' AND EXISTS (
    SELECT 1 FROM "DocumentTemplateVersionAsset" link
    JOIN "DocumentTemplateActivation" event ON event."firmId" = link."firmId" AND event."templateId" = link."templateId"
      AND event."templateVersionId" = link."templateVersionId" AND event.action = 'ACTIVATED'
    WHERE link."firmId" = NEW."firmId" AND link."assetId" = NEW."assetId" AND link."assetVersionId" = NEW."versionId"
      AND NOT EXISTS (
        SELECT 1 FROM "DocumentTemplateActivation" later
        WHERE later."firmId" = event."firmId" AND later."templateId" = event."templateId"
          AND (later."createdAt",later.id) > (event."createdAt",event.id)
      )
  ) THEN RAISE EXCEPTION 'Deactivate active templates before revoking artwork'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER asset_revoke_active_template_guard BEFORE INSERT ON "FirmApprovedAssetApproval" FOR EACH ROW EXECUTE FUNCTION prevent_revoking_active_template_assets();

CREATE OR REPLACE FUNCTION prevent_revoking_active_template_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action = 'REVOKED' AND EXISTS (
    SELECT 1 FROM "DocumentTemplateActivation" event
    WHERE event."firmId" = NEW."firmId" AND event."templateId" = NEW."templateId"
      AND event."templateVersionId" = NEW."templateVersionId" AND event.action = 'ACTIVATED'
      AND NOT EXISTS (
        SELECT 1 FROM "DocumentTemplateActivation" later
        WHERE later."firmId" = event."firmId" AND later."templateId" = event."templateId"
          AND (later."createdAt",later.id) > (event."createdAt",event.id)
      )
  ) THEN RAISE EXCEPTION 'Deactivate a template before revoking its active version'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_revoke_active_version_guard BEFORE INSERT ON "DocumentTemplateApproval" FOR EACH ROW EXECUTE FUNCTION prevent_revoking_active_template_version();

CREATE OR REPLACE FUNCTION require_approved_template_activation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_action TEXT;
BEGIN
  IF NEW.action = 'ACTIVATED' THEN
    SELECT action INTO latest_action FROM "DocumentTemplateApproval" WHERE "firmId" = NEW."firmId" AND "templateId" = NEW."templateId" AND "templateVersionId" = NEW."templateVersionId" ORDER BY "createdAt" DESC,id DESC LIMIT 1;
    IF latest_action IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'Only an approved exact template version can be activated'; END IF;
    IF EXISTS (
      SELECT 1 FROM "DocumentTemplateVersionAsset" a
      WHERE a."firmId" = NEW."firmId" AND a."templateId" = NEW."templateId" AND a."templateVersionId" = NEW."templateVersionId"
        AND (SELECT d.action FROM "FirmApprovedAssetApproval" d WHERE d."firmId" = a."firmId" AND d."assetId" = a."assetId" AND d."versionId" = a."assetVersionId" ORDER BY d."createdAt" DESC,d.id DESC LIMIT 1) IS DISTINCT FROM 'APPROVED'
    ) THEN RAISE EXCEPTION 'An active template cannot reference a revoked asset version'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_activation_requires_approval BEFORE INSERT ON "DocumentTemplateActivation" FOR EACH ROW EXECUTE FUNCTION require_approved_template_activation();

CREATE OR REPLACE FUNCTION require_stored_asset_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status TEXT;
BEGIN
  SELECT status INTO current_status FROM "FirmApprovedAssetVersion" WHERE id = NEW."versionId" AND "assetId" = NEW."assetId" AND "firmId" = NEW."firmId" FOR UPDATE;
  IF current_status <> 'STORED' THEN RAISE EXCEPTION 'Only a completed provider upload may be approved'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stored_asset_approval_required BEFORE INSERT ON "FirmApprovedAssetApproval" FOR EACH ROW EXECUTE FUNCTION require_stored_asset_approval();
