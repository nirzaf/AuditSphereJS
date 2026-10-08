# Task handoff

## Identity

Task ID: T140 — Record daily hours by engagement, phase and FSLI
Requirement IDs: R003 (preparer responsibilities, source lines 59–61), R074 (daily hours by engagement, phase and FSLI, source lines 335–339), R073 (charge-out rates, source lines 560–564)
Implementing commit/branch: `main`, the commit that contains this handoff
Status: IN_REVIEW — implemented; the recorded checks pass. Independent review has not happened.

## Intended and delivered outcome

A staff member records a day's time on an engagement they are assigned to, with the work date, the duration (exact minutes, or hours with at most three decimal places converted once to whole minutes, half-even), the phase, the FSLI and a description. The charge-out rate and value are captured in the same insert as the entry, and the entry is never edited afterwards. A correction appends a replacement entry and links it to the original, so the earlier values stay in the record. Daily and weekly totals exclude superseded originals.

Existing implementation: this extends the T139 time-value snapshot writer (`recordAuthorizedPracticeTimeEntrySnapshot`) rather than replacing it.

Not delivered:
- the daily/weekly timesheet screen in `apps/web` (the card's screen; the API is in place, the Angular screen is not);
- an approval workflow for time entries. The card's correction history is defined for entries, and no approval state exists in this task;
- a firm-level time view. Time entries are attributed to an engagement, so they stay on the engagement path (D24).

## Files and contracts

- `prisma/migrations/202610080007_practice_time_entries_t140/migration.sql`: adds `phase`, `fsli` and `description` to `PracticeTimeEntry` (nullable, with CHECK constraints); adds the append-only `PracticeTimeEntryCorrection` table with composite uniques per firm, a guard trigger (same engagement and staff member for both entries) and an append-only trigger. Entries recorded before this migration keep NULL in the three new columns; the service requires all three for every new entry and for any correction of such an entry.
- `prisma/schema.prisma`: the new columns, the `PracticeTimeEntryCorrection` model and the relations.
- `packages/server/src/modules/practice/rates.ts`: the T139 snapshot writer now accepts `phase`, `fsli` and `description` and writes them in the same insert. Its pricing rules are unchanged.
- `packages/server/src/modules/practice/time-entries.ts`: `recordPracticeTimeEntry`, `correctPracticeTimeEntry`, `listPracticeTimeEntries` and `minutesFrom`.
- `packages/server/src/modules/practice/time-entry-controller.ts`: `GET`, `POST` and `PATCH …/practice/time-entries[/:id]` under the engagement path.
- `packages/contracts/src/index.ts`: `timePhases`, the record and correct request schemas, the entry view, the list with totals, and the correction result. `schema.json` and `openapi.json` regenerated.
- `packages/server/src/index.ts` and `apps/api/src/main.ts`: exports and controller registration.
- `tests/practice-time-entries.integration.ts` (new); `scripts/verify-task.mjs` (T140 recipe and integration key); `package.json` (`test:integration`).

No unrelated change. The migration is additive (nullable columns, one new table, two triggers on the new table). The T139 guard on `PracticeTimeEntry` is not changed.

## Dependency evidence

No dependency changes. `pnpm-lock.yaml` is unchanged; SHA-256 `0fce85b5559c504fb084b1acfa6b080de5f95c68b9f75afb6b3449db08acbfb1`.

## Decisions

- D22 (DN-09): the FSLI must be a line of the firm's approved taxonomy. The approved taxonomy is the only authority for the FSLI vocabulary.
- D24 (DN-11): time entries are attributed to an engagement and are recorded on the engagement path. Firm-level routes are for firm-wide reads.
- Open for owner confirmation: the phase set `PLANNING`, `FIELDWORK`, `REVIEW`, `REPORTING` is an implementation choice. The CURRENT source names phases but does not list them. Confirm or replace it before review.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T140` (build:server, contracts:check, practice-time-entries) | PostgreSQL 18.6 container, migrations applied with `migrate deploy` | exit 0 | `tests/practice-time-entries.integration.ts` 1 of 1 |
| `pnpm verify:task -- T139` (regression: the shared snapshot writer) | The T139 recipe, including `practice-rates`, `practice-ledger`, `api-contracts` and the web rates spec | exit 0 | Recipe passed after the writer change |
| `pnpm contracts:check` | Zod schemas and OpenAPI decorators | exit 0 | Schemas match runtime definitions; OpenAPI matches decorators |

Before commit, the affected suite and lint are run on the final tree; their results are recorded in the commit message rather than here.

## Acceptance criteria

- **AC1 (unassigned engagement time entry fails).** A staff member with no assignment to the engagement receives 403 from `recordPracticeTimeEntry`. Status: proven by the integration test.
- **AC2 (decimal and hour conversion match the approved rounding fixtures).** `minutesFrom` converts 1.25 h to 75 minutes, 0.1 h to 6 minutes, 0.125 h to 8 minutes (7.5 rounds half-even to 8), 24.001 h to 1440 minutes, and refuses 25 h. The recorded value follows the minutes: 1.25 h at 1000 QAR/h is 1250.000000; 1 minute is 16.666667. Status: proven by the integration test. The fixtures are the ones this task's tests state; no separate approved fixture file exists in the repository.
- **AC3 (changing the current rate card does not change prior time value).** After a 1200 QAR/h rate is scheduled from 2027-01-01, the earlier entry keeps its 1000 QAR/h rate and its 1250.000000 value. A new entry on 2027-02-01 is priced at 1200 QAR/h. Status: proven by the integration test.

Checklist items met: capture of the required fields; assignment and closed-period checks; idempotent saves (the same key and body return the first entry; the same key with a different body is refused); the rate snapshot in the insert; daily and weekly totals; correction history with append-only storage.

## Limitations

- The timesheet screen in `apps/web` is not built.
- The phase set is an implementation choice awaiting owner confirmation (see Decisions).
- Time entries have no approval state. Corrections are allowed by the staff member who recorded the entry; a reviewer correction path is not defined in this task.
- Entries recorded before migration `202610080007` have no phase, FSLI or description. They cannot be corrected until they are supplied in the correction.
- The list returns at most 500 entries. Totals are computed over the entries the query returns.

## Recovery and authorization

A refused entry or correction writes nothing: the engagement is locked, the checks run before the insert, and the receipt is written last in the same transaction. A correction appends rows and does not edit any existing one, so a failed correction leaves the original in place. No merge, deployment or data repair is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: the phase set needs owner confirmation; the timesheet screen is not built.
Next eligible task by dependency order: not assigned. T140's dependency T139 is DONE; T088 was removed from T140's dependencies by DN-13.
Stop after this task; do not implement the next one without assignment.
