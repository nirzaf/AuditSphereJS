# T033 — multipart adapter compatibility evidence

This is an interim dependency/runtime check only. It does not demonstrate upload authorization, staging persistence, portal freeze handling, document attachment, or cleanup, and it does not close T033.

## Selected package

- Package: `@fastify/multipart@10.1.2`, direct dependency of `@auditsphere/api`.
- Runtime: Fastify `5.12.5`, Node `24.19.0`, Windows x64.
- License/metadata: MIT; `pnpm dependencies:check` reported the exact installed release and no engine/peer metadata. `pnpm --filter @auditsphere/api audit --audit-level low` reported no known vulnerabilities. The package integrity recorded in `pnpm-lock.yaml` is `sha512-WHsqW5ffDXCbXXtdBQDryxu58fQvFPVGh4E4MlCO6hwCLNm0lYTCS6GKXUw2P64REDoECUNpMVvtMMstdIyBjQ==`. The upstream 10.1.0 aborted-upload denial-of-service advisory is recorded in `docs/guides/03-library-register.md`; the 10.1.2 package was used for the smoke.
- Repeatable test: `apps/api/tests/multipart-plugin.integration.ts`, included in `pnpm test:integration`.

## Executed checks

`pnpm dependencies:check` exited 0 and reported `@fastify/multipart@10.1.2 | MIT | {}`.

`pnpm exec node --import tsx --test apps/api/tests/multipart-plugin.integration.ts` exited 0:

```text
✔ consumes an allowed file stream and exposes its bounded metadata
✔ rejects content beyond the explicit per-file bound
tests 2, pass 2, fail 0, skipped 0
```

The actual Fastify 5 server registered the multipart plugin with explicit file, part, field, and body limits. A bounded seven-byte file streamed through `request.file()` successfully; a nine-byte file was rejected at the configured eight-byte limit with HTTP 413. The application currently accumulates chunks in a bounded in-memory buffer before the provider write, so this does not prove zero-copy streaming. This is a plugin compatibility smoke; application route/authorization coverage is recorded in the T033 handoff.

## Still required for T033

Portal/PBC upload sessions and portal freeze rechecks remain unimplemented; the current endpoint is staff-only for Fieldwork Execution and supports PDF/CSV. Provider streaming is bounded but currently buffers chunks before the write; Microsoft Graph abandoned staging items require safe provider cleanup/review. Office workbook macro/encryption inspection is not implemented because workbooks are not accepted by this endpoint. T033 stays open.
