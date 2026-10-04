-- T035: preserve the renderer and exact source snapshot identities with immutable PDF versions.
-- Ordinary uploaded files have NULL provenance; rendered artifacts carry a checked manifest.
ALTER TABLE "DocumentVersion"
  ADD COLUMN "renderProvenance" JSONB,
  ADD CONSTRAINT document_version_render_provenance_check CHECK (
    "renderProvenance" IS NULL OR (
      jsonb_typeof("renderProvenance") = 'object'
      AND "renderProvenance" ?& ARRAY[
        'schemaVersion', 'renderer', 'playwrightVersion', 'chromiumVersion',
        'templateId', 'templateVersion', 'templateSha256', 'dataSha256',
        'pageCount', 'blockedResourceCount'
      ]
      AND jsonb_typeof("renderProvenance"->'schemaVersion') = 'number'
      AND "renderProvenance"->>'schemaVersion' = '1'
      AND jsonb_typeof("renderProvenance"->'renderer') = 'string'
      AND "renderProvenance"->>'renderer' = 'playwright-chromium'
      AND jsonb_typeof("renderProvenance"->'playwrightVersion') = 'string'
      AND length("renderProvenance"->>'playwrightVersion') BETWEEN 1 AND 32
      AND jsonb_typeof("renderProvenance"->'chromiumVersion') = 'string'
      AND length("renderProvenance"->>'chromiumVersion') BETWEEN 1 AND 64
      AND jsonb_typeof("renderProvenance"->'templateId') = 'string'
      AND length("renderProvenance"->>'templateId') BETWEEN 1 AND 100
      AND jsonb_typeof("renderProvenance"->'templateVersion') = 'number'
      AND CASE
        WHEN "renderProvenance"->>'templateVersion' ~ '^[1-9][0-9]{0,9}$'
        THEN ("renderProvenance"->>'templateVersion')::BIGINT BETWEEN 1 AND 2147483647
        ELSE FALSE
      END
      AND jsonb_typeof("renderProvenance"->'templateSha256') = 'string'
      AND "renderProvenance"->>'templateSha256' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof("renderProvenance"->'dataSha256') = 'string'
      AND "renderProvenance"->>'dataSha256' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof("renderProvenance"->'pageCount') = 'number'
      AND CASE
        WHEN "renderProvenance"->>'pageCount' ~ '^[1-9][0-9]{0,2}$'
        THEN ("renderProvenance"->>'pageCount')::INTEGER BETWEEN 1 AND 100
        ELSE FALSE
      END
      AND jsonb_typeof("renderProvenance"->'blockedResourceCount') = 'number'
      AND CASE
        WHEN "renderProvenance"->>'blockedResourceCount' ~ '^(0|[1-9][0-9]{0,8})$'
        THEN ("renderProvenance"->>'blockedResourceCount')::INTEGER BETWEEN 0 AND 2147483647
        ELSE FALSE
      END
    )
  );
