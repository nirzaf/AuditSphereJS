# T013 Testcontainers service assertions — 2026-10-02

## Command

```text
pnpm verify:task -- T013
```

## Result

Passed, 2 tests, 0 failures, 0 skips.

- PostgreSQL Testcontainers integration queried `current_setting('server_version')` and asserted the selected `18.6` service line before migration, precision and scope checks.
- Two Redis `8.10` containers started concurrently on distinct dynamically mapped ports. Both reported Redis `8.10.x`, `maxmemory-policy=noeviction` and `appendonly=yes`.
- Containers were stopped by the test cleanup path. No user data, local Compose volumes, tenant, or production service was modified.

## Remaining T013 acceptance

T013 remains `IN_REVIEW`. There is no local mail sink; PostgreSQL and Redis images are pinned by version tag rather than immutable digests captured in release evidence; and T006 still lacks the production region and backup/recovery decisions. This focused proof does not establish production durability or deployment readiness.
