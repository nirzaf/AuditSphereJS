-- Practice owns its internal ledger. A reversal reference must point to a journal
-- in the same firm; posting-time checks still enforce status and exact inverse lines.
ALTER TABLE "PracticeJournal"
  DROP CONSTRAINT "PracticeJournal_reversalOf_fkey",
  ADD CONSTRAINT "PracticeJournal_reversal_scope_fkey"
    FOREIGN KEY ("firmId", "reversalOf")
    REFERENCES "PracticeJournal" ("firmId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
