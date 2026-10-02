import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pnpmEntrypoint = process.env.npm_execpath;
assert.ok(pnpmEntrypoint, "Run install-policy checks through pnpm");

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runRejectedInstall(label, setup) {
  const directory = mkdtempSync(join(tmpdir(), "auditsphere-pnpm-policy-"));
  try {
    writeFileSync(join(directory, ".npmrc"), "");
    setup(directory);
    const result = spawnSync(
      process.execPath,
      [
        pnpmEntrypoint,
        "install",
        "--no-frozen-lockfile",
        "--reporter",
        "append-only",
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_userconfig: join(directory, ".npmrc"),
        },
        timeout: 30_000,
      },
    );
    assert.notEqual(
      result.status,
      0,
      `${label} unexpectedly installed successfully.\n${`${result.stdout}\n${result.stderr}`.slice(-2500)}`,
    );
    assert.equal(
      result.error?.code,
      undefined,
      `${label} could not launch pnpm: ${result.error?.message}`,
    );
    console.log(`${label}: rejected as expected (exit ${result.status}).`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

runRejectedInstall("Unapproved dependency build script", (directory) => {
  writeFileSync(
    join(directory, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\nstrictDepBuilds: true\nallowBuilds: {}\n",
  );
  writeJson(join(directory, "package.json"), {
    name: "policy-fixture",
    private: true,
    dependencies: { "local-script": "workspace:*" },
  });
  const dependency = join(directory, "packages", "local-script");
  mkdirSync(dependency, { recursive: true });
  writeJson(join(dependency, "package.json"), {
    name: "local-script",
    version: "1.0.0",
    scripts: { postinstall: 'node -e "process.exit(99)"' },
  });
});

runRejectedInstall("Incompatible peer dependency", (directory) => {
  writeFileSync(
    join(directory, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\nstrictPeerDependencies: true\n",
  );
  writeJson(join(directory, "package.json"), {
    name: "policy-fixture",
    private: true,
    dependencies: {
      "local-host": "workspace:*",
      "local-plugin": "workspace:*",
    },
  });
  const host = join(directory, "packages", "local-host");
  const plugin = join(directory, "packages", "local-plugin");
  mkdirSync(host, { recursive: true });
  mkdirSync(plugin, { recursive: true });
  writeJson(join(host, "package.json"), {
    name: "local-host",
    version: "1.0.0",
  });
  writeJson(join(plugin, "package.json"), {
    name: "local-plugin",
    version: "1.0.0",
    peerDependencies: { "local-host": "^2.0.0" },
  });
});

const mismatch = mkdtempSync(join(tmpdir(), "auditsphere-pnpm-lock-"));
try {
  writeFileSync(join(mismatch, ".npmrc"), "");
  writeJson(join(mismatch, "package.json"), {
    name: "lock-fixture",
    private: true,
    dependencies: { "missing-from-lock": "1.0.0" },
  });
  writeFileSync(
    join(mismatch, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nimporters:\n  .: {}\npackages: {}\nsnapshots: {}\n",
  );
  const result = spawnSync(
    process.execPath,
    [
      pnpmEntrypoint,
      "install",
      "--frozen-lockfile",
      "--reporter",
      "append-only",
    ],
    {
      cwd: mismatch,
      encoding: "utf8",
      env: { ...process.env, npm_config_userconfig: join(mismatch, ".npmrc") },
      timeout: 30_000,
    },
  );
  assert.notEqual(
    result.status,
    0,
    "Frozen install unexpectedly accepted a mismatched lockfile",
  );
  assert.equal(
    result.error?.code,
    undefined,
    `Frozen-lockfile fixture could not launch pnpm: ${result.error?.message}`,
  );
  console.log(
    `Lockfile mismatch: rejected as expected (exit ${result.status}).`,
  );
} finally {
  rmSync(mismatch, { recursive: true, force: true });
}

console.log("pnpm install denial-path checks passed.");
