#!/usr/bin/env node
// MIG-003 differential harness.
//
// Runs the destination calculators that exist today against the source-quoted characterization
// fixtures and reports, per case, whether the destination agrees. Fixtures whose capability has no
// destination implementation are reported as "destination-absent" rather than silently skipped.
//
// Usage: node scripts/migration/differential.mjs   (requires a prior pnpm build:server)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const { Decimal6, deriveBenchmark, calculateMateriality, validateMateriality, selectSample, calculateQuotation, validateQuotation, quotationInputHash, requiredApprovals, calculateContractContribution } = await import('@auditsphere/server');
const fixtureDir = 'fixtures/characterization';
const outDir = 'docs/migration/inventory';
const load = (name) => JSON.parse(readFileSync(path.join(fixtureDir, name + '.json'), 'utf8'));
const decimalLike = (value) => /^-?\d+(\.\d+)?$/.test(String(value));
const equal = (actual, expected) => decimalLike(actual) && decimalLike(expected)
  ? Decimal6.from(expected).equals(Decimal6.from(actual))
  : String(expected) === String(actual);
const mapped = (raw) => raw.map((line) => ({ sourceAccountCode: line.sourceAccountCode ?? '', destinationCode: line.destinationCode ?? line.fsli ?? '', statementSection: line.statementSection ?? '', amount: Decimal6.from(line.amount) }));
const results = [];
const record = (fixture, id, check, expected, actual, supersededBy = null) => results.push({
  fixture, case: id, check, expected, actual,
  outcome: supersededBy ? 'SUPERSEDED' : equal(actual, expected) ? 'MATCH' : 'DIFF',
  ...(supersededBy ? { supersededBy } : {}),
});

// --- Materiality: a destination implementation exists (governance/materiality.ts). -----------
{
  const fixture = load('materiality');
  const byId = Object.fromEntries(fixture.cases.map((item) => [item.id, item]));
  const revenue = byId['revenue-driven-entity'];
  const figures = calculateMateriality(Decimal6.from(revenue.expected.benchmarkAmount), 1, Decimal6.from(revenue.input.ratePercent), Decimal6.from(revenue.input.performancePercent), Decimal6.from(revenue.input.sadPercent));
  record('materiality', revenue.id, 'planningMateriality', revenue.expected.planningMateriality, figures.planningMateriality.toFixed(6));
  record('materiality', revenue.id, 'tolerableError', revenue.expected.tolerableError, figures.tolerableError.toFixed(6));
  record('materiality', revenue.id, 'sadThreshold', revenue.expected.sadThreshold, figures.sadThreshold.toFixed(6));
  record('materiality', revenue.id, 'policyAccepted', 'null', String(validateMateriality('REVENUE', Decimal6.from(revenue.input.ratePercent), Decimal6.from(revenue.input.performancePercent), Decimal6.from(revenue.input.sadPercent))));

  const derivation = byId['benchmark-derivation-from-mapped-tb'];
  const lines = mapped(derivation.reconstructedInput.lines);
  for (const [kind, expected] of [['REVENUE', derivation.expected.revenue], ['PROFIT_BEFORE_TAX', derivation.expected.profitBeforeTax], ['TOTAL_ASSETS', derivation.expected.totalAssets], ['NET_ASSETS', derivation.expected.netAssets]]) {
    const derived = deriveBenchmark(kind, lines);
    record('materiality', derivation.id, 'derive:' + kind, expected, derived ? derived.amount.toFixed(6) : 'null');
  }
  for (const [kind, expected] of [['TOTAL_EXPENSES', derivation.expected.totalExpenses], ['MAPPED_LINE:RECEIVABLES', derivation.expected.mappedLineReceivables]]) {
    record('materiality', derivation.id, 'derive:' + kind, expected, 'Not evaluated; excluded by D19/CURRENT', 'D19/CURRENT section 4.2.4 limits selected benchmarks to REVENUE, PROFIT_BEFORE_TAX, TOTAL_ASSETS and NET_ASSETS.');
  }

  const invalidRate = byId['out-of-policy-rate'];
  const rateMessage = validateMateriality('REVENUE', Decimal6.from(invalidRate.input.ratePercent), Decimal6.from(invalidRate.input.performancePercent), Decimal6.from(invalidRate.input.sadPercent));
  record('materiality', invalidRate.id, 'rejected', 'true', String(Boolean(rateMessage)));

  const lossCase = byId['loss-fails-closed'];
  const lossLines = mapped(lossCase.input.lines.map((line) => ({ destinationCode: line.fsli, statementSection: line.fsli, amount: line.amount })));
  const loss = deriveBenchmark('PROFIT_BEFORE_TAX', lossLines);
  record('materiality', lossCase.id, 'derivedBenchmark', lossCase.expected.derivedBenchmarkAmount, loss.amount.toFixed(6));
  let threw = false; try { calculateMateriality(loss.amount, 1, Decimal6.from('2'), Decimal6.from('5'), Decimal6.from('5')); } catch { threw = true; }
  record('materiality', lossCase.id, 'failsClosed', 'true', String(threw));

  const bands = byId['risk-band-matrix'];
  record('materiality', bands.id, 'bands', bands.expected.bands.join(','), 'Not evaluated; legacy risk matrix superseded', bands.supersededBy);
}

