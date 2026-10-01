Read docs/requirements/CURRENT.md and the target module README before business changes.
Keep business rules in domain services, never controllers or Angular components.
PostgreSQL owns business truth. Redis leases are advisory.
Use decimal strings and Prisma Decimal for money. Never JavaScript monetary arithmetic.
Every protected mutation needs engagement scope and workflow authorization.
Every editable aggregate needs optimistic versions. Never overwrite approved artifacts.
Audit events are append-only. Never update/delete posted journals; reverse them.
Heavy parsing and rendering belong in workers. Use explicit reviewed migrations.
Do not mutate another module's owned tables. Do not hand-edit generated code.
Run pnpm verify:affected. Add meaningful invariant tests and record evidence honestly.
Do not deploy, publish or claim functional acceptance from scaffold tests alone.
Keep docs/microsoft365/*.md current in the same change when modifying tenant configuration, Entra/Graph integrations, permissions, repository bindings, credentials or their acceptance tests. Record verification dates and limitations; never document secret values.
