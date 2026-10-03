CREATE TABLE "PracticeRateCard" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "grade" VARCHAR(48) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'QAR',
    "hourlyRate" DECIMAL(28,6) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    CONSTRAINT "PracticeRateCard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PracticeRateCard_grade_check" CHECK ("grade" IN ('ENGAGEMENT_PARTNER','AUDIT_MANAGER','AUDIT_SUPERVISOR','AUDIT_SENIOR','AUDIT_ASSOCIATE','AUDIT_JUNIOR')),
    CONSTRAINT "PracticeRateCard_currency_check" CHECK ("currency" = 'QAR'),
    CONSTRAINT "PracticeRateCard_hourly_rate_check" CHECK ("hourlyRate" > 0),
    CONSTRAINT "PracticeRateCard_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
    CONSTRAINT "PracticeRateCard_version_check" CHECK ("version" > 0),
    CONSTRAINT "PracticeRateCard_firmId_id_key" UNIQUE ("firmId", "id"),
    CONSTRAINT "PracticeRateCard_firmId_grade_effectiveFrom_key" UNIQUE ("firmId", "grade", "effectiveFrom"),
    CONSTRAINT "PracticeRateCard_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeRateCard_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PracticeRateCard_firmId_grade_effectiveFrom_idx" ON "PracticeRateCard"("firmId", "grade", "effectiveFrom");

CREATE TABLE "PracticeStaffGradeAssignment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grade" VARCHAR(48) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID NOT NULL,
    CONSTRAINT "PracticeStaffGradeAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PracticeStaffGradeAssignment_grade_check" CHECK ("grade" IN ('ENGAGEMENT_PARTNER','AUDIT_MANAGER','AUDIT_SUPERVISOR','AUDIT_SENIOR','AUDIT_ASSOCIATE','AUDIT_JUNIOR')),
    CONSTRAINT "PracticeStaffGradeAssignment_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
    CONSTRAINT "PracticeStaffGradeAssignment_version_check" CHECK ("version" > 0),
    CONSTRAINT "PracticeStaffGradeAssignment_firmId_id_key" UNIQUE ("firmId", "id"),
    CONSTRAINT "PracticeStaffGradeAssignment_firmId_userId_effectiveFrom_key" UNIQUE ("firmId", "userId", "effectiveFrom"),
    CONSTRAINT "PracticeStaffGradeAssignment_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeStaffGradeAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeStaffGradeAssignment_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PracticeStaffGradeAssignment_firmId_userId_effectiveFrom_idx" ON "PracticeStaffGradeAssignment"("firmId", "userId", "effectiveFrom");

CREATE TABLE "PracticeTimeEntry" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "gradeAssignmentId" UUID NOT NULL,
    "rateCardId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "grade" VARCHAR(48) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'QAR',
    "hourlyRateSnapshot" DECIMAL(28,6) NOT NULL,
    "chargeOutValueSnapshot" DECIMAL(28,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeTimeEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PracticeTimeEntry_grade_check" CHECK ("grade" IN ('ENGAGEMENT_PARTNER','AUDIT_MANAGER','AUDIT_SUPERVISOR','AUDIT_SENIOR','AUDIT_ASSOCIATE','AUDIT_JUNIOR')),
    CONSTRAINT "PracticeTimeEntry_currency_check" CHECK ("currency" = 'QAR'),
    CONSTRAINT "PracticeTimeEntry_minutes_check" CHECK ("minutes" BETWEEN 1 AND 1440),
    CONSTRAINT "PracticeTimeEntry_rate_check" CHECK ("hourlyRateSnapshot" > 0),
    CONSTRAINT "PracticeTimeEntry_value_check" CHECK ("chargeOutValueSnapshot" >= 0),
    CONSTRAINT "PracticeTimeEntry_firmId_id_key" UNIQUE ("firmId", "id"),
    CONSTRAINT "PracticeTimeEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeTimeEntry_engagement_scope_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeTimeEntry_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeTimeEntry_gradeAssignment_scope_fkey" FOREIGN KEY ("firmId", "gradeAssignmentId") REFERENCES "PracticeStaffGradeAssignment"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeTimeEntry_rateCard_scope_fkey" FOREIGN KEY ("firmId", "rateCardId") REFERENCES "PracticeRateCard"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PracticeTimeEntry_firmId_staffUserId_workDate_idx" ON "PracticeTimeEntry"("firmId", "staffUserId", "workDate");
CREATE INDEX "PracticeTimeEntry_firmId_engagementId_workDate_idx" ON "PracticeTimeEntry"("firmId", "engagementId", "workDate");

CREATE FUNCTION "guard_practice_rate_card_history"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."firmId"::text || ':' || NEW."grade", 0));
    IF TG_OP = 'UPDATE' THEN
        IF OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS NULL OR NEW."effectiveTo" <= OLD."effectiveFrom"
           OR NEW."version" <> OLD."version" + 1
           OR NEW."id" <> OLD."id" OR NEW."firmId" <> OLD."firmId" OR NEW."grade" <> OLD."grade"
           OR NEW."currency" <> OLD."currency" OR NEW."hourlyRate" <> OLD."hourlyRate"
           OR NEW."effectiveFrom" <> OLD."effectiveFrom" OR NEW."createdAt" <> OLD."createdAt"
           OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" THEN
            RAISE EXCEPTION 'Practice rate-card history is immutable except for one versioned end-date close' USING ERRCODE = '55000';
        END IF;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "PracticeRateCard" prior
        WHERE prior."firmId" = NEW."firmId" AND prior."grade" = NEW."grade" AND prior."id" <> NEW."id"
          AND daterange(prior."effectiveFrom", prior."effectiveTo", '[)') && daterange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
    ) THEN
        RAISE EXCEPTION 'Effective practice rate-card ranges may not overlap' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "PracticeRateCard_history_guard"