// --- Sampling: a destination implementation exists (fieldwork/sampling.ts). ------------------
{
  const fixture = load('sampling');
  const byId = Object.fromEntries(fixture.cases.map((item) => [item.id, item]));
  const population = fixture.population.map(([stableRowId, amount]) => ({ stableRowId, signedAmount: Decimal6.from(amount) }));
  const stats = byId['population-stats'];
  const mus = selectSample(population, { method: stats.input.method, interval: Decimal6.from(stats.input.interval) });
  record('sampling', stats.id, 'populationCount', stats.expected.populationCount, mus.populationCount);
  record('sampling', stats.id, 'populationAbsoluteTotal', stats.expected.populationAbsoluteTotal, mus.populationAbsoluteTotal.toFixed(6));
  record('sampling', stats.id, 'uniqueSelections', 'true', String(new Set(mus.items.map((item) => item.stableRowId)).size === mus.selectedCount));

  const keyItem = byId['key-item-threshold'];
  const keyOutcome = selectSample(population, { method: keyItem.input.method, keyItemThreshold: Decimal6.from(keyItem.input.keyItemThreshold) });
  record('sampling', keyItem.id, 'selectedRowIds', keyItem.expected.selectedRowIds.join(','), keyOutcome.items.map((item) => item.stableRowId).join(','));
  record('sampling', keyItem.id, 'selectedAbsoluteTotal', keyItem.expected.selectedAbsoluteTotal, keyOutcome.selectedAbsoluteTotal.toFixed(6));

  const random = byId['random-seed-reproducible'];
  const plan = { method: random.input.method, sampleSize: random.input.sampleSize, seed: random.input.seed };
  const firstRandom = selectSample(population, plan);
  const secondRandom = selectSample(population, plan);
  record('sampling', random.id, 'itemCount', random.expected.itemCount, firstRandom.items.length);
  record('sampling', random.id, 'reproducible', 'true', String(firstRandom.items.map((i) => i.stableRowId).join(',') === secondRandom.items.map((i) => i.stableRowId).join(',')));
  record('sampling', random.id, 'differentSeedChangesSelection', 'true', String(firstRandom.items.map((i) => i.stableRowId).join(',') !== selectSample(population, { ...plan, seed: 7 }).items.map((i) => i.stableRowId).join(',')));

  const clamped = byId['random-clamped-to-population'];
  const clampedOutcome = selectSample(population, { method: clamped.input.method, sampleSize: clamped.input.sampleSize, seed: clamped.input.seed });
  record('sampling', clamped.id, 'itemCount', clamped.expected.itemCount, clampedOutcome.items.length);
  record('sampling', clamped.id, 'coveragePercent', clamped.expected.coveragePercent, clampedOutcome.coveragePercent.toFixed(6));

  const stratified = byId['stratified-key-plus-draw'];
  const stratifiedOutcome = selectSample(population, { method: stratified.input.method, keyItemThreshold: Decimal6.from(stratified.input.keyItemThreshold), sampleSize: stratified.input.sampleSize, seed: stratified.input.seed });
  record('sampling', stratified.id, 'itemCount', stratified.expected.itemCount, stratifiedOutcome.items.length);
  record('sampling', stratified.id, 'keyItemsPresent', stratified.expected.keyItemIdsPresent.join(','), stratified.expected.keyItemIdsPresent.filter((key) => stratifiedOutcome.items.some((item) => item.stableRowId === key && item.inclusionReason.startsWith('Key item'))).join(','));
  record('sampling', stratified.id, 'stratifiedDrawCount', stratified.expected.stratifiedDrawCount, stratifiedOutcome.items.filter((item) => item.inclusionReason.startsWith('Stratified random')).length);

  const zero = byId['zero-rows-excluded'];
  const zeroOutcome = selectSample([...population, { stableRowId: 'row-00', signedAmount: Decimal6.from('0') }], { method: zero.input.method, keyItemThreshold: Decimal6.from(zero.input.keyItemThreshold) });
  record('sampling', zero.id, 'selectedRowIds', zero.expected.selectedRowIds.join(','), zeroOutcome.items.map((item) => item.stableRowId).join(','));
  record('sampling', zero.id, 'coveragePercent', zero.expected.coveragePercent, zeroOutcome.coveragePercent.toFixed(6));
  record('sampling', zero.id, 'populationCount', zero.expected.populationCount, zeroOutcome.populationCount);

  const negative = byId['negative-exposure-selection'];
  const negativePopulation = negative.input.population.map(([stableRowId, amount]) => ({ stableRowId, signedAmount: Decimal6.from(amount) }));
  const negativeOutcome = selectSample(negativePopulation, { method: negative.input.method, keyItemThreshold: Decimal6.from(negative.input.keyItemThreshold) });
  record('sampling', negative.id, 'selectedRowIds', negative.expected.selectedRowIds.join(','), negativeOutcome.items.map((item) => item.stableRowId).join(','));
  record('sampling', negative.id, 'populationSignedTotal', negative.expected.populationSignedTotal, negativeOutcome.populationSignedTotal.toFixed(6));
  record('sampling', negative.id, 'populationAbsoluteTotal', negative.expected.populationAbsoluteTotal, negativeOutcome.populationAbsoluteTotal.toFixed(6));
}

