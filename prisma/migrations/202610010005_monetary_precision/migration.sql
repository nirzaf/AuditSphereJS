-- MIG-002 / WP05: preserve the source's documented monetary precision.
--
-- The source persists money as decimal(19,6) (445 numeric(19,6) columns across its EF
-- migrations). The destination trial-balance columns were Decimal(20,2), which truncated
-- documented fractional precision on import and rounding of aggregates. numeric(28,6)
-- keeps six fractional digits and adds aggregation headroom (22 integer digits) without
-- narrowing any value that already exists.
ALTER TABLE "TbRow" ALTER COLUMN "current" TYPE DECIMAL(28,6) USING "current"::DECIMAL(28,6);
ALTER TABLE "TbRow" ALTER COLUMN "prior" TYPE DECIMAL(28,6) USING "prior"::DECIMAL(28,6);
