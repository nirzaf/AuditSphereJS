import { describe, it, expect } from 'vitest';
import {
  Decimal6, AccountingDate, FixedClock, deadlineAfterCalendarDays, MONEY_SCALE, MAX_INTEGER_DIGITS,
} from '@auditsphere/server';

describe('decimal arithmetic policy (T023 AC1)', () => {
  it('adds without binary float error and keeps the six-decimal storage scale', () => {
    expect(Decimal6.from('0.1').add(Decimal6.from('0.2')).toFixed(MONEY_SCALE)).toBe('0.300000');
  });

  it('rounds the final QAR value half-to-even to two decimals', () => {
    expect(Decimal6.from('53421.00').roundQar().toQarString()).toBe('53421.00');
    expect(Decimal6.from('1.005').roundQar().toQarString()).toBe('1.00');
    expect(Decimal6.from('1.015').roundQar().toQarString()).toBe('1.02');
  });

  it('applies the signed-balance display policy', () => {
    expect(Decimal6.from('10').toSignedQarString()).toBe('+10.00');
    expect(Decimal6.from('-10').toSignedQarString()).toBe('-10.00');
    expect(Decimal6.from('0').toSignedQarString()).toBe('0.00');
  });
});

describe('input digit and scale bounds fail closed (T023)', () => {
  it('accepts values that fit numeric(28,6)', () => {
    expect(Decimal6.fromInput('1234567890123456789012.123456').toQarString().startsWith('1234567890123456789012')).toBe(true);
  });

  it('rejects too many integer digits', () => {
    const tooBig = '1'.repeat(MAX_INTEGER_DIGITS + 1) + '.00';
    expect(() => Decimal6.fromInput(tooBig)).toThrow(/integer digits/);
  });

  it('rejects excess scale instead of silently rounding an input figure', () => {
    expect(() => Decimal6.fromInput('1.1234567')).toThrow(/exceeds scale/);
  });

  it('rejects non-decimal input', () => {
    expect(() => Decimal6.fromInput('1e5')).toThrow(/Invalid decimal input/);
    expect(() => Decimal6.fromInput('12,345')).toThrow(/Invalid decimal input/);
  });
});

describe('safe percent and variance (T023 AC2)', () => {
  it('reports a zero prior base explicitly, never a misleading 0%', () => {
    const variance = Decimal6.variance(Decimal6.from('500'), Decimal6.zero());
    expect(variance.direction).toBe('NO_BASE');
    expect(variance.percent).toBeNull();
    expect(variance.change.toFixed(2)).toBe('500.00');
  });

  it('computes signed percentage variance against the prior base', () => {
    const up = Decimal6.variance(Decimal6.from('120'), Decimal6.from('100'));
    expect(up.direction).toBe('INCREASE');
    expect(up.percent?.toFixed(6)).toBe('20.000000');

    const down = Decimal6.variance(Decimal6.from('100'), Decimal6.from('120'));
    expect(down.direction).toBe('DECREASE');
    expect(down.percent?.toFixed(6)).toBe('-16.666667');
  });

  it('treats an unchanged non-zero balance as zero percent, distinct from a no-base row', () => {
    const flat = Decimal6.variance(Decimal6.from('100'), Decimal6.from('100'));
    expect(flat.direction).toBe('NO_CHANGE');
    expect(flat.percent?.isZero()).toBe(true);
  });

  it('measures movement against the absolute prior base so a negative comparative keeps direction', () => {
    const v = Decimal6.variance(Decimal6.from('-40'), Decimal6.from('-100'));
    expect(v.direction).toBe('INCREASE');
    expect(v.percent?.toFixed(6)).toBe('60.000000');
  });
});

describe('date-only accounting dates and injectable clock (T023 AC3)', () => {
  it('parses real calendar dates and rejects impossible days', () => {
    expect(AccountingDate.fromISO('2026-02-28').toISO()).toBe('2026-02-28');
    expect(() => AccountingDate.fromISO('2026-02-30')).toThrow(/Invalid calendar date/);
    expect(() => AccountingDate.fromISO('2026-1-5')).toThrow(/YYYY-MM-DD/);
  });

  it('projects UTC instants onto the accounting day regardless of the server local zone', () => {
    const lateThatDay = new Date('2026-01-01T23:30:00Z');
    const earlyNextDay = new Date('2026-01-02T00:30:00Z');
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'Asia/Kathmandu']) {
      process.env.TZ = zone;
      expect(AccountingDate.fromUtcInstant(lateThatDay).toISO()).toBe('2026-01-01');
      expect(AccountingDate.fromUtcInstant(earlyNextDay).toISO()).toBe('2026-01-02');
    }
    process.env.TZ = 'UTC';
  });

  it('shifts whole calendar days across month and year boundaries', () => {
    expect(AccountingDate.fromISO('2026-01-31').addDays(1).toISO()).toBe('2026-02-01');
    expect(AccountingDate.fromISO('2026-12-31').addDays(1).toISO()).toBe('2027-01-01');
    expect(AccountingDate.fromISO('2026-03-01').addDays(-1).toISO()).toBe('2026-02-28');
  });

  it('orders accounting days', () => {
    const earlier = AccountingDate.fromISO('2026-05-01');
    const later = AccountingDate.fromISO('2026-05-02');
    expect(earlier.isBefore(later)).toBe(true);
    expect(later.isAfter(earlier)).toBe(true);
    expect(earlier.equals(AccountingDate.fromISO('2026-05-01'))).toBe(true);
  });

  it('computes the 60-day archival boundary as a UTC midnight independent of local zone', () => {
    const signature = AccountingDate.fromISO('2026-01-01');
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue']) {
      process.env.TZ = zone;
      expect(deadlineAfterCalendarDays(signature, 60).toISOString()).toBe('2026-03-02T00:00:00.000Z');
    }
    process.env.TZ = 'UTC';
  });

  it('rejects a negative or fractional countdown', () => {
    expect(() => deadlineAfterCalendarDays(AccountingDate.fromISO('2026-01-01'), -1)).toThrow(/non-negative integer/);
    expect(() => deadlineAfterCalendarDays(AccountingDate.fromISO('2026-01-01'), 5.5)).toThrow(/non-negative integer/);
  });

  it('exposes a deterministic injectable clock that ticks forward', () => {
    const clock = new FixedClock('2026-10-01T00:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-10-01T00:00:00.000Z');
    clock.advanceSeconds(90);
    expect(clock.now().toISOString()).toBe('2026-10-01T00:01:30.000Z');
    clock.set('2027-01-01T00:00:00Z');
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(() => new FixedClock('not-a-date')).toThrow(/Invalid clock instant/);
  });
});
