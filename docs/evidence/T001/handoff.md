# T001 handoff

Outcome: preserved supplied CURRENT v2.1 unchanged; recorded SHA-256, all 82 coverage IDs, actual Git/code/data starting point and unknowns. Source requirements: R001, R002, R079.

Changed: `docs/requirements/CURRENT.md`, baseline JSON, starting-point inventory and reviewable pending decision register. No application data or code was removed. No migration or production operation.

Verification: `node scripts/record-baseline.mjs`; byte/hash verification in the T001 documentation test. Baseline is greenfield technical scaffold; a real legacy migration is not verified. T163/T164 N/A needs the appropriate recorded disposition rather than an inferred approval.

Review: agent consistency review checks preserved bytes and coverage IDs. This is not professional policy approval or production acceptance.
