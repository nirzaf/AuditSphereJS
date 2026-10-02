import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const workspacePolicy = readFileSync("pnpm-workspace.yaml", "utf8");
const section = (name, nextName) => {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `Missing workflow job: ${name}`);
  const end = nextName
    ? workflow.indexOf(`  ${nextName}:`, start + 1)
    : workflow.length;
  return workflow.slice(start, end === -1 ? workflow.length : end);
};

const verify = section("verify", "publish-web-assets");
const publish = section("publish-web-assets");

assert.match(
  workflow,
  /^permissions:\r?\n  contents: read\s*$/m,
  "Workflow default permissions must be read-only",
);
assert.match(
  verify,
  /^    permissions:\r?\n      contents: read\s*$/m,
  "Verification job must be read-only",
);
assert.match(
  publish,
  /^    permissions:\r?\n      contents: write\s*$/m,
  "Only the asset publisher may write repository contents",
);
assert.match(
  publish,
  /^    needs: verify\s*$/m,
  "Asset publication must wait for successful verification",
);
assert.match(
  publish,
  /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/,
  "Asset publication must be limited to main pushes",
);
assert.match(
  verify,
  /pnpm install --frozen-lockfile/,
  "CI must reject lockfile drift",
);
assert.match(
  verify,
  /run: node scripts\/verify-ci-workflow\.mjs/,
  "CI must execute its permission and cache policy assertions",
);
assert.match(
  verify,
  /run: pnpm exec node scripts\/verify-pnpm-install-policy\.mjs/,
  "CI must execute the install denial-path fixtures",
);
assert.match(
  verify,
  /uses: pnpm\/setup@v3[\s\S]*?version: 12\.8\.1[\s\S]*?runtime: node@24\.21\.0[\s\S]*?install: false[\s\S]*?cache: false/,
  "CI must set up exact runtimes without installing or restoring a dependency cache",
);
assert.doesNotMatch(
  verify,
  /cache:\s*pnpm|package-manager-cache:\s*true|cache:\s*true/,
  "Verification must start without a dependency cache",
);
assert.match(
  verify,
  /uses: actions\/upload-artifact@v6[\s\S]*?name: verified-build-\$\{\{ github\.sha \}\}/,
  "Verified artifact must be uploaded by the read-only job",
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
assert.doesNotMatch(
  verify,
  /GH_TOKEN|secrets\./,
  "Untrusted verification code must not receive publishing credentials",
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

console.log("CI workflow security and clean-install invariants passed.");
