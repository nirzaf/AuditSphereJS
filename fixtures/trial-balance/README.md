# Synthetic Trial Balance fixtures

This directory contains deterministic, fictional datasets for the Trial Balance ingestion slice. No client records, credentials, tenant identifiers or provider objects are used.

Run `node scripts/generate-tb-fixtures.mjs` to regenerate the checked-in files. Run `node scripts/generate-tb-fixtures.mjs --check` to verify the exact inventory and byte-for-byte reproducibility. Every generated balance workbook uses the same four text/numeric columns as its CSV counterpart and a deterministic, fixed-timestamp Open XML ZIP container.

`generated/balance-{5000,25000,50000}.csv` and `.xlsx` contain balanced synthetic current and prior periods, negative amounts, zero prior-year values, escaped quoted names, unique account codes and deterministic FSLI-prefix mapping groups. The manifest records signed net and separate debit/credit totals for both periods. The same account code deliberately appears in different client scopes to protect against treating account codes as global identities. `duplicate-account.csv` and `malformed-row.csv` are parser-negative cases; `unbalanced.csv` is a parser-valid file that the fixture balance oracle must reject.

`generated/manifest.json` records row counts, expected signed totals, FSLI mapping counts, file byte lengths and SHA-256 digests. `tests/factories/tb-engagement-seed.ts` creates only test-mode authorized synthetic engagements for two different clients; its PostgreSQL integration proves exact engagement grants and independent same-code rows, and it throws unless `NODE_ENV=test`. Monetary values are generated in integer cents; no binary floating-point arithmetic is used.
