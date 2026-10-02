import { Readable } from 'node:stream';
import { parse as parseCsv } from 'csv-parse';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { moneySchema } from '@auditsphere/contracts';

const MAX_ROWS = 50_000;
const MAX_RECORD_SIZE = 4_096;
const EXPECTED_COLUMNS = ['code', 'name', 'current', 'prior'] as const;

type TrialBalanceRow = { position: number; code: string; name: string; current: string; prior: string };
type RawRow = Record<(typeof EXPECTED_COLUMNS)[number], string>;
type CsvFailure = Error & { code?: string; lines?: number; info?: { lines?: number } };

function columns(headers: string[]): string[] {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length
    || normalized.length !== EXPECTED_COLUMNS.length
    || EXPECTED_COLUMNS.some((column) => !normalized.includes(column))) {
    throw new Error('CSV headers must contain exactly code, name, current, prior');
  }
  return normalized;
}

function safeParseError(error: unknown): Error {
  const failure = error as CsvFailure;
  if (failure?.code?.startsWith('CSV_') || failure?.code?.startsWith('INVALID_')) {
    const line = failure.lines ?? failure.info?.lines;
    return new Error(`Malformed CSV${line ? ` near source line ${line}` : ''} (${failure.code})`);
  }
  return error instanceof Error ? error : new Error('Trial-balance CSV could not be parsed');
}

function rowFromRecord(record: RawRow, position: number, sourceLine: number, seenCodes: Set<string>): TrialBalanceRow {
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
  return { position, code, name, current: current.data, prior: prior.data };
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
  let records: RawRow[];
  try {
    records = parseCsvSync(csv, parserOptions) as RawRow[];
  } catch (error) {
    throw safeParseError(error);
  }
  if (!records.length || records.length > MAX_ROWS) throw new Error('Import must contain 1-50,000 rows');
  const seenCodes = new Set<string>();
  return records.map((record, index) => rowFromRecord(record, index, index + 2, seenCodes));
}

/**
 * Parse and validate a bounded CSV stream one record at a time. The set retains only account
 * codes for duplicate detection; row objects are released as soon as the worker flushes a chunk.
 */
export async function* parseTrialBalanceStream(csv: string | Buffer | Uint8Array): AsyncGenerator<TrialBalanceRow> {
  const source = Readable.from([csv]);
  const parser = source.pipe(parseCsv({ ...parserOptions, info: true }));
  const seenCodes = new Set<string>();
  let count = 0;
  try {
    for await (const item of parser as AsyncIterable<{ record: RawRow; info: { lines: number } }>) {
      count += 1;
      if (count > MAX_ROWS) throw new Error('Import must contain 1-50,000 rows');
      yield rowFromRecord(item.record, count - 1, item.info.lines, seenCodes);
    }
  } catch (error) {
    source.destroy();
    throw safeParseError(error);
  }
  if (!count) throw new Error('Import must contain 1-50,000 rows');
}

/** Flush validated rows in bounded batches and return the number persisted. */
export async function writeTrialBalanceChunks(
  rows: AsyncIterable<TrialBalanceRow>,
  write: (chunk: readonly TrialBalanceRow[]) => Promise<void>,
  chunkSize = 1_000,
): Promise<number> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 5_000) {
    throw new Error('Invalid trial-balance chunk size');
  }
  let chunk: TrialBalanceRow[] = [];
  let total = 0;
  for await (const row of rows) {
    chunk.push(row);
    if (chunk.length === chunkSize) {
      await write(chunk);
      total += chunk.length;
      chunk = [];
    }
  }
  if (chunk.length) {
    await write(chunk);
    total += chunk.length;
  }
  return total;
}
