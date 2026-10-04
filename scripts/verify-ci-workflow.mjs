import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const workspacePolicy = readFileSync("pnpm-workspace.yaml", "utf8");

// Discover top-level jobs (two-space indentation) and slice each job's section.
const jobNames = [...workflow.matchAll(/^  ([a-z][\w-]*):\s*$/gm)].map((match) => match[1]);
assert.ok(jobNames.length >= 2, "Workflow must declare its jobs");
const section = (name) => {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `Missing workflow job: ${name}`);
  const next = jobNames
    .map((other) => ({ name: other, index: workflow.indexOf(`  ${other}:`, start + 1) }))
    .filter((entry) => entry.index > start)
    .sort((left, right) => left.index - right.index)[0];
  return workflow.slice(start, next ? next.index : workflow.length);
};

const expectedJobs = ["static", "unit", "integration", "e2e", "image"];
for (const job of expectedJobs) assert.ok(jobNames.includes(job), `Missing verification job: ${job}`);
assert.ok(jobNames.includes("publish-web-assets"), "Missing publish-web-assets job");
const verifyJobs = jobNames.filter((name) => name !== "publish-web-assets");
assert.deepEqual(verifyJobs, expectedJobs, "Verification jobs must be exactly the read-only set");

for (const name of verifyJobs) {
  const job = section(name);
  assert.match(
    job,
    /^    permissions:\r?\n      contents: read\s*$/m,
    `${name} must be read-only`,
  );
  assert.match(
    job,
    /pnpm install --frozen-lockfile/,
    `${name} must reject lockfile drift`,
  );
  const setupLocal = job.indexOf("pnpm setup:local");
  const buildServer = job.indexOf("pnpm build:server");
  assert.ok(
    setupLocal !== -1 && buildServer !== -1 && setupLocal < buildServer,
    `${name} must create the ignored local env before Prisma generation`,
  );
  assert.match(
    job,
    /uses: pnpm\/setup@v3[\s\S]*?version: 12\.8\.1[\s\S]*?runtime: node@24\.21\.0[\s\S]*?install: false[\s\S]*?cache: false/,
    `${name} must set up exact runtimes without installing or restoring a dependency cache`,
  );
  assert.doesNotMatch(
    job,
    /GH_TOKEN|secrets\./,
    `Untrusted verification code in ${name} must not receive credentials`,
  );
}

assert.doesNotMatch(
  workflow,
  /cache:\s*pnpm|package-manager-cache:\s*true|cache:\s*true/,
  "Verification must never restore a dependency cache",
);

// The integration matrix shards must reference files that actually exist, so the shard
// lists cannot silently rot when suites are added or renamed.
const integration = section("integration");
const shardFiles = [...integration.matchAll(/^            (\S+\.ts)$/gm)].map((match) => match[1]);
assert.ok(shardFiles.length >= 30, "Integration must shard the full suite list");
assert.match(
  integration,
  /mapfile -t tests < <\(printf '%s\\n' "\$INTEGRATION_TESTS" \| awk 'NF'\)[\s\S]*?node --import tsx --test "\$\{tests\[@\]\}"/,
  "Integration shard paths must be passed as arguments rather than shell commands",
);
assert.match(
  integration,
  /contains\(matrix\.shard\.files, 'pdf-renderer\.integration\.ts'\)[\s\S]*?pnpm exec playwright install --with-deps chromium/,
  "The PDF integration shard must install its pinned Chromium runtime",
);
assert.match(
  integration,
  /Allow Chromium sandbox user namespaces on Ubuntu 24[\s\S]*?contains\(matrix\.shard\.files, 'pdf-renderer\.integration\.ts'\)[\s\S]*?kernel\.apparmor_restrict_unprivileged_userns=0/,
  "The PDF integration shard must allow its sandbox on Ubuntu 24",
);
const declared = new Set(shardFiles);
const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const suiteFiles = packageScripts["test:integration"].split(" ").filter((file) => file.endsWith(".ts"));
for (const file of suiteFiles) {
  assert.ok(declared.has(file), `Integration suite ${file} is missing from the CI shards`);
  assert.ok(existsSync(file), `Shard references missing test file: ${file}`);
}

const e2e = section("e2e");
assert.match(
  e2e,
  /pnpm exec playwright install --with-deps chromium/,
  "The e2e job must install the pinned Chromium runtime",
);
assert.match(
  e2e,
  /Allow Chromium sandbox user namespaces on Ubuntu 24/,
  "The e2e job must keep the Ubuntu 24 sandbox allowance",
);
assert.match(
  e2e,
  /RUN_LIVE_E2E: "1"/,
  "The e2e job must enable the live end-to-end suite",
);
assert.match(
  e2e,
  /if: always\(\)[\s\S]*?name: e2e-diagnostics-\$\{\{ github\.sha \}\}/,
  "The e2e job must always upload its diagnostics",
);

const image = section("image");
assert.match(
  image,
  /pnpm exec playwright install --with-deps chromium[\s\S]*?pnpm verify:task -- T035/,
  "The image job must install the PDF renderer browser before the T035 gate",
);
assert.match(
  image,
  /Allow Chromium sandbox user namespaces on Ubuntu 24[\s\S]*?kernel\.apparmor_restrict_unprivileged_userns=0[\s\S]*?pnpm verify:task -- T035/,
  "The image job must enable sandboxed Chromium on Ubuntu 24 before the T035 gate",
);
assert.match(
  image,
  /pnpm verify:task -- T035/,
  "The image job must run the PDF runtime gate",
);
assert.match(
  image,
  /uses: actions\/upload-artifact@v6[\s\S]*?name: verified-build-\$\{\{ github\.sha \}\}/,
  "The image job must upload the verified build artifact",
);

const publish = section("publish-web-assets");
assert.match(
  publish,
  /^    needs: \[static, unit, integration, e2e, image\]\s*$/m,
  "Publication must wait for every verification job",
);
assert.match(
  publish,
  /^    permissions:\r?\n      contents: write\s*$/m,
  "Only the asset publisher may write repository contents",
);
assert.match(
  publish,
  /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/,
  "Asset publication must be limited to main pushes",
);
assert.match(
  publish,
  /uses: actions\/download-artifact@v6[\s\S]*?name: verified-build-\$\{\{ github\.sha \}\}/,
  "Publisher must consume the artifact from this verified commit",
);
assert.match(
  publish,
  /GH_TOKEN:\s*\$\{\{ github\.token \}\}/,
  "Publisher token must be scoped to the publication job",
);
assert.match(
  workflow,
  /^permissions:\r?\n  contents: read\s*$/m,
  "Workflow default permissions must be read-only",
);

assert.match(
  workspacePolicy,
  /^strictPeerDependencies:\s*true\s*$/m,
  "Peer conflicts must fail install",
);
assert.match(
  workspacePolicy,
  /^engineStrict:\s*true\s*$/m,
  "Unsupported engines must fail install",
);
assert.match(
  workspacePolicy,
  /^strictDepBuilds:\s*true\s*$/m,
  "Unapproved dependency build scripts must fail install",
);
assert.match(
  workspacePolicy,
  /^allowBuilds:/m,
  "Install scripts must use the explicit build allowlist",
);

console.log("CI workflow security, sharding and clean-install invariants passed.");
