import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('docs/decisions/T004-records-golden.json', 'utf8'));
const decisions = JSON.parse(readFileSync('docs/decisions/register.json', 'utf8'));
assert.equal(fixture.decisionVersion, 'STE-RECORDS-2026.1');
assert.ok(readFileSync('docs/requirements/CURRENT.md').equals(readFileSync('docs/sources/requirements-current.md')), 'preserved requirements must remain byte-identical');
for (const id of ['D03', 'D08', 'D09', 'D10']) {
  const decision = decisions.find((entry) => entry.id === id);
  assert.equal(decision?.status, 'APPROVED_IMPLEMENTATION_DEFAULT', `${id} approval state`);
  assert.match(decision?.approvedBy ?? '', /user delegated/i, `${id} approval evidence`);
  assert.equal(decision?.decisionRecord, 'docs/decisions/T004-records-defaults.md', `${id} decision record link`);
}

const deadline = fixture.archiveDeadline;
const anchor = new Date(deadline.anchorUtc);
assert.equal(anchor.toISOString(), deadline.anchorUtc, 'anchor must be a valid explicit UTC instant');
assert.equal(anchor.toISOString().slice(0, 10), deadline.anchorUtcDate, 'anchor date must be its UTC calendar date');
const expected = new Date(`${deadline.anchorUtcDate}T00:00:00.000Z`);
expected.setUTCDate(expected.getUTCDate() + deadline.calendarDays);
assert.equal(expected.toISOString(), deadline.expectedDeadlineUtc, 'deadline is UTC midnight on anchor date plus 60 calendar days');
for (const check of deadline.checks) assert.equal(new Date(check.instant) >= expected, check.deadlinePassed, `deadline boundary ${check.instant}`);

const controls = fixture.controls;
assert.equal(controls.objectRetention, 'no_automatic_application_disposal_until_authorized_schedule');
assert.equal(controls.legalHold, 'separate_scoped_disposal_suspension_does_not_unlock_archive');
assert.equal(controls.signatureAssurance, 'image_and_approval_record_only_not_cryptographic_pdf_signature');
assert.equal(controls.signedLor, 'required_before_final_package_validation_and_external_release_after_report_snapshot_approval');
assert.ok(fixture.reportingByEngagementType.some((item) => item.type === 'EXTERNAL_STATUTORY_AUDIT' && item.opinionSelector === 'four-way-partner-only'));
for (const type of ['INTERNAL_AUDIT', 'AGREED_UPON_PROCEDURES']) {
  const policy = fixture.reportingByEngagementType.find((item) => item.type === type);
  assert.ok(policy, `${type} must have an explicit report policy`);
  assert.equal(policy.opinionSelector, null, `${type} must not inherit the statutory opinion selector`);
}
const aup = fixture.reportingByEngagementType.find((item) => item.type === 'AGREED_UPON_PROCEDURES');
assert.equal(aup.assuranceLabel, 'no-audit-opinion-or-assurance-conclusion');

console.log('T004 records: delegated decision approvals, UTC 60-day boundary, separate archive controls, image-signature assurance and engagement report paths passed.');
