# Production release checklist

**All initial statuses: unchecked.** This list defines the release gate; it does not certify the application. T169 records the actual GO/NO-GO decision. T170 performs no production write without explicit authorization.

## Dependency and build gates

- [ ] Exact supported Node LTS, pnpm, Angular/compiler/TypeScript, Nest/Fastify and ORM combination is resolved and recorded.
- [ ] The Prisma release-status discrepancy is resolved; no RC/beta/next package enters production silently.
- [ ] All installed direct/transitive dependencies have current advisory/license review; native install scripts are explicitly approved.
- [ ] Compiled server DI, Angular production build, Fastify plugins, PostgreSQL driver, queue, realtime, browser/PDF and enabled provider smokes pass on the target image.
- [ ] Artifacts share one commit/lockfile, image digests, build provenance and SBOM; test evidence identifies those exact artifacts.

## Source and professional gates

- [ ] Every required R001–R082 item has implementation and test evidence, not only a planned task link.
- [ ] D01–D12 applicable policies are approved by named owners, including fee trigger, LOR sequence, role authority, numerical/sampling methodology and archive assurance.
- [ ] Four personas and all eleven named states/rework edges pass UAT; no test-only bypass survives in production.
- [ ] Actual report/opinion templates and signing assurance are approved; document appearance alone is not treated as cryptographic or regulatory proof.

## Integrity and security gates

- [ ] INV-01–INV-24 pass with actual role-separated/race/provider evidence.
- [ ] Application and worker roles cannot rewrite posted journals, approved history, sealed evidence or audit events.
- [ ] Firm/client/engagement isolation covers normal APIs, jobs, rooms, batch endpoints, uploads, links and downloads.
- [ ] Presigned upload completion after release is denied; archive deadline freezes writes even while storage sealing is pending.
- [ ] No open critical/high exploitable issue is accepted without explicit formal handling; relevant controls are retested after fixes.
- [ ] Secrets/signing keys are outside builds/logs, production privileges are least-privilege, and untrusted PRs cannot read deployment credentials.

## Operational gates

- [ ] Representative 5k/25k/50k import and mixed-workload tests meet owner-approved SLOs; recorded results replace all provisional targets.
- [ ] Connection pools, CPU/document workers, body sizes, job payloads and memory are bounded.
- [ ] Queue recovery after Redis/process failures and unknown provider outcomes does not duplicate financial/release actions.
- [ ] Database and object restoration has been performed in isolation; amounts, hashes and archive states reconcile within approved RPO/RTO.
- [ ] Rolling release, WebSocket reconnect, worker drain and application rollback are rehearsed. Database repairs are separate, authorized work.
- [ ] Monitoring/alert ownership, runbooks and credential rotation/revocation procedures are assigned.

## Conditional features and cutover

- [ ] Every enabled M365 capability has actual nonproduction tenant consent/permission/revocation/throttling evidence; disabled features have an approved N/A entry.
- [ ] Legacy migration is either reconciled and rehearsed or explicitly N/A for confirmed greenfield scope.
- [ ] The final release requires fresh human authorization. Task completion is not permission to merge, deploy, remove data or change the tenant.
- [ ] Released build/migration identities, operator, smoke results, backup reference and rollback bounds are recorded in the handover.
