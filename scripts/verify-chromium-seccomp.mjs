import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const upstreamPath = 'config/moby-seccomp-default.json';
const rendererPath = 'config/seccomp-chromium.json';
const upstreamSha256 = '6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6';
const upstreamCommit = '2ceae35d351c156cb5a8efc0fdc4a08cf94569d8';
const cloneNewUser = 0x10000000;
const cloneNewPid = 0x20000000;
const cloneNewNet = 0x40000000;
const forbiddenNamespaceMask = 0x0e020000; // NEWNS, NEWUTS, NEWIPC, NEWCGROUP

const source = readFileSync(upstreamPath);
assert.equal(createHash('sha256').update(source).digest('hex'), upstreamSha256, 'upstream Moby profile bytes changed');
const expected = JSON.parse(source.toString('utf8'));

let cloneRuleCount = 0;
for (const rule of expected.syscalls) {
  if (!rule.names.includes('clone') || !rule.args) continue;
  const flagArgument = rule.args.find(argument => argument.op === 'SCMP_CMP_MASKED_EQ');
  if (!flagArgument) continue;
  assert.equal(flagArgument.value, 2114060288, 'upstream clone namespace mask changed');
  flagArgument.value = forbiddenNamespaceMask;
  cloneRuleCount++;
}
assert.equal(cloneRuleCount, 2, 'expected x86_64 and s390 architecture-specific clone rules');

expected.syscalls.push(
  {
    names: ['unshare'],
    action: 'SCMP_ACT_ALLOW',
    args: [{ index: 0, value: cloneNewUser, op: 'SCMP_CMP_EQ' }],
    comment: 'Permit only unprivileged user-namespace creation required by Chromium.',
  },
  {
    names: ['chroot'],
    action: 'SCMP_ACT_ALLOW',
    comment: 'Chromium enters its empty sandbox root only after creating its isolated user namespace.',
  },
);

assert.equal(expected.defaultAction, 'SCMP_ACT_ERRNO');
assert.equal(expected.defaultErrnoRet, 1);
assert.equal((cloneNewUser | cloneNewPid | cloneNewNet) & forbiddenNamespaceMask, 0);
assert.notEqual(0x00020000 & forbiddenNamespaceMask, 0, 'mount namespaces must remain denied');
assert.notEqual(0x04000000 & forbiddenNamespaceMask, 0, 'UTS namespaces must remain denied');
assert.notEqual(0x08000000 & forbiddenNamespaceMask, 0, 'IPC namespaces must remain denied');
assert.notEqual(0x02000000 & forbiddenNamespaceMask, 0, 'cgroup namespaces must remain denied');

if (process.argv.includes('--write')) {
  writeFileSync(rendererPath, `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`Generated ${rendererPath} from pinned Moby profile ${upstreamCommit}.`);
} else {
  const actual = JSON.parse(readFileSync(rendererPath, 'utf8'));
  assert.deepEqual(actual, expected, 'Chromium profile must differ from the pinned Moby default only by the reviewed namespace/chroot rules');
  console.log(`Chromium seccomp profile matches pinned Moby ${upstreamCommit}; all other syscalls default-deny.`);
}
