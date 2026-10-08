-- DN-04 (D16): the statutory period is recorded on the engagement and snapshotted on each
-- Trial Balance import when it is staged. Finalization refuses a missing or changed period.
-- Existing rows keep NULL: such engagements cannot finalize until a period is recorded.
ALTER TABLE "Engagement" ADD COLUMN "period" varchar(40);
ALTER TABLE "TbImport" ADD COLUMN "engagementPeriod" varchar(40);
