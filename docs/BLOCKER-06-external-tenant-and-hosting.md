# B06 — External access: Microsoft 365 tenant, Cloudflare, production inputs

**Status:** Open, 2026-10-08. **Owner:** user (sign-in and inputs). **Kind:** external. The agent does not enter credentials and does not provision anything without an explicit request.

## Current state of the browser sessions

- **Microsoft 365 / Entra.** The built-in browser pane is on the Microsoft sign-in page (`login.microsoftonline.com`, an organizations OAuth request for the Entra admin centre). Sign-in is not complete. The agent has not entered a username or password.
- **Cloudflare.** Google Chrome, Browser 1 (Windows), is on `dash.cloudflare.com/login`. The email field is filled and the password is empty. The agent has not entered a password or clicked Sign in.

The user completes sign-in in those windows. After that, the agent can read pages in them, read-only, if asked.

## What is blocked by this

| Item | Blocked on | Evidence |
| :--- | :--- | :--- |
| Verifying the Microsoft 365 permission and consent configuration against `docs/microsoft365/` | Tenant sign-in by the user; no purpose stated yet | `AGENTS.md`: keep `docs/microsoft365/*.md` current with tenant changes, and record verification dates |
| SPK-02 option A (retention label behaviour for members with edit rights) | A test tenant with admin rights. Unverified in any tenant | `docs/evidence/SPK-02/spike.md`, "Not verified here" |
| Live provider tests (`pnpm test:m365:storage:live`, `RUN_LIVE_E2E=1`) | Real tenant credentials, supplied through a secure store, never in chat or CI | `AGENTS.md`, "Which runner picks up which file" |
| Production hosting, region, production recovery, retention, accountable owners | User-supplied inputs. T006 is DONE only for non-production scope | `docs/tasks/00-readiness/T006-deployment-decisions.md` (Outcome, and "production readiness remains separately gated") |
| T133 production object-version retention controls | NOT_STARTED; depends on B02 row 4 and on this block | `docs/guides/13-execution-ledger.md` |
| SPK-06 renderer proof | T036 acceptance ([B01](BLOCKER-01-independent-review.md)), not this block | `docs/evidence/SPK-06/spike.md` |

## Cloudflare: what is and is not allowed

T006 says the repository does not select or provision a production host, registry, database or cache on the user's behalf. Any Cloudflare resource creation (Workers, Pages, DNS, R2 buckets, tunnels) is therefore out of scope until the user explicitly asks for it and supplies the production inputs above. Viewing the dashboard is allowed. Changing it is not.

## Steps to unblock

1. **User signs in** to the Microsoft 365 tenant and to Cloudflare in the windows above. The agent does not type credentials.
2. **State the purpose** of each access. For example: read the app registration and admin consent for `docs/microsoft365/permission-matrix.md`; or check the Cloudflare account that the owner names.
3. **Read-only first.** The agent records what it reads, with dates, in the relevant `docs/microsoft365/*.md` file, and never records a secret value.
4. **Any change needs explicit approval** for that exact action. Consent grants, permission changes, DNS, and resource creation each need their own approval.
5. **For SPK-02 option A**, the user provides a test tenant. Run the label test there, record the result in `docs/evidence/SPK-02/`, and only then change the "Not verified here" section.
6. **For production**, the user supplies the T006 inputs in writing: region, recovery objective, retention, and accountable owners. Those become a new decision in `docs/decisions/register.json`.
7. **Credentials** for live tests go into the secure store named in the runbook (`docs/runbooks/`), never into the repository, a chat message, or a log.

## Done when

- The purpose of each access is recorded, and any read-only verification is in `docs/microsoft365/` with a date.
- No production resource exists unless the user has supplied the T006 inputs and asked for it.
- SPK-02 option A has a result from a test tenant, or the owner accepts the unverified status in writing.