// --- Quotation: a destination implementation exists (commercial/quotation.ts). ----------------
{
  const fixture = load('quotation');
  const byId = Object.fromEntries(fixture.cases.map((item) => [item.id, item]));
  const pricing = (item) => ({
    currency: item.input.currency,
    lines: item.input.lines.map((line) => ({ role: line.role, activity: line.activity, hours: Decimal6.from(line.hours), ratePerHour: Decimal6.from(line.ratePerHour), rateCardVersionId: line.rateCardVersionId })),
    complexityFactor: Decimal6.from(item.input.complexityFactor), riskPremiumPercent: Decimal6.from(item.input.riskPremiumPercent), discountPercent: Decimal6.from(item.input.discountPercent),
  });

  const feeCase = byId['fee-breakdown-order'];
  const feeResult = calculateQuotation(pricing(feeCase));
  for (const [check, expected, actual] of [
    ['baseAmount', feeCase.expected.baseAmount, feeResult.baseAmount.toFixed(2)],
    ['complexityAmount', feeCase.expected.complexityAmount, feeResult.complexityAmount.toFixed(2)],
    ['riskPremiumAmount', feeCase.expected.riskPremiumAmount, feeResult.riskPremiumAmount.toFixed(2)],
    ['discountAmount', feeCase.expected.discountAmount, feeResult.discountAmount.toFixed(2)],
    ['fee', feeCase.expected.fee, feeResult.fee.toFixed(2)],
  ]) record('quotation', feeCase.id, check, expected, actual);

  const orderCase = byId['line-order-invariance'];
  const forward = pricing(orderCase);
  const reversed = { ...forward, lines: [...forward.lines].reverse() };
  const note = orderCase.input.note;
  record('quotation', orderCase.id, 'feeEqualsForwardOrder', 'true', String(calculateQuotation(forward).fee.equals(calculateQuotation(reversed).fee)));
  record('quotation', orderCase.id, 'inputHashEqualsForwardOrder', 'true', String(quotationInputHash(forward, false, null) === quotationInputHash(reversed, false, null)));
  record('quotation', orderCase.id, 'hashChangesWithDiscount', 'true', String(quotationInputHash(forward, false, null) !== quotationInputHash({ ...forward, discountPercent: Decimal6.from('1') }, false, null)));
  record('quotation', orderCase.id, 'hashChangesWithNonStandardTerms', 'true', String(quotationInputHash(forward, true, note) !== quotationInputHash(forward, false, null)));

  const roundingCase = byId['per-stage-currency-rounding'];
  const roundingResult = calculateQuotation(pricing(roundingCase));
  record('quotation', roundingCase.id, 'allAmountsRoundedToMinorUnit', 'true', String([roundingResult.baseAmount, roundingResult.complexityAmount, roundingResult.riskPremiumAmount, roundingResult.discountAmount, roundingResult.fee].every((amount) => amount.equals(amount.roundTo(2)))));

  const rangeCase = byId['out-of-range-factors'];
  const base = pricing(feeCase);
  const rejected = (rangeCase.input.cases).filter((override) => {
    const candidate = { ...base, ...Object.fromEntries(Object.entries(override).map(([key, value]) => [key, Decimal6.from(value)])) };
    return validateQuotation(candidate) !== null;
  }).length;
  record('quotation', rangeCase.id, 'rejectedCount', rangeCase.input.cases.length, rejected);

  const defaultApproval = byId['approval-default-threshold'];
  record('quotation', defaultApproval.id, 'requiredRoles', defaultApproval.expected.requiredRoles.join(','), requiredApprovals([], Decimal6.from(defaultApproval.input.discountPercent), defaultApproval.input.nonStandardTerms).map((approval) => approval.role).join(','));

  const configuredApproval = byId['approval-configured-bands'];
  const rules = configuredApproval.input.configuredRules.map((rule) => ({ id: rule.id, kind: rule.kind, thresholdPercent: rule.thresholdPercent ? Decimal6.from(rule.thresholdPercent) : null, requiredRole: rule.requiredRole, active: rule.active }));
  record('quotation', configuredApproval.id, 'requiredRoles', configuredApproval.expected.requiredRoles.join(','), requiredApprovals(rules, Decimal6.from(configuredApproval.input.discountPercent), configuredApproval.input.nonStandardTerms).map((approval) => approval.role).join(','));
}

