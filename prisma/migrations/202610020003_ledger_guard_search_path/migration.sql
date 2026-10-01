-- Resolve authoritative relations before the caller's temporary schema. Explicitly
-- placing pg_temp last prevents its implicit first position for relation lookups.
-- This is additive: the already-applied ledger migration is not rewritten.
ALTER FUNCTION practice_period_guard() SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION practice_line_guard() SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION practice_journal_guard() SET search_path TO pg_catalog, public, pg_temp;
