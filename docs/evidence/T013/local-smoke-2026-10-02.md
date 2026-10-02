# T013 local service smoke — 2026-10-02

## Environment

- Docker Desktop 4.93.0; Docker Engine 29.8.1; Linux `amd64` engine.
- Compose project services were already running. No container, image, or volume was removed or recreated for this check.
- PostgreSQL image `postgres:18.6`, resolved local digest `sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722`.
- Redis image `redis:8.10`, resolved local digest `sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee`.
- RustFS image is pinned in Compose to `sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff`.

## Verification

| Check | Result |
| :--- | :--- |
| `docker version` | PASS; client and Linux engine reachable |
| `docker compose ps` | PASS; PostgreSQL and Redis healthy; RustFS running |
| `docker compose config -q` | PASS |
| PostgreSQL `SHOW server_version` | PASS; `18.6 (Debian 18.6-1.pgdg13+2)` |
| Redis `INFO server` | PASS; `8.10.2` |
| Redis `CONFIG GET maxmemory-policy` | PASS; `noeviction` |
| Redis `CONFIG GET appendonly` | PASS; `yes` |
| `pnpm test:integration` | PASS; 18 tests, 18 passed, 0 failed, 0 skipped; 186.2 seconds |
| Hosted run for `a1bdc7f` | PASS; run [37045871980](https://github.com/nirzaf/AuditSphereJS/actions/runs/37045871980), including build, tests, Linux smoke and public web-assets job |

The integration suite created isolated PostgreSQL 18.6 Testcontainers and removed them after completion. No production tenant, Graph repository, SharePoint site, OneDrive, or deployment target was contacted.

## Remaining acceptance

T013 remains `IN_REVIEW`: there is no Redis Testcontainers helper/version assertion and no local mail sink in Compose. Its prerequisites also include T006, which remains open for production region, backup/recovery ownership and service-specific production retention. This record proves the services and integration tests observed locally; it does not prove production durability, service-region availability, or live M365 acceptance.
