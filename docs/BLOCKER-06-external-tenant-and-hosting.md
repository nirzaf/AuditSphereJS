# B06 — External access: Microsoft 365 tenant, Cloudflare, production inputs

**Status:** Partly resolved, rechecked 2026-10-08. The built-in browser is signed in to the `easyguide` Entra tenant and the designated SharePoint/OneDrive nonproduction storage acceptance was rerun. **Owner:** user for any production inputs. The agent does not enter credentials or provision anything without explicit authorization.

## Current state of the browser sessions

- **Microsoft 365 / Entra.** Read-only browser observation on 2026-10-08 shows the signed-in `easyguide` tenant and its Users view loaded (15 users). The view includes the pre-existing AuditSphere synthetic Staff Fixture and client fixtures. No user, role, app registration, permission, grant or tenant data was changed.
- **Cloudflare.** Google Chrome, Browser 1 (Windows), is on `dash.cloudflare.com/login`. The email field is filled and the password is empty. The agent has not entered a password or clicked Sign in.

The user completes sign-in in those windows. After that, the agent can read pages in them, read-only, if asked.

## What is blocked by this

| Item | Blocked on | Evidence |
| :--- | :--- | :--- |
| Verifying the Microsoft 365 configuration | Read-only browser session is now available; prior configuration is in the dated tenant guide | This pass did not change or recheck every Entra permission; see `docs/microsoft365/current-tenant.md` |
| SPK-02 option A (retention label behavior for members with edit rights) | A test tenant with admin rights and configured labels; still unverified | `docs/evidence/SPK-02/spike.md`, "Not verified here" |
| Live selected-folder provider tests | **Reverified 2026-10-08:** `pnpm test:m365:storage:live`, 2/2 passed against existing synthetic SharePoint/OneDrive folders | Redacted run records under `docs/evidence/T156/live-storage-2026-10-08-56361a8d*.json` |
| Production hosting, region, recovery, retention and accountable owners | **Not in the requested scope:** user previously selected public assets without deployment. T006 is DONE for nonproduction scope only. | `docs/tasks/00-readiness/T006-deployment-decisions.md` |
| T133 production object-version retention controls | NOT_STARTED; depends on B02 row 4 and on this block | `docs/guides/13-execution-ledger.md` |
| SPK-06 renderer proof | T036 acceptance ([B01](BLOCKER-01-independent-review.md)), not this block | `docs/evidence/SPK-06/spike.md` |

## Cloudflare: what is and is not allowed

T006 records the user's no-deployment/public-assets scope. No Cloudflare resource is needed for this blocker pass; creating Workers, Pages, DNS, R2 buckets or tunnels remains outside scope.

## Steps to unblock

1. Keep `docs/microsoft365/current-tenant.md` current after a read-only review and record the date and exact scope.
2. Only configure tenant permissions or retention after explicit approval for that exact change.
3. For SPK-02 option A, run the label test in a designated test tenant and record the result in `docs/evidence/SPK-02/`.
4. Production remains gated until a deployment is requested and the T006 region, recovery, retention and accountable-owner inputs are supplied.
5. Credentials for live tests stay in the designated ignored private environment file, never in the repository or chat.

## Done when

- The nonproduction selected-folder SharePoint and OneDrive checks are evidenced; the run did not change tenant configuration.
- Production hosting remains out of scope under T006; no deployment claim is made.
- SPK-02 retention-label behavior and duration remain explicitly unverified until records-owner/test-tenant evidence exists.
