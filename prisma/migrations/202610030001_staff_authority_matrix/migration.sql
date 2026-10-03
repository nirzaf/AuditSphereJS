ALTER TABLE "User" DROP CONSTRAINT internal_role_check;
ALTER TABLE "User" ADD CONSTRAINT internal_role_check
  CHECK (role IN ('PREPARER', 'REVIEWER', 'APPROVER', 'BILLING', 'ADMIN'));

ALTER TABLE "Membership" ADD COLUMN role TEXT NOT NULL DEFAULT 'PREPARER';
UPDATE "Membership" AS membership SET role = app_user.role
FROM "User" AS app_user WHERE app_user.id = membership."userId";
ALTER TABLE "Membership" ADD CONSTRAINT membership_role_check
  CHECK (role IN ('PREPARER', 'REVIEWER', 'APPROVER', 'BILLING', 'ADMIN'));
