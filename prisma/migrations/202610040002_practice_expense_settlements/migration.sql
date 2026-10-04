CREATE TABLE "PracticeExpense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "journalId" UUID NOT NULL,
  "category" VARCHAR(48) NOT NULL,
  "amount" DECIMAL(28,6) NOT NULL,
  "debitAccountId" UUID NOT NULL,
  "creditAccountId" UUID NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeExpense_id_firm_key" UNIQUE ("firmId", "id"),
  CONSTRAINT "PracticeExpense_firm_journal_key" UNIQUE ("firmId", "journalId"),
  CONSTRAINT "PracticeExpense_category_check" CHECK ("category" IN ('OFFICE_RENT_FACILITIES','STAFF_SALARIES','BENEFITS_END_OF_SERVICE','OVERHEAD','PETTY_CASH','PARTNER_WITHDRAWAL')),
  CONSTRAINT "PracticeExpense_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "PracticeExpense_journal_scope_fkey" FOREIGN KEY ("firmId", "journalId") REFERENCES "PracticeJournal"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpense_debit_account_scope_fkey" FOREIGN KEY ("firmId", "debitAccountId") REFERENCES "PracticeAccount"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpense_credit_account_scope_fkey" FOREIGN KEY ("firmId", "creditAccountId") REFERENCES "PracticeAccount"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpense_creator_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PracticeExpenseSettlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "expenseJournalId" UUID NOT NULL,
  "journalId" UUID NOT NULL,
  "amount" DECIMAL(28,6) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeExpenseSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeExpenseSettlement_id_firm_key" UNIQUE ("firmId", "id"),
  CONSTRAINT "PracticeExpenseSettlement_journal_key" UNIQUE ("firmId", "journalId"),
  CONSTRAINT "PracticeExpenseSettlement_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "PracticeExpenseSettlement_expense_scope_fkey" FOREIGN KEY ("firmId", "expenseJournalId") REFERENCES "PracticeExpense"("firmId", "journalId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseSettlement_journal_scope_fkey" FOREIGN KEY ("firmId", "journalId") REFERENCES "PracticeJournal"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseSettlement_creator_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PracticeExpenseSettlement_expense_idx" ON "PracticeExpenseSettlement"("firmId", "expenseJournalId");

CREATE FUNCTION validate_practice_expense() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_status text; debit_kind text; credit_kind text; line_count bigint; debit_total numeric; credit_total numeric;
BEGIN
  SELECT status INTO journal_status FROM "PracticeJournal" WHERE "firmId" = NEW."firmId" AND id = NEW."journalId";
  IF journal_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Practice expense must attach to a draft journal'; END IF;
  SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO line_count, debit_total, credit_total
    FROM "PracticeJournalLine" WHERE "firmId" = NEW."firmId" AND "journalId" = NEW."journalId";
  IF line_count <> 2 OR debit_total <> NEW.amount OR credit_total <> NEW.amount THEN RAISE EXCEPTION 'Practice expense metadata must match its balanced two-line journal'; END IF;
  SELECT kind INTO debit_kind FROM "PracticeAccount" WHERE "firmId" = NEW."firmId" AND id = NEW."debitAccountId" AND active AND posting;
  SELECT kind INTO credit_kind FROM "PracticeAccount" WHERE "firmId" = NEW."firmId" AND id = NEW."creditAccountId" AND active AND posting;
  IF debit_kind IS NULL OR credit_kind IS NULL THEN RAISE EXCEPTION 'Practice expense accounts must be active posting accounts'; END IF;
  IF NEW.category = 'PARTNER_WITHDRAWAL' THEN
    IF debit_kind NOT IN ('EQUITY','LIABILITY') OR credit_kind <> 'ASSET' THEN RAISE EXCEPTION 'Invalid partner withdrawal classification'; END IF;
  ELSIF debit_kind <> 'EXPENSE' OR credit_kind NOT IN ('ASSET','LIABILITY') THEN
    RAISE EXCEPTION 'Invalid operating expense classification';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "PracticeJournalLine" WHERE "firmId" = NEW."firmId" AND "journalId" = NEW."journalId" AND "accountId" = NEW."debitAccountId" AND debit = NEW.amount AND credit = 0)
     OR NOT EXISTS (SELECT 1 FROM "PracticeJournalLine" WHERE "firmId" = NEW."firmId" AND "journalId" = NEW."journalId" AND "accountId" = NEW."creditAccountId" AND credit = NEW.amount AND debit = 0) THEN
    RAISE EXCEPTION 'Practice expense metadata must match its classified journal lines';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PracticeExpense_validate_insert" BEFORE INSERT ON "PracticeExpense" FOR EACH ROW EXECUTE FUNCTION validate_practice_expense();

CREATE FUNCTION validate_practice_expense_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expense_row "PracticeExpense"%ROWTYPE; original_status text; original_reversed boolean; settlement_status text;
  debit_total numeric; credit_total numeric; line_count bigint; asset_kind text; settled numeric;
