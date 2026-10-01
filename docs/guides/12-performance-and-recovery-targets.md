# Capacity, performance and recovery acceptance plan

The requirements do not provide user counts, hosting resources, latency budgets, RPO/RTO, file-size limits or maximum accounting dimensions. Do not turn an example such as 50,000 TB rows into a proven capacity guarantee or an artificial product-license cap. D11 records the workload and operational decisions.

## Proposed workload fixtures — approval pending

| Fixture | Purpose | Required correctness checks |
| :--- | :--- | :--- |
| 5,000 TB rows | Routine import/edit/aggregation baseline | Original file digest, balanced totals, mapping lineage and signed-balance display. |
| 25,000 TB rows | Medium resource/mapping stress | Bounded DB batches, cancellation/retry and memory behavior. |
| 50,000 TB rows | Technical proof and peak import test | Stream/resource limits, API responsiveness during worker CPU load, deterministic finalization. |
| Two editors on same rows | Conflict proof | All-or-nothing batch, no silent last-write-wins, separate actor audit history. |
| Multiple editors on different FSLIs | Parallel fieldwork proof | Unrelated row work proceeds; engagement sign-off barriers remain correct. |
| PDF generation plus portal upload and review | Mixed realistic workload | No resource starvation, lost intent, duplicate release or authorization bypass. |

Larger datasets remain possible only when tested; no unlimited physical-resource claim is made. Avoid polling whole datasets or rendering off-screen rows. Define row-window/pagination and maximum batch/payload limits in the tested configuration, not hidden frontend assumptions.

## Measurement contract

Record hardware/CPU/memory, OS, DB tier, worker count, pool sizes, payload size, network conditions, warm/cold state and exact application artifact. Measure p50/p95/p99 API latency, browser input/render latency, requests/errors, Node event-loop lag, RSS/heap, DB query plans/locks/connections, queue age/import/PDF completion time and storage throughput.

The approved acceptance record must contain numeric budgets for ordinary queries, batch writes, import completion, interactive frame/input responsiveness, failure rate and resource saturation. Do not claim an unmeasured 60 fps or requests-per-second figure. Measure first at T051, establish owner-approved budgets before T159, then test the production-shaped deployment. Make performance changes based on those measurements rather than framework rankings.

## Backpressure and bounds

Limit request bodies, uploaded compressed/uncompressed sizes, workbook rows/cells, query windows, batch lengths, job payloads, running parser/PDF jobs, DB connections and renderer execution time. Reject unsupported encrypted/macro/formula-dependent input visibly. Show queued/retry/cancel states instead of overloading API memory. Separate worker resource limits from API latency requirements.

## Recovery decisions

| Objective | Required decision/evidence |
| :--- | :--- |
| RPO | Approved tolerable data-loss window for PostgreSQL, document versions and external effects. |
| RTO | Approved restoration time and proof from an isolated restore drill. |
| Archive integrity | Full-file manifest/object-version hashes verify after restore; records protection remains active. |
| Queue recovery | Nonterminal durable operations are reconciled without repeating irreversible actions blindly. |
| Region/provider | Approved data-residency, retention, availability and license/support constraints. |
| Incident response | Named owner, alert route, authorization path and rollback/data-repair runbook. |

A backup existing is not a successful restore. A restored DB is not sufficient when its evidence object versions are missing. Record the observed recovery results in T162 rather than asserting recovery objectives have been met from configuration alone.
