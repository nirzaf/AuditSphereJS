# GitHub build and delivery

The Build and test workflow runs on pushes, pull requests and manual dispatch. It installs locked dependencies, provisions isolated PostgreSQL/Redis/RustFS fixtures, migrates and provisions database roles, compiles before seeding, runs unit/integration/browser tests, checks contracts and dependency advisories, builds the Linux image and exercises its runtime against real services.

Successful runs publish seven-day artifacts containing the Angular build, the compatibility container image and SHA256 checksums. Diagnostic service logs and browser test outputs are retained even after failures; local fixture infrastructure is stopped afterward. Private generated environment files are never uploaded.

Commit and push coherent verified milestones as implementation continues, as requested by the user. Inspect the worktree and remote first, preserve unrelated work, and inspect the GitHub Actions conclusion for the exact pushed commit. A queued or running workflow is not a passing check.

Production deployment remains unconfigured: the hosting target, environment secrets, Microsoft tenant/drive configuration and production acceptance are still required. The compatibility image includes test tooling and is not a hardened production runtime. Build artifact delivery does not establish product acceptance or authorize inventing a production destination.
