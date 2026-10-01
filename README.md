# AuditSphereJS

Production modular monolith — TypeScript end-to-end (NestJS + Fastify API, Angular Web, NestJS Worker), PostgreSQL system of record, Redis for ephemeral coordination, S3-compatible object storage.

- **Architecture version:** 1.0
- **Primary currency:** QAR
- **Doc:** `auditsphere-nestjs-fastify-angular-architecture-implementation-plan.md`

## Structure (planned monorepo)

- `apps/api` — NestJS + Fastify REST + OpenAPI
- `apps/web` — Angular frontend
- `apps/worker` — BullMQ processors (imports, PDFs, notifications, archival)

## Getting started

> Scaffolding lands next. See the implementation plan doc for the authoritative baseline.
