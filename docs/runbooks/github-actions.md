# GitHub build and delivery

The Build and test workflow runs on pushes, pull requests and manual dispatch. It installs locked dependencies, provisions isolated PostgreSQL/Redis/RustFS fixtures, migrates and provisions database roles, compiles before seeding, runs unit/integration/browser tests, checks contracts and dependency advisories, builds the Linux image and exercises its runtime against real services.

Every verification job runs `pnpm setup:local` after install and before `pnpm build:server`. Prisma's project config requires `DATABASE_URL` even for client generation, so the setup creates an ignored, disposable `.env` on the fresh runner; jobs that use services start infrastructure only after the build. The CI policy checker enforces this ordering and verifies that every `test:integration` file is assigned to a matrix shard.

Successful runs publish seven-day artifacts containing the Angular build, the compatibility container image and SHA256 checksums. Successful main-branch runs also create public prereleases with static web assets and their checksum file, as requested by the user. Diagnostic service logs and browser test outputs are retained even after failures; local fixture infrastructure is stopped afterward. Private generated environment files are never uploaded.

Commit and push coherent verified milestones as implementation continues, as requested by the user. Inspect the worktree and remote first, preserve unrelated work, and inspect the GitHub Actions conclusion for the exact pushed commit. A queued or running workflow is not a passing check.

The user explicitly requested no deployment. The workflow only builds, tests and publishes downloadable assets. The compatibility image includes test tooling and is not a hardened production runtime. Web assets require an API and Microsoft tenant/drive configuration for connected workflows; publishing them does not establish complete product acceptance.
