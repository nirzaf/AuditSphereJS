# Architecture
Three applications: Nest/Fastify API, Angular web, Nest application-context BullMQ worker.
PostgreSQL holds engagement, document metadata, staged balances, audit events and transactional outbox.
RustFS holds immutable CSV bytes. Redis holds retryable job coordination.
Five module boundaries are reserved. Fieldwork is the first executable vertical slice.
Development bearer authentication is explicitly opt-in, loopback-only, and disabled in production.
Production identity, business lifecycle guards, portal, leases and realtime remain backlog items.
Dependencies follow the supplied compatibility lines. TypeScript 6.0 is verified against the installed Angular compiler peer range.
