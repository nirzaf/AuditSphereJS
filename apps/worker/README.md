# Worker process

The worker owns asynchronous Trial Balance parsing and maintenance sweeps; it runs in a separate
Node process from the Fastify API. Heavy parsing therefore cannot monopolize the API event loop.

BullMQ producer connections use a short connection timeout, one request retry and a disabled
offline queue. An unavailable Redis write fails the outbox pass quickly; PostgreSQL keeps the
operation and the next pass retries with the same operation/job UUID. Worker connections use
`maxRetriesPerRequest: null`, an enabled offline queue and capped persistent reconnect delays.

Trial Balance parsing is capped at one active job per worker process. BullMQ retries are bounded
to three attempts with exponential delay. Failed jobs remain in Redis for at most seven days and
1,000 records; completed jobs are pruned after one day or 5,000 records. Queue payloads contain
only scoped record IDs and a payload version. The durable operation UUID is also the job ID and
correlation key. PostgreSQL operation state and compare-and-set claims suppress duplicate work;
external provider outcomes remain `UNKNOWN` until reconciled.

SIGINT/SIGTERM stop relay and sweep timers, wait for in-flight maintenance, stop new worker claims,
and let an active processor finish its transaction boundary before closing Redis and PostgreSQL.
BullMQ stalled-job detection is configured explicitly, allowing a replacement worker to reclaim
jobs after an unclean process loss. No API cancellation endpoint is currently exposed; user-driven
cancellation policy remains outside the worker runtime until its owning workflow defines it.

Run `pnpm verify:task -- T031` for the Redis reconnection, bounded producer failure, retained-job,
outbox recovery, shutdown, and API event-loop isolation checks.
