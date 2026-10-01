# Focused task PR checklist

Task ID and linked source requirements:

- [ ] Only the assigned task and necessary related files changed.
- [ ] Relevant module README/architecture/decision records were read and followed.
- [ ] No new dependency without exact peer/engine/security/license and runtime evidence.
- [ ] Runtime inputs, identity/scope/permission, state and expected-version rules are enforced server-side.
- [ ] Financial arithmetic, posting ownership and immutable source/version lineage are preserved.
- [ ] Durable operations/outbox and failure/recovery handling are included where needed.
- [ ] Focused tests, required real-service negative/race tests, builds/type checks and generated-contract checks passed on the named commit.
- [ ] No zero-test pass, skipped required test or mocked provider result is presented as real production evidence.
- [ ] Migration/rollback limits and required separate production authorization are documented.
- [ ] No secrets, unrelated refactor, unnecessary library, hidden TODO behavior or unapproved professional assumption remains.
- [ ] Reviewer updated the execution ledger with actual evidence.

Merge requires the repository's real authorization workflow. A passing checklist or codeword written in a task document is not authorization to merge or deploy.
