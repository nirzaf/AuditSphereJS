# Docker Desktop stale Windows socket recovery

Observed failure: Docker Desktop 4.91.0 could not rename `sailor-ingest.sock` or `docker-secrets-engine/engine.sock`; Windows returned error 1920. Linux engine never became available.

Recovery performed on 2026-10-01:
1. Stopped only Docker Desktop/backend/diagnostic processes.
2. Renamed `%LOCALAPPDATA%/Docker/run` and `%LOCALAPPDATA%/docker-secrets-engine` to timestamped backup directories.
3. Created fresh directories at both original locations before starting Desktop.
4. Started Desktop and confirmed Docker Engine 29.8.0 and running `docker-desktop` WSL.

Both directories must be refreshed together when both sockets are malformed. The secrets-engine directory was inspected and contained only its runtime socket. Do not apply this to directories containing additional data without examining them.

No factory reset, prune, uninstall, WSL unregister, VHDX deletion, or container/volume deletion was performed. Preserve the runtime backups until recovery remains stable.

Similar reported issue: https://github.com/docker/desktop-feedback/issues/676
