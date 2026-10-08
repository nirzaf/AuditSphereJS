# SPK-01 — Bounding workbook parse time

Status: measured on 2026-10-08 on the development machine (Windows 11, Node v24.19.0, ExcelJS 4.4.0). No product code changed. Raw results: `measurements-2026-10-08.json` in this folder.
Time box: 1 day. Feeds: T045 and DN-01 (DN-01 is resolved: the screened upload is extended to `.xlsx`).

## Question

ExcelJS load cannot be interrupted, so a slow but in-limit workbook can hold a worker indefinitely (T045 handoff). Which mechanism bounds it: a child process or `worker_threads` worker with a kill timeout, a streaming reader mode, or a lower cell or row cap?

## Method

- Inputs: the repository fixtures `balance-5000.xlsx`, `balance-25000.xlsx`, `balance-50000.xlsx` (`fixtures/trial-balance/generated/`), and one generated hostile in-limit workbook.
- Hostile workbook: 50,000 data rows (the `MAX_ROWS` cap), four columns, each name 1,000 random characters. Its uncompressed size is 58.1 MiB, measured from the archive's central directory, which is inside the 64 MiB `MAX_WORKBOOK_UNCOMPRESSED_BYTES` cap. Its file size is 33.3 MB. Names are random so that the archive does not compress to a trivial size.
- Each option parses the same bytes and counts rows. The worker option runs the parse in a `worker_threads` worker with a kill timeout; the kill latency is the time from the timer firing to `worker.terminate()` resolving.
- The script is a one-off measurement and is not committed as product code.

## Results

| Input | Uncompressed | Rows | In-process load | Streaming reader | Worker, completes | Worker, killed at 1 s |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 5,000 rows (fixture) | — | 5,001 | 816 ms | — | — | — |
| 25,000 rows (fixture) | — | 25,001 | 2,386 ms | — | — | — |
| 50,000 rows (fixture) | — | 50,001 | 4,808 ms | — | — | — |
| Hostile, 50,000 × 1,000 characters | 58.1 MiB | 50,001 | 12,384 ms | 7,577 ms | 16,616 ms (includes reading the file in the worker) | killed; kill latency 10 ms |

Parse cost is close to linear in rows and bytes: about 0.1 ms per row for the fixtures and about 0.25 ms per row for the hostile workbook. The row cap alone therefore does not bound the cost, because the expensive part is the byte volume.

## Findings

1. An in-process load cannot be interrupted. The hostile in-limit workbook took 12.4 seconds on this machine, and a slower machine or a concurrent job takes longer. Nothing in the current design stops it.
2. A `worker_threads` worker with a kill timeout bounds it. The kill took 10 ms in this run, so the timeout is enforced promptly.
3. The streaming reader is about 40 % faster on the hostile file, but it changes the parse path. `workbook.ts` would need a rewrite and new equivalence tests against the CSV twin. That is not justified for this decision.
4. A lower row cap does not address the byte volume that drives the cost. The byte cap (64 MiB) already bounds it, and the existing row cap of 50,000 keeps the row count bounded.

## Recommendation

- Run the ExcelJS parse in a `worker_threads` worker, with the worker's source fixed in the repository and the input passed as a buffer.
- Proposed kill timeout: 60 seconds. This is about 3.6 times the worst in-limit parse measured here (16.6 s including the file read; 12.4 s in process). It is a starting value for owner approval, not a measured acceptance target.
- Keep MAX_ROWS (50,000), MAX_COLUMNS (16), the archive entry cap (512) and the 64 MiB uncompressed cap unchanged.
- Do not adopt the streaming reader for this decision.
- Record the worker timeout as a limit on the upload job, with its outcome written to the background operation as a terminal failure.

## Not decided here

- The approved timeout value (owner). The measured numbers are from one machine; the target environment needs its own run before the value is treated as accepted.
- Whether the parse should move to a child process rather than a worker. A worker meets the kill requirement; a child process adds memory isolation the caps already limit.
