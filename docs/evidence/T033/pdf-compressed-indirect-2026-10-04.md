# T033 compressed indirect PDF actions — 2026-10-04

This follow-up supplements, and does not replace, the earlier [PDF-policy verification](pdf-policy-2026-10-04.md). Synthetic PDF 1.5 fixtures place a JavaScript `/OpenAction` dictionary and a URI Link annotation in Flate-compressed indirect objects inside an `/ObjStm`, referenced through an xref stream. The inspector rejects both. The existing passive compressed-catalog control continues to pass, guarding against false rejection of ordinary text containing the word `JavaScript`.

## Verification record

- Commit base: `52fd466af976befce8b019d5000bcb86253ca09b` (the follow-up changes are uncommitted in this record's initial measurement).
- Runtime: Node.js `v24.19.0`; pnpm `12.8.1`; Windows 11 Pro x64, Intel Core i5-1135G7.
- PDF parser: `pdfjs-dist@6.4.299`.
- Lockfile SHA-256: `F24B26A14B9C9ADA24E5ADD341D2B10EF8140CDF8403A6B95315D3A576C29276`.
- Command: `pnpm verify:task -- T033`.
- Result: PASS, exit 0. PDF inspection: 9/9; multipart adapter: 2/2; ClamAV unit: 3/3; configured ClamAV daemon clean/EICAR check: 1/1; PostgreSQL/Fastify upload: 1/1. The denied-file integration assertions confirm no document/version or provider write is created.
- Linux image digest: not applicable to this local synthetic parser test; no provider credentials or real client files were used.

The fixture specifically proves these two compressed indirect-object cases, not all PDF grammar, malformed cross-reference combinations, alternate parser behaviors or browser-viewer behavior. The lexical token check remains defense in depth. T033 stays `IN_PROGRESS`; portal/PBC freeze and cross-client authorization, full hostile-file policy, T064 folder bindings, and long-running production database/worker operations remain open.
