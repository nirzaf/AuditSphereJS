# SPK-05 — Which card dependencies are real

Status: inventory produced; classification pending owner review. Time box: 4 hours. Feeds: DN-13 (resolved, D20) and `docs/guides/05-roadmap.md` section 3.

## Question

For each of the remaining tasks, is each listed dependency a data or contract need, or only a sequencing choice?

## What this session did

- Generated `inventory.md` next to this file from the execution-order dependency columns and the ledger statuses: 114 remaining tasks and 264 listed edges.
- Applied the rules the owner already approved, mechanically: gate tasks keep their full dependencies (D20, 32 edges); edges whose dependency is DONE or NOT_APPLICABLE are satisfied (90 edges).
- The three sequencing edges the owner removed under DN-13 (T052←T051, T078←T077, T140←T088) are already absent from the execution-order table, so the inventory records no removal. Their removal is recorded in the cards.
- Left 142 edges as `review`. Their data-or-sequencing classification needs the owner card by card. No reason was invented for them.

## Not done

- The per-edge classification of the 142 review edges, with a reason for each. A reviewer needs to read each dependent card's outcome and its dependency's outcome. That work was not completed in this session.
- Lane entry criteria for the edges that become `replace with lane entry criterion`.

## Recommendation

Review the `review` rows in batches by lane (A to E in `docs/guides/05-roadmap.md` section 3). Each batch should record keep or replace, with the reason, and update the affected cards the same way the DN-13 removals were recorded.
