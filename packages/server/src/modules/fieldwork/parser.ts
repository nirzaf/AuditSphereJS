import { Readable } from 'node:stream';
import { parse as parseCsv } from 'csv-parse';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { moneySchema } from '@auditsphere/contracts';

export const MAX_ROWS = 50_000;
const MAX_RECORD_SIZE = 4_096;
/** Validation stops after this many row errors so a hostile file cannot grow the error list without bound. */
const MAX_ROW_ERRORS = 100;
const EXPECTED_COLUMNS = ['code', 'name', 'current', 'prior'] as const;

type RawRow = Record<(typeof EXPECTED_COLUMNS)[number], string>;
/** Normalized balance plus the exact source line and untrimmed cell text it was read from. */
export type TrialBalanceRow = {
  position: number;
  sourceLine: number;
  rawValues: RawRow;
  code: string;
  name: string;
  current: string;
  prior: string;
};
/** A row-specific validation failure. `sourceLine` is the file line the record ends on. */
export type TrialBalanceRowError = { sourceLine: number; message: string };
type CsvFailure = Error & { code?: string; lines?: number; info?: { lines?: number } };

/**
 * A permanent input defect. The worker records its row errors and does not retry, because the same
 * bytes will fail the same way. Transient infrastructure failures are never this type.
 */
export class TrialBalanceValidationError extends Error {
  readonly code = 'TB_VALIDATION_FAILED';
  readonly rowErrors: readonly TrialBalanceRowError[];

  constructor(message: string, rowErrors: readonly TrialBalanceRowError[] = []) {
    super(message);
    this.name = 'TrialBalanceValidationError';
    this.rowErrors = rowErrors;
  }
}

/** Gathers row errors up to the cap. The summary keeps the first message so single-row failures read exactly as before. */
export class RowErrorCollector {
  private readonly errors: TrialBalanceRowError[] = [];

  add(sourceLine: number, error: unknown): void {
    this.errors.push({ sourceLine, message: (error instanceof Error ? error.message : 'Invalid row').slice(0, 500) });
    if (this.errors.length >= MAX_ROW_ERRORS) throw this.toError(`${MAX_ROW_ERRORS} or more invalid rows; first: ${this.errors[0].message}`);
  }

  finish(): void {
    if (!this.errors.length) return;
    throw this.toError(this.errors.length === 1 ? this.errors[0].message : `${this.errors.length} invalid rows; first: ${this.errors[0].message}`);
  }

  private toError(message: string): TrialBalanceValidationError {
    return new TrialBalanceValidationError(message, this.errors);
  }
}

function columns(headers: string[]): string[] {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length
    || normalized.length !== EXPECTED_COLUMNS.length
    || EXPECTED_COLUMNS.some((column) => !normalized.includes(column))) {
    throw new Error('CSV headers must contain exactly code, name, current, prior');
  }
  return normalized;
}

function safeParseError(error: unknown): TrialBalanceValidationError {
  if (error instanceof TrialBalanceValidationError) return error;
  const failure = error as CsvFailure;
  if (failure?.code?.startsWith('CSV_') || failure?.code?.startsWith('INVALID_')) {
    const line = failure.lines ?? failure.info?.lines;
    const message = `Malformed CSV${line ? ` near source line ${line}` : ''} (${failure.code})`;
    return new TrialBalanceValidationError(message, line ? [{ sourceLine: line, message }] : []);
  }
  return new TrialBalanceValidationError(error instanceof Error ? error.message : 'Trial-balance CSV could not be parsed');
}

export function rowFromRecord(record: RawRow, position: number, sourceLine: number, seenCodes: Set<string>): TrialBalanceRow {
  const code = record.code?.trim();
  const name = record.name?.trim();
  if (!code || !name || code.length > 80 || name.length > 300 || seenCodes.has(code)) {
    throw new Error(`Invalid or duplicate account at source line ${sourceLine}`);
  }
  const current = moneySchema.safeParse(record.current);
  if (!current.success) throw new Error(`Invalid current balance at source line ${sourceLine}`);
  const prior = moneySchema.safeParse(record.prior);
  if (!prior.success) throw new Error(`Invalid prior balance at source line ${sourceLine}`);
  seenCodes.add(code);
  const rawValues = { code: record.code, name: record.name, current: record.current, prior: record.prior };
  return { position, sourceLine, rawValues, code, name, current: current.data, prior: prior.data };
}

const parserOptions = {
  encoding: 'utf8' as const,
  bom: true,
  delimiter: ',',
  quote: '"',
  escape: '"',
  columns,
  skip_empty_lines: true,
  max_record_size: MAX_RECORD_SIZE,
};

/** Compatibility helper for small pure-domain callers and tests. Production imports use the stream below. */
export function parseTrialBalance(csv: string): TrialBalanceRow[] {
  let records: Array<{ record: RawRow; info: { lines: number } }>;
  try {
    records = parseCsvSync(csv, { ...parserOptions, info: true }) as Array<{ record: RawRow; info: { lines: number } }>;
  } catch (error) {
    throw safeParseError(error);
  }
  if (!records.length || records.length > MAX_ROWS) throw new TrialBalanceValidationError('Import must contain 1-50,000 rows');
  const seenCodes = new Set<string>();
  const errors = new RowErrorCollector();
  const rows: TrialBalanceRow[] = [];
  records.forEach((item, index) => {
    try {
      rows.push(rowFromRecord(item.record, index, item.info.lines, seenCodes));
    } catch (error) {
      errors.add(item.info.lines, error);
    }
  });
  errors.finish();
  return rows;
}

/**
 * Parse and validate a bounded CSV stream one record at a time. The set retains only account
 * codes for duplicate detection; row objects are released as soon as the worker flushes a chunk.
 * Row-level defects are collected with their source lines and reported after the stream ends.
 */
export async function* parseTrialBalanceStream(csv: string | Buffer | Uint8Array): AsyncGenerator<TrialBalanceRow> {
  const source = Readable.from([csv]);
  const parser = source.pipe(parseCsv({ ...parserOptions, info: true }));
  const seenCodes = new Set<string>();
  const errors = new RowErrorCollector();
  let count = 0;
  try {
    for await (const item of parser as AsyncIterable<{ record: RawRow; info: { lines: number } }>) {
      count += 1;
      if (count > MAX_ROWS) throw new TrialBalanceValidationError('Import must contain 1-50,000 rows');
      let row: TrialBalanceRow;
      try {
        row = rowFromRecord(item.record, count - 1, item.info.lines, seenCodes);
      } catch (error) {
        errors.add(item.info.lines, error);
        continue;
      }
      yield row;
    }
  } catch (error) {
    source.destroy();
    throw safeParseError(error);
  }
  if (!count) throw new TrialBalanceValidationError('Import must contain 1-50,000 rows');
  errors.finish();
}

/** Flush validated rows in bounded batches and return the number persisted. */
export async function writeTrialBalanceChunks(
  rows: AsyncIterable<TrialBalanceRow>,
  write: (chunk: readonly TrialBalanceRow[]) => Promise<void>,
  chunkSize = 1_000,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 5_000) {
    throw new Error('Invalid trial-balance chunk size');
  }
  let chunk: TrialBalanceRow[] = [];
  let total = 0;
  for await (const row of rows) {
    signal?.throwIfAborted();
    chunk.push(row);
    if (chunk.length === chunkSize) {
      await write(chunk);
      total += chunk.length;
      chunk = [];
      signal?.throwIfAborted();
    }
  }
  if (chunk.length) {
    signal?.throwIfAborted();
    await write(chunk);
    total += chunk.length;
    signal?.throwIfAborted();
  }
  return total;
}