BEGIN
  SELECT e.* INTO expense_row FROM "PracticeExpense" e WHERE e."firmId" = NEW."firmId" AND e."journalId" = NEW."expenseJournalId" FOR UPDATE;
  IF NOT FOUND OR expense_row.category = 'PARTNER_WITHDRAWAL' OR expense_row."creditAccountId" IS NULL THEN RAISE EXCEPTION 'A recognized operating expense is required for settlement'; END IF;
  SELECT status, EXISTS (SELECT 1 FROM "PracticeJournal" r WHERE r."firmId" = j."firmId" AND r."reversalOf" = j.id)
    INTO original_status, original_reversed FROM "PracticeJournal" j WHERE j."firmId" = NEW."firmId" AND j.id = NEW."expenseJournalId";
  IF original_status <> 'POSTED' OR original_reversed THEN RAISE EXCEPTION 'The original expense must be posted and unreversed'; END IF;
  IF (SELECT kind FROM "PracticeAccount" WHERE "firmId" = NEW."firmId" AND id = expense_row."creditAccountId") <> 'LIABILITY' THEN RAISE EXCEPTION 'Only an expense recognized to a liability can be settled'; END IF;
  SELECT status INTO settlement_status FROM "PracticeJournal" WHERE "firmId" = NEW."firmId" AND id = NEW."journalId";
  IF settlement_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Expense settlement must attach to a draft journal'; END IF;
  SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0) INTO line_count, debit_total, credit_total
    FROM "PracticeJournalLine" WHERE "firmId" = NEW."firmId" AND "journalId" = NEW."journalId";
  IF line_count <> 2 OR debit_total <> NEW.amount OR credit_total <> NEW.amount THEN RAISE EXCEPTION 'Expense settlement must match its balanced two-line journal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "PracticeJournalLine" WHERE "firmId" = NEW."firmId" AND "journalId" = NEW."journalId" AND "accountId" = expense_row."creditAccountId" AND debit = NEW.amount AND credit = 0) THEN RAISE EXCEPTION 'Expense settlement must debit the recognized liability'; END IF;
  SELECT a.kind INTO asset_kind FROM "PracticeJournalLine" l JOIN "PracticeAccount" a ON a."firmId" = l."firmId" AND a.id = l."accountId"
    WHERE l."firmId" = NEW."firmId" AND l."journalId" = NEW."journalId" AND l.credit = NEW.amount AND l.debit = 0;
  IF asset_kind <> 'ASSET' THEN RAISE EXCEPTION 'Expense settlement must credit an asset account'; END IF;
  SELECT coalesce(sum(s.amount),0) INTO settled FROM "PracticeExpenseSettlement" s
    JOIN "PracticeJournal" sj ON sj."firmId" = s."firmId" AND sj.id = s."journalId"
    WHERE s."firmId" = NEW."firmId" AND s."expenseJournalId" = NEW."expenseJournalId"
      AND NOT EXISTS (SELECT 1 FROM "PracticeJournal" r WHERE r."firmId" = sj."firmId" AND r."reversalOf" = sj.id);
  IF settled + NEW.amount > expense_row.amount THEN RAISE EXCEPTION 'Settlement exceeds the outstanding expense obligation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PracticeExpenseSettlement_validate_insert" BEFORE INSERT ON "PracticeExpenseSettlement" FOR EACH ROW EXECUTE FUNCTION validate_practice_expense_settlement();

CREATE FUNCTION prevent_practice_expense_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Practice expense history is immutable'; END $$;
CREATE TRIGGER "PracticeExpense_immutable" BEFORE UPDATE OR DELETE ON "PracticeExpense" FOR EACH ROW EXECUTE FUNCTION prevent_practice_expense_history_mutation();
CREATE TRIGGER "PracticeExpenseSettlement_immutable" BEFORE UPDATE OR DELETE ON "PracticeExpenseSettlement" FOR EACH ROW EXECUTE FUNCTION prevent_practice_expense_history_mutation();

CREATE FUNCTION prevent_expense_reversal_with_open_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."reversalOf" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "PracticeExpense" e JOIN "PracticeExpenseSettlement" s ON s."firmId" = e."firmId" AND s."expenseJournalId" = e."journalId"
    JOIN "PracticeJournal" sj ON sj."firmId" = s."firmId" AND sj.id = s."journalId"
    WHERE e."firmId" = NEW."firmId" AND e."journalId" = NEW."reversalOf"
      AND NOT EXISTS (SELECT 1 FROM "PracticeJournal" r WHERE r."firmId" = sj."firmId" AND r."reversalOf" = sj.id)
  ) THEN RAISE EXCEPTION 'Reverse expense settlements before reversing the original expense'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PracticeJournal_expense_reversal_guard" BEFORE INSERT ON "PracticeJournal" FOR EACH ROW EXECUTE FUNCTION prevent_expense_reversal_with_open_settlement();