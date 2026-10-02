# Local dependency services

These containers are local development dependencies only. Mailpit captures SMTP messages in memory; it does not deliver them externally. Compose binds SMTP and its viewing interface to loopback.

## Start

```powershell
pnpm setup:local
pnpm infra:up
docker compose ps
```

PostgreSQL is available at `127.0.0.1:5432`, Redis at `127.0.0.1:6379`, RustFS at `127.0.0.1:9000` (console `:9001`), Mailpit SMTP at `127.0.0.1:1025`, and the Mailpit viewer at `http://127.0.0.1:8025`.

## Stop without deleting data

```powershell
docker compose stop
```

Starting again with `pnpm infra:up` preserves named PostgreSQL, Redis and RustFS volumes. Mailpit messages are intentionally ephemeral. `docker compose down` removes containers and the network but keeps named volumes; do not use `docker compose down --volumes` unless you intentionally want to erase local database, queue and object data.

## Verify isolated test services

```powershell
pnpm verify:task -- T013
```

The task verifier starts disposable PostgreSQL, Redis and Mailpit containers with dynamic ports, checks actual server versions/configuration, sends only a synthetic SMTP message, and tears the containers down. It does not use or delete the persistent Compose volumes.
