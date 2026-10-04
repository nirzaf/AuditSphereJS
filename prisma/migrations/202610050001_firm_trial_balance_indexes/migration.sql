CREATE INDEX "PracticePeriod_firm_starts_on_idx" ON "PracticePeriod"("firmId", "startsOn");
CREATE INDEX "PracticeJournal_firm_status_date_idx" ON "PracticeJournal"("firmId", status, "accountingDate");
CREATE INDEX "PracticeJournalLine_firm_journal_account_idx" ON "PracticeJournalLine"("firmId", "journalId", "accountId");
