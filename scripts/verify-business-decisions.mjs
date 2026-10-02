import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const register = JSON.parse(readFileSync('docs/decisions/register.json', 'utf8'));
const guide = readFileSync('docs/guides/05-decisions-and-source-conflicts.md', 'utf8');
const specification = JSON.parse(readFileSync('docs/decisions/T002-policy-gate.json', 'utf8'));
const current = readFileSync('docs/requirements/CURRENT.md');
const preserved = readFileSync('docs/sources/requirements-current.md');
assert.ok(current.equals(preserved), 'CURRENT must remain byte-identical to the preserved source');

const byId = new Map(register.map((decision) => [decision.id, decision]));
for (let number = 1; number <= 12; number += 1) {
  const id = `D${String(number).padStart(2, '0')}`;
  const decision = byId.get(id);
  assert.ok(decision, `${id} must exist in the register`);
  assert.equal(decision.status, 'APPROVED_IMPLEMENTATION_DEFAULT', `${id} must have an explicit approval state`);
  assert.ok(decision.ownerRole?.trim(), `${id} must retain its decision owner role`);
  assert.ok(decision.namedOwner?.trim(), `${id} must identify the delegated implementation owner`);
  assert.ok(decision.sourceLines?.trim(), `${id} must cite source lines`);
  assert.match(decision.ambiguity ?? '', /./, `${id} must preserve the ambiguity`);
  assert.match(decision.approvedBy ?? '', /user delegated/i, `${id} must have user-delegated approval evidence`);
  assert.match(guide, new RegExp(`^## ${id} — `, 'm'), `${id} source conflict must remain visible in the guide`);
}
for (const id of ['D01', 'D02', 'D04', 'D11', 'D12']) {
  assert.equal(byId.get(id)?.decisionRecord, 'docs/decisions/T002-business-defaults.md', `${id} must link to the approved interpretation`);
}
assert.equal(byId.get('D03')?.decisionRecord, 'docs/decisions/T004-records-defaults.md', 'D03 timing is owned by T004');
for (const id of ['D05', 'D06', 'D07']) assert.equal(byId.get(id)?.decisionRecord, 'docs/decisions/T003-methodology-defaults.md', `${id} must link to T003 policy`);
for (const id of ['D08', 'D09', 'D10']) assert.equal(byId.get(id)?.decisionRecord, 'docs/decisions/T004-records-defaults.md', `${id} must link to T004 policy`);

const dependencies = specification.featureDecisionDependencies;
function evaluateTaskGate(taskId, source = byId) {
  if (!/^T\d{3}$/.test(taskId) || !Object.hasOwn(dependencies, taskId)) {
    return { code: 'VALIDATION_ERROR', message: 'Unknown or malformed task policy-gate target.' };
  }
  const pending = dependencies[taskId].filter((id) => {
    const decision = source instanceof Map ? source.get(id) : source.find((entry) => entry.id === id);
    return !decision || decision.status !== 'APPROVED_IMPLEMENTATION_DEFAULT' || !decision.approvedBy;
  });
  return pending.length ? { code: 'POLICY_PENDING', decisions: pending } : { code: 'ALLOW', decisions: [] };
}

for (const [taskId, ids] of Object.entries(dependencies)) {
  assert.ok(ids.length > 0, `${taskId} must map at least one decision`);
  assert.equal(evaluateTaskGate(taskId).code, 'ALLOW', `${taskId} decisions are approved`);
  for (const id of ids) assert.ok(byId.has(id), `${taskId} refers to registered ${id}`);
}
for (const testCase of specification.expectedGateCases) {
  const modified = new Map(byId);
  for (const [id, status] of Object.entries(testCase.decisionOverrides)) {
    modified.set(id, { ...modified.get(id), status });
  }
  assert.equal(evaluateTaskGate(testCase.taskId, modified).code, testCase.expectedCode, `gate vector ${testCase.taskId}`);
}
const absentApproval = new Map(byId);
absentApproval.set('D01', { ...byId.get('D01'), approvedBy: '' });
assert.equal(evaluateTaskGate('T060', absentApproval).code, 'POLICY_PENDING', 'missing approval evidence fails closed');

console.log('T002 business decisions: D01-D12 source, owner, approval and affected-task gates passed.');
