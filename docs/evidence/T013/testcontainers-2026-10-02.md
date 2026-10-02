# T013 Testcontainers service assertions — 2026-10-02

## Command

```text
pnpm verify:task -- T013
```

## Result

Passed, 3 tests, 0 failures, 0 skips.

- PostgreSQL Testcontainers integration queried `current_setting('server_version')` and asserted the selected `18.6` service line before migration, precision and scope checks.
- Two Redis `8.10` containers started concurrently on distinct dynamically mapped ports. Both reported Redis `8.10.x`, `maxmemory-policy=noeviction` and `appendonly=yes`.
- A Mailpit `v1.31.3` container pinned to the `linux/amd64` image digest accepted a synthetic SMTP message and returned success. The message remained in the disposable capture service; no external recipient was contacted.
- PostgreSQL `18.6` (`sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722`), Redis `8.10` (`sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee`) and Mailpit `v1.31.3` (`sha256:13de4ffbd28f3089be6dff32afbc8210edb5a593d738fa877ae7272cc73aeb67`) are pinned by immutable image digest in Compose and the focused Testcontainers tests.
- Containers were stopped by the test cleanup path. No user data, local Compose volumes, tenant, or production service was modified.
- `docker compose config -q` passed, and `docker compose up -d --wait mailpit` started the loopback-only Compose service; Docker reported it running and healthy with the configured digest.

## Remaining T013 acceptance

T013 remains `IN_REVIEW` because T006 still lacks production region and backup/recovery decisions. This focused proof does not establish production durability or deployment readiness.
