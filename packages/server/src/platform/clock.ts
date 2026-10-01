/**
 * Time primitives shared by deadline, audit and accounting logic (T023).
 *
 * Two separable concerns live here:
 *  - a `Clock` seam so business code never calls `new Date()` directly and can be tested
 *    deterministically; every instant it returns is a UTC point in time;
 *  - `AccountingDate`, a date-only calendar day with no time, offset or DST component, so
 *    period, sign-off and archival dates mean the same thing on every server zone (AC3).
 *
 * Only the minimum shared mechanism lives here. Deadlines, retention and workflow policy stay in
 * the modules that own them; the source leaves their exact hour-of-day boundary open (D09).
 */
import { Injectable, Module } from '@nestjs/common';

/** Source of the current UTC instant. Inject this instead of reading the wall clock inline. */
export interface Clock {
  now(): Date;
}

/** Production clock backed by the host wall clock. Returned instants are UTC points in time. */
@Injectable()
export class SystemClock implements Clock {
  now(): Date { return new Date(); }
}

/** Deterministic clock for tests and replayable operations. Accepts an ISO instant or a Date. */
export class FixedClock implements Clock {
  private instant: Date;
  constructor(iso: string | Date) { this.instant = toInstant(iso); }
  now(): Date { return new Date(this.instant.getTime()); }
  set(iso: string | Date): void { this.instant = toInstant(iso); }
  advanceSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new Error('Advance must be finite');
    this.instant = new Date(this.instant.getTime() + seconds * 1000);
  }
}

export const CLOCK = Symbol('CLOCK');

function toInstant(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid clock instant: ' + String(value));
  return date;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A proleptic-Gregorian calendar day identified only by year, month and day. All conversions use
 * UTC getters so the value is independent of the server's local time zone (AC3).
 */
export class AccountingDate {
  private constructor(readonly year: number, readonly month: number, readonly day: number) {}

  /** Parse a `YYYY-MM-DD` string, rejecting non-calendar days such as 2026-02-30. */
  static fromISO(text: string): AccountingDate {
    if (!ISO_DATE.test(text)) throw new Error('Accounting date must be YYYY-MM-DD: ' + text);
    const [year, month, day] = text.split('-').map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      throw new Error('Invalid calendar date: ' + text);
    }
    return new AccountingDate(year, month, day);
  }

  /** Project a UTC instant onto its accounting day. */
  static fromUtcInstant(instant: Date): AccountingDate {
    return new AccountingDate(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
  }

  toISO(): string { return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`; }

  /** Whole-calendar-day shift. Date.UTC normalises month/year overflow, including negative offsets. */
  addDays(count: number): AccountingDate {
    if (!Number.isInteger(count)) throw new Error('Day offset must be an integer');
    const probe = new Date(Date.UTC(this.year, this.month - 1, this.day + count));
    return new AccountingDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
  }

  /** Start of this accounting day as a UTC instant. */
  startOfUtcDay(): Date { return new Date(Date.UTC(this.year, this.month - 1, this.day)); }

  compare(other: AccountingDate): number {
    return (this.year - other.year) || (this.month - other.month) || (this.day - other.day);
  }
  equals(other: AccountingDate): boolean { return this.compare(other) === 0; }
  isBefore(other: AccountingDate): boolean { return this.compare(other) < 0; }
  isAfter(other: AccountingDate): boolean { return this.compare(other) > 0; }
}

/**
 * Boundary at which a whole-day countdown that begins on an accounting date has elapsed, e.g. the
 * 60-day ISA 230 archival timer measured from the Partner's signature day (D09). A monitor declares
 * the deadline passed when its clock instant is at or after this UTC midnight. The exact
 * hour-of-day enforcement policy remains a lifecycle decision owned by the archive module (T131).
 */
export function deadlineAfterCalendarDays(start: AccountingDate, calendarDays: number): Date {
  if (!Number.isInteger(calendarDays) || calendarDays < 0) {
    throw new Error('Calendar days must be a non-negative integer');
  }
  return start.addDays(calendarDays).startOfUtcDay();
}

function pad(value: number, width: number): string { return String(value).padStart(width, '0'); }

@Module({ providers: [{ provide: CLOCK, useClass: SystemClock }], exports: [CLOCK] })
export class ClockModule {}