// --- Practice analytics (C33): a destination implementation exists (practice/analytics.ts). ----
{
  const fixture = load('practice-analytics');
  for (const item of fixture.cases) {
    const result = calculateContractContribution(
      Decimal6.from(item.input.fee),
      item.input.currency,
      item.input.approvedTime.map((row) => ({ minutes: row.minutes, capturedRate: row.capturedRate === null ? null : Decimal6.from(row.capturedRate), currency: row.currency })),
    );
    const available = item.expected.available === true;
    record('practice-analytics', item.id, 'available', String(available), String(result !== null));
    if (available && result) {
      record('practice-analytics', item.id, 'lifetimeStandardValue', item.expected.lifetimeStandardValue, result.lifetimeStandardValue.toFixed(6));
      record('practice-analytics', item.id, 'feeLessStandardValue', item.expected.feeLessStandardValue, result.feeLessStandardValue.toFixed(6));
    }
  }
}

// --- Capabilities with fixtures but no destination implementation yet. ------------------------
const absent = [];
const notYetExtracted = ['C17 currency remeasurement and translation', 'C18/C19 consolidation'];

mkdirSync(outDir, { recursive: true });
const diffs = results.filter((row) => row.outcome === 'DIFF');
const superseded = results.filter((row) => row.outcome === 'SUPERSEDED');
const report = {
  generatedAt: new Date().toISOString(),
  harness: 'scripts/migration/differential.mjs',
  sourceCommit: load('materiality').provenance.commit,
  boundary: 'Expected values are quoted from the pinned source domain tests; the source stack was not executed here. MATCH means the destination calculator agrees with the source test assertion, not that the source produced it in this session.',
  totals: { checks: results.length, matched: results.filter((row) => row.outcome === 'MATCH').length, differences: diffs.length, superseded: superseded.length, destinationAbsentFamilies: absent.length, notYetExtracted },
  results, absent,
};
writeFileSync(path.join(outDir, 'differential.json'), JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '# Differential report (MIG-003)',
  '',
  'Generated by `scripts/migration/differential.mjs` at ' + report.generatedAt + ' from the pinned source',
  'commit `' + report.sourceCommit + '`.',
  '',
  '> ' + report.boundary,
  '',
  '## Totals',
  '',
  '| Metric | Value |',
  '| --- | ---: |',
  '| Checks run | ' + report.totals.checks + ' |',
  '| Matched | ' + report.totals.matched + ' |',
  '| Differences | ' + report.totals.differences + ' |',
  '| Superseded source cases (not asserted) | ' + report.totals.superseded + ' |',
  '| Fixture families with no destination implementation | ' + report.totals.destinationAbsentFamilies + ' |',
  '',
  '## Checks',
  '',
  '| Fixture | Case | Check | Expected | Actual | Outcome |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map((row) => '| ' + [row.fixture, row.case, row.check, row.expected, row.actual, row.outcome].join(' | ') + ' |'),
  '',
  '## Destination-absent families',
  '',
  ...(absent.length
    ? ['| Fixture | Capability | Cases |', '| --- | --- | ---: |', ...absent.map((row) => '| ' + row.fixture + ' | ' + row.capability + ' | ' + row.cases + ' |')]
    : ['None — every extracted fixture family has a destination implementation.']),
  '',
  '## Not yet extracted',
  '',
  ...notYetExtracted.map((item) => '- ' + item),
  '',
].join('\n');
writeFileSync(path.join(outDir, '..', '03-differential-report.md'), markdown);
for (const row of results) console.log(row.outcome.padEnd(10) + row.fixture + ' ' + row.case + ' ' + row.check + ' expected=' + row.expected + ' actual=' + row.actual + (row.supersededBy ? ` supersededBy=${row.supersededBy}` : ''));
for (const row of absent) console.log('ABSENT ' + row.fixture + ' (' + row.capability + ') cases=' + row.cases);
console.log('checks=' + results.length + ' matched=' + report.totals.matched + ' differences=' + diffs.length + ' superseded=' + superseded.length);
if (diffs.length) process.exitCode = 2;
