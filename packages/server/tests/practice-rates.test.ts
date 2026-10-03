import { describe, expect, it } from 'vitest';
import { createPracticeRateCardSchema, createPracticeStaffGradeAssignmentSchema, practiceJobGrades } from '@auditsphere/contracts';
import { calculatePracticeChargeOutValue } from '../src/modules/practice/rates.js';

describe('practice charge-out rate contracts and exact value calculation', () => {
  it('keeps professional job grades separate from access personas', () => {
    expect(practiceJobGrades).toEqual([
      'ENGAGEMENT_PARTNER', 'AUDIT_MANAGER', 'AUDIT_SUPERVISOR', 'AUDIT_SENIOR', 'AUDIT_ASSOCIATE', 'AUDIT_JUNIOR',
    ]);
    expect(createPracticeRateCardSchema.safeParse({
      idempotencyKey: '4b5c95b6-d605-4e11-89aa-19224b1a1c90', grade: 'REVIEWER', hourlyRate: '750',
      effectiveFrom: '2026-10-01', expectedPreviousVersion: 0,
    }).success).toBe(false);
  });

  it('requires positive durations, decimal strings and increasing exclusive end dates', () => {
    expect(createPracticeRateCardSchema.safeParse({
      idempotencyKey: '4b5c95b6-d605-4e11-89aa-19224b1a1c90', grade: 'AUDIT_MANAGER', hourlyRate: '750.000000',
      effectiveFrom: '2026-10-01', effectiveTo: '2026-10-01', expectedPreviousVersion: 1,
    }).success).toBe(false);
    expect(createPracticeStaffGradeAssignmentSchema.safeParse({
      idempotencyKey: '4b5c95b6-d605-4e11-89aa-19224b1a1c90', userId: '5b5c95b6-d605-4e11-89aa-19224b1a1c90', grade: 'AUDIT_MANAGER',
      effectiveFrom: '2026-10-01', effectiveTo: '2026-09-30', expectedPreviousVersion: 0,
    }).success).toBe(false);
    expect(() => calculatePracticeChargeOutValue('750', 0)).toThrow(/duration/);
    expect(() => calculatePracticeChargeOutValue('-1', 60)).toThrow(/greater than zero/);
  });

  it('calculates minutes from decimal rates with half-even rounding and no float arithmetic', () => {
    expect(calculatePracticeChargeOutValue('1000.000000', 60)).toBe('1000.000000');
    expect(calculatePracticeChargeOutValue('750.000000', 30)).toBe('375.000000');
    expect(calculatePracticeChargeOutValue('0.000003', 10)).toBe('0.000000');
    expect(calculatePracticeChargeOutValue('0.000009', 10)).toBe('0.000002');
  });
});
