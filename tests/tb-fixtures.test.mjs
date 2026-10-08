import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseTrialBalance } from '@auditsphere/server';
import { assertBalanced, balanceTotals, FSLI_BY_PREFIX, readZipLocalEntries } from '../fixtures/trial-balance/generator.mjs';

const root = resolve('fixtures/trial-balance/generated');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const centsForParsedRow = value => {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error(`Unexpected parser balance: ${value}`);
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0').slice(0, 2));
  return match[1] ? -amount : amount;
};
const amountFromCents = minor => `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;

describe('deterministic Trial Balance fixture pack', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

  const assertCsvDataset = count => {
    const dataset = manifest.datasets.find(entry => entry.filename === `balance-${count}.csv`);
    const bytes = readFileSync(resolve(root, dataset.filename));
    expect(bytes.length).toBe(dataset.bytes);
    expect(sha256(bytes)).toBe(dataset.sha256);
    const rows = parseTrialBalance(bytes.toString('utf8'));
    expect(rows).toHaveLength(count);
    let current = 0n;
    let prior = 0n;
    let currentDebits = 0n;
    let currentCredits = 0n;
    let priorDebits = 0n;
    let priorCredits = 0n;
    const groupCounts = Object.fromEntries(Object.keys(FSLI_BY_PREFIX).map(prefix => [prefix, 0]));
    for (const row of rows) {
      const currentAmount = centsForParsedRow(row.current);
      const priorAmount = centsForParsedRow(row.prior);
      current += currentAmount;
      prior += priorAmount;
      if (currentAmount >= 0n) currentDebits += currentAmount;
      else currentCredits -= currentAmount;
      if (priorAmount >= 0n) priorDebits += priorAmount;
      else priorCredits -= priorAmount;
      const prefix = row.code.slice(0, 2);
      expect(FSLI_BY_PREFIX[prefix]).toBeDefined();
      groupCounts[prefix] += 1;
    }
    expect({ current: current.toString(), prior: prior.toString() }).toEqual({ current: '0', prior: '0' });
    expect({
      currentDebits: amountFromCents(currentDebits),
      currentCredits: amountFromCents(currentCredits),
      priorDebits: amountFromCents(priorDebits),
      priorCredits: amountFromCents(priorCredits),
    }).toEqual({
      currentDebits: dataset.expectedCurrentDebits,
      currentCredits: dataset.expectedCurrentCredits,
      priorDebits: dataset.expectedPriorDebits,
      priorCredits: dataset.expectedPriorCredits,
    });
    expect(Object.values(groupCounts).reduce((sum, value) => sum + value, 0)).toBe(count);
    expect(Object.fromEntries(Object.keys(FSLI_BY_PREFIX).map(prefix => [FSLI_BY_PREFIX[prefix], groupCounts[prefix]])))
      .toEqual(dataset.mappingOutcomes);
    expect(rows.some(row => row.current.startsWith('-'))).toBe(true);
    expect(rows.some(row => row.prior.startsWith('-'))).toBe(true);
    expect(rows.some(row => row.prior === '0.00')).toBe(true);
  };

  it('parses the 5,000-row CSV, verifies exact totals and covers every mapping group', () => assertCsvDataset(5_000));
  it.each([25_000, 50_000])('parses the %i-row CSV, verifies exact totals and covers every mapping group', count => assertCsvDataset(count), 15_000);

  it.each([5_000, 25_000, 50_000])('contains a deterministic, readable %i-row XLSX workbook', count => {
    const dataset = manifest.datasets.find(entry => entry.filename === `balance-${count}.xlsx`);
    const bytes = readFileSync(resolve(root, dataset.filename));
    expect(bytes.length).toBe(dataset.bytes);
    expect(sha256(bytes)).toBe(dataset.sha256);
    const entries = readZipLocalEntries(bytes);
    expect([...entries.keys()]).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
    ]);
    const workbook = entries.get('xl/workbook.xml');
    const sheet = entries.get('xl/worksheets/sheet1.xml');
    expect(workbook).toContain('name="Trial Balance"');
    expect(sheet).toContain(`ref="A1:D${count + 1}"`);
    expect(sheet.match(/<row r=/g)).toHaveLength(count + 1);
    expect(sheet).toContain('<t>code</t>');
    expect(sheet).toContain('<t>prior</t>');
  });

  it('rejects known duplicate and malformed CSV rows and rejects a parser-valid unbalanced file with the fixture oracle', () => {
    const duplicate = readFileSync(resolve(root, 'duplicate-account.csv'), 'utf8');
    const malformed = readFileSync(resolve(root, 'malformed-row.csv'), 'utf8');
    const unbalanced = readFileSync(resolve(root, 'unbalanced.csv'), 'utf8');
    for (const fixture of manifest.exceptionalFiles) {
      const bytes = readFileSync(resolve(root, fixture.filename));
      expect(bytes.length).toBe(fixture.bytes);
      expect(sha256(bytes)).toBe(fixture.sha256);
    }
    expect(() => parseTrialBalance(duplicate)).toThrow(/duplicate account/i);
    expect(() => parseTrialBalance(malformed)).toThrow(/Invalid current balance/);
    const parsedUnbalanced = parseTrialBalance(unbalanced);
    expect(balanceTotals(parsedUnbalanced).current).not.toBe(0n);
    expect(() => assertBalanced(parsedUnbalanced)).toThrow(/unbalanced/);
  });

  it('records the cross-client lookalike rule and verifies files match the generator output', () => {
    expect(manifest.crossClientLookalike).toMatchObject({
      accountCode: '10000000',
      clients: ['Synthetic Fixture Client A', 'Synthetic Fixture Client B'],
    });
    const expectedFiles = [...manifest.datasets.map(entry => entry.filename), ...manifest.exceptionalFiles.map(entry => entry.filename), 'manifest.json'];
    expect(readdirSync(root).sort()).toEqual(expectedFiles.sort());
  });
});
