# B01 — Independent review queue

**Status:** Open, 2026-10-08. **Owner:** repository owner (assigns reviewers). **Kind:** review.

## What is blocked

Ledger counts: 37 tasks are IN_REVIEW, 2 are IN_PROGRESS, and 75 are NOT_STARTED.

- **IN_REVIEW (37), waiting for an independent reviewer:**
  T036 T043 T044 T045 T046 T049 T050 T051 T052 T053 T054 T055 T056 T057 T058 T059 T060 T063 T065 T070 T071 T072 T079 T080 T081 T085 T086 T087 T088 T089 T098 T099 T100 T101 T103 T104 T140
- **IN_PROGRESS (2):** T062 (client-acceptance correction; full dispatch pending) and T108. Its own remaining work is not review-ready: response and reopen history, assigned preparer, severity, anchors and workprogram gates are still pending (ledger row for T108).
- **NOT_STARTED (75), waiting on the review queue:**
  T047 T048 T061 T064 T073 T074 T075 T076 T077 T078 T082 T083 T084 T090 T091 T092 T093 T094 T095 T096 T097 T102 T105 T106 T107 T109 T110 T111 T112 T113 T114 T115 T116 T117 T118 T119 T120 T121 T122 T123 T124 T125 T126 T127 T128 T129 T130 T131 T132 T133 T134 T135 T136 T137 T138 T141 T142 T143 T147 T148 T157 T158 T159 T160 T161 T162 T163 T164 T165 T166 T167 T168 T169 T170 T171

The per-edge detail is in `docs/evidence/SPK-05/inventory.md`: 142 dependency edges are classed `review`, 90 are `satisfied`, 32 are `gate`, and 0 are `removed`. Some NOT_STARTED tasks are also blocked by something other than review. T062 needs STE-JS-04 ([B03](BLOCKER-03-proposal-acceptance.md)). T106, T110, T113, T114, T118, T122, T126, T127–T129 carry lifecycle gates ([B04](BLOCKER-04-lifecycle-gates.md)).

## Why an agent cannot close it

The rule in `AGENTS.md` and the ledger is that an implementer sets IN_REVIEW at most. A green scaffold test is not functional acceptance. Only a person who did not implement the task may accept it.

## Steps to unblock

1. **Assign reviewers.** The owner names one reviewer per task. The reviewer must not be the implementer.
2. **Read the card, not the handoff.** Read the task card's acceptance criteria and its `CURRENT.md` line ranges. The handoff in `docs/evidence/<T###>/handoff.md` is a claim to check, not proof.
3. **Re-run the recorded checks.** Run `pnpm verify:task -- T###` and `pnpm verify:affected`. Record the exact output.
4. **Check the code against each acceptance criterion.** Pay particular attention to:
   - authority and scope on every protected mutation;
   - append-only audit and posted journals (never updated or deleted);
   - decimal money (`Decimal6`), with no JavaScript float arithmetic;
   - optimistic versions on editable aggregates;
   - cross-module access only through `public.ts`.
5. **Record the decision in a new section of the handoff.** Do not overwrite earlier evidence. Use `ACCEPT`, `ACCEPT WITH FOLLOW-UP`, or `REJECT`, and list the findings with file and line.
6. **Only after an ACCEPT, the owner updates the ledger** (`docs/guides/13-execution-ledger.md`) to DONE. On REJECT, the status stays IN_REVIEW and the implementer adds a new evidence section.

## Start with these

- **T087** (risk colours). Changed this session (`e645727`). Review the migration `prisma/migrations/202610080008_risk_colour_balance_t087/` and the rule in `materiality.ts` against CURRENT section 4 and D05. The stale-materiality test accepts either message; see [B07](BLOCKER-07-verification-follow-ups.md).
- **T140** (daily hours). Its phase set needs owner confirmation first ([B02](BLOCKER-02-owner-decisions.md)).
- **T049** (batch mapping). The ledger says the conflict listing and the Angular merge are still open. Do not accept it as complete; either finish them or the owner re-scopes the card.
- **T036** (template catalog). Blocks SPK-06 and the reporting renderers (T119, T120, T122). Its acceptance unblocks the report path.
- **T045** (workbook parsing). Its worker timeout value is an owner decision ([B02](BLOCKER-02-owner-decisions.md), SPK-01).

## Done when

- Every IN_REVIEW task has a recorded ACCEPT, ACCEPT WITH FOLLOW-UP, or REJECT with findings.
- Accepted tasks are DONE in the ledger, changed by the owner.
- The NOT_STARTED tasks whose only block was review are re-classified in `docs/evidence/SPK-05/inventory.md` or in their cards.

## Implementation sequencing recheck — 2026-10-09

D32 allows individually tested prerequisite contracts to support corrective/CORE implementation while these independent acceptance reviews remain open. This does not mark any prerequisite DONE. T062 has begun the B03 security correction; full proposal rendering/dispatch remains pending.