BEFORE INSERT OR UPDATE ON "PracticeRateCard"
FOR EACH ROW EXECUTE FUNCTION "guard_practice_rate_card_history"();

CREATE FUNCTION "guard_practice_staff_grade_history"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."firmId"::text || ':' || NEW."userId"::text, 0));
    IF TG_OP = 'UPDATE' THEN
        IF OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS NULL OR NEW."effectiveTo" <= OLD."effectiveFrom"
           OR NEW."version" <> OLD."version" + 1
           OR NEW."id" <> OLD."id" OR NEW."firmId" <> OLD."firmId" OR NEW."userId" <> OLD."userId"
           OR NEW."grade" <> OLD."grade" OR NEW."effectiveFrom" <> OLD."effectiveFrom"
           OR NEW."createdAt" <> OLD."createdAt" OR NEW."assignedBy" <> OLD."assignedBy" THEN
            RAISE EXCEPTION 'Staff-grade history is immutable except for one versioned end-date close' USING ERRCODE = '55000';
        END IF;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "PracticeStaffGradeAssignment" prior
        WHERE prior."firmId" = NEW."firmId" AND prior."userId" = NEW."userId" AND prior."id" <> NEW."id"
          AND daterange(prior."effectiveFrom", prior."effectiveTo", '[)') && daterange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
    ) THEN
        RAISE EXCEPTION 'Effective staff-grade ranges may not overlap' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "PracticeStaffGradeAssignment_history_guard"
BEFORE INSERT OR UPDATE ON "PracticeStaffGradeAssignment"
FOR EACH ROW EXECUTE FUNCTION "guard_practice_staff_grade_history"();

CREATE FUNCTION "guard_practice_time_entry_snapshot"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_rate "PracticeRateCard"%ROWTYPE;
    v_grade "PracticeStaffGradeAssignment"%ROWTYPE;
    v_expected_minor NUMERIC;
    v_scaled NUMERIC;
    v_floor NUMERIC;
    v_fraction NUMERIC;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Practice time-value entries are immutable; append a correction record' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_grade FROM "PracticeStaffGradeAssignment"
    WHERE "firmId" = NEW."firmId" AND "id" = NEW."gradeAssignmentId" AND "userId" = NEW."staffUserId"
      AND "grade" = NEW."grade" AND "effectiveFrom" <= NEW."workDate"
      AND ("effectiveTo" IS NULL OR "effectiveTo" > NEW."workDate");
    IF NOT FOUND THEN RAISE EXCEPTION 'No matching active staff grade exists for this work date' USING ERRCODE = '23514'; END IF;
    SELECT * INTO v_rate FROM "PracticeRateCard"
    WHERE "firmId" = NEW."firmId" AND "id" = NEW."rateCardId" AND "grade" = NEW."grade"
      AND "currency" = NEW."currency" AND "effectiveFrom" <= NEW."workDate"
      AND ("effectiveTo" IS NULL OR "effectiveTo" > NEW."workDate");
    IF NOT FOUND OR NEW."hourlyRateSnapshot" <> v_rate."hourlyRate" THEN
        RAISE EXCEPTION 'No matching effective charge-out rate exists for this work date' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "Membership" m WHERE m."userId" = NEW."staffUserId" AND m."firmId" = NEW."firmId"
          AND m."clientId" = NEW."clientId" AND m."engagementId" = NEW."engagementId"
    ) THEN RAISE EXCEPTION 'Staff member is not assigned to this engagement' USING ERRCODE = '23514'; END IF;
    v_scaled := NEW."hourlyRateSnapshot" * NEW."minutes" * 1000000 / 60;
    v_floor := floor(v_scaled);
    v_fraction := v_scaled - v_floor;
    v_expected_minor := CASE
        WHEN v_fraction > 0.5 OR (v_fraction = 0.5 AND mod(v_floor, 2) = 1) THEN v_floor + 1
        ELSE v_floor
    END;
    IF NEW."chargeOutValueSnapshot" <> v_expected_minor / 1000000 THEN
        RAISE EXCEPTION 'Charge-out snapshot does not match the rate and duration' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "PracticeTimeEntry_snapshot_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "PracticeTimeEntry"
FOR EACH ROW EXECUTE FUNCTION "guard_practice_time_entry_snapshot"();

INSERT INTO "PracticeRateCard" ("id", "firmId", "grade", "currency", "hourlyRate", "effectiveFrom", "version", "createdAt")
SELECT gen_random_uuid(), firm."id", defaults.grade, 'QAR', defaults.hourly_rate, DATE '2000-01-01', 1, CURRENT_TIMESTAMP
FROM "Firm" firm
CROSS JOIN (VALUES
    ('ENGAGEMENT_PARTNER', 1000::NUMERIC),
    ('AUDIT_MANAGER', 750::NUMERIC),
    ('AUDIT_SUPERVISOR', 500::NUMERIC),
    ('AUDIT_SENIOR', 500::NUMERIC),
    ('AUDIT_ASSOCIATE', 200::NUMERIC),
    ('AUDIT_JUNIOR', 200::NUMERIC)
) AS defaults(grade, hourly_rate)
ON CONFLICT ("firmId", "grade", "effectiveFrom") DO NOTHING;
