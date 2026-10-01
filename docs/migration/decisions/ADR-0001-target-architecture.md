# ADR-0001 — Migration target architecture is NestJS + Fastify + Angular

- Status: accepted for implementation (engineering decision), 2026-10-01
- Supersedes: nothing. Resolves a documented conflict in the preserved requirements.
- Decision owner: migration scope request; implementation under delegated engineering authority

## Context

`docs/requirements/CURRENT.md` is the preserved v2.1 requirements document and its header still
describes an ASP.NET/Blazor architecture. The destination repository is already a pnpm workspace
with a NestJS + Fastify API, an Angular standalone SPA, a separate worker, Prisma/PostgreSQL
persistence and shared server/contracts packages. Migration plan section 3.2 requires the conflict
to be recorded as a decision instead of silently rewriting the source requirements.

## Decision

1. The implementation architecture for this migration is NestJS + Fastify + Angular + PostgreSQL,
   as already established in `docs/guides/04-architecture-contract.md`.
2. The preserved requirement bytes are not edited to match. `pnpm verify:task -- T001` asserts
   `docs/requirements/CURRENT.md` is byte-identical to `docs/sources/requirements-current.md`,
   so rewriting the header would break the baseline gate and destroy source evidence.
3. Source Razor components are a behavioral reference. Workflows, permissions, precision,
   lineage and lifecycle gates are ported; markup and component internals are not.
4. The source's compound `(firm, client, engagement)` ownership discipline, decimal precision
   and append-only history are treated as requirements regardless of the technology change.

## Consequences

- Any reader of `CURRENT.md` must also read this ADR; the header is historically accurate, not
  current guidance.
- New dependencies are not introduced merely because the source used a library. Plan section 5.2
  applies: prefer the existing Angular/CDK/Nest stack until a requirement proves otherwise.
- Capability parity is tracked separately from requirement coverage (plan section 3.1), because a
  task can satisfy a v2.1 requirement while a legacy accounting feature remains unmigrated.
