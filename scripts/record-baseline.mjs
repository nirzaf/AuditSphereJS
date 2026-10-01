import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash = value => createHash('sha256').update(value).digest('hex');
const source = readFileSync('docs/sources/requirements-current.md');
mkdirSync('docs/requirements', { recursive: true });
writeFileSync('docs/requirements/CURRENT.md', source);
const traceability = readFileSync('docs/guides/06-requirements-traceability.md', 'utf8');
const ids = [...new Set(traceability.match(/R\d{3}/g))].sort();
if (ids.length !== 82 || !source.toString().includes('**Document Version** | 2.1')) throw new Error('Unexpected requirements baseline');
mkdirSync('docs/evidence/T001', { recursive: true });
writeFileSync('docs/evidence/T001/baseline.json', JSON.stringify({ version: '2.1', status: 'CURRENT', sha256: hash(source), coverageIds: ids, repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), capturedDate: '2026-10-01', startingPoint: 'Additive continuation of a greenfield local technical scaffold. No deployed .NET data or application is verified.' }, null, 2) + '\n');
const guide = readFileSync('docs/guides/05-decisions-and-source-conflicts.md', 'utf8');
const decisions = guide.split(/^## (D\d{2}) — (.+)$/m).slice(1);
const records = [];
for (let i = 0; i < decisions.length; i += 3) {
  const [id, title, content] = decisions.slice(i, i + 3);
  records.push({ id, title, status: 'PENDING', ownerRole: content.match(/\*\*Owner:\*\* (.+)/)?.[1] || 'Unassigned', namedOwner: null, sourceLines: content.match(/\*\*Source lines:\*\* `([^`]+)`/)?.[1], ambiguity: content.match(/\*\*Unresolved point:\*\* (.+)/)?.[1], approvedBy: null, approvedAt: null, approvalEvidence: null });
}
mkdirSync('docs/decisions', { recursive: true });
if (records.length !== 12) throw new Error('Unexpected policy register');
if (!existsSync('docs/decisions/register.json')) writeFileSync('docs/decisions/register.json', JSON.stringify(records, null, 2) + '\n');
console.log(`Preserved CURRENT v2.1, ${ids.length} coverage IDs and ${records.length} pending decisions. SHA-256 ${hash(source)}`);
