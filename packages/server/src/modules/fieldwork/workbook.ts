import { inflateRawSync } from 'node:zlib';
import ExcelJS, { type Cell } from 'exceljs';
import {
  MAX_ROWS,
  parseTrialBalanceStream,
  rowFromRecord,
  RowErrorCollector,
  TrialBalanceValidationError,
  type TrialBalanceRow,
} from './parser.js';

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_ARCHIVE_ENTRIES = 512;
const MAX_COLUMNS = 16;
/** Total decompressed bytes accepted from one workbook, checked against real inflation output. */
export const MAX_WORKBOOK_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const EXPECTED_COLUMNS = ['code', 'name', 'current', 'prior'] as const;
type ExpectedColumn = (typeof EXPECTED_COLUMNS)[number];

type ArchiveEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

const invalid = (message: string) => new TrialBalanceValidationError(message);
const unsupported = (message: string) => new TrialBalanceValidationError(message);
const limit = (message: string) => new TrialBalanceValidationError(message);

function readEntries(bytes: Buffer): ArchiveEntry[] {
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 0xffff); index -= 1) {
    if (bytes.readUInt32LE(index) === ZIP_END_SIGNATURE) {
      end = index;
      break;
    }
  }
  if (end < 0) throw invalid('Workbook is not a valid spreadsheet archive');
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw unsupported('Multi-part workbooks are not supported');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw unsupported('ZIP64 workbooks are not supported');
  if (count > MAX_ARCHIVE_ENTRIES) throw limit(`Workbook contains more than ${MAX_ARCHIVE_ENTRIES} parts`);
  if (directoryOffset + directorySize > end) throw invalid('Workbook archive directory is corrupt');

  const entries: ArchiveEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) throw invalid('Workbook archive directory is corrupt');
    const nameEnd = cursor + 46 + bytes.readUInt16LE(cursor + 28);
    if (nameEnd > end) throw invalid('Workbook archive directory is corrupt');
    entries.push({
      name: bytes.toString('utf8', cursor + 46, nameEnd),
      flags: bytes.readUInt16LE(cursor + 8),
      method: bytes.readUInt16LE(cursor + 10),
      compressedSize: bytes.readUInt32LE(cursor + 20),
      uncompressedSize: bytes.readUInt32LE(cursor + 24),
      localOffset: bytes.readUInt32LE(cursor + 42),
    });
    cursor = nameEnd + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  return entries;
}

/**
 * Reject hostile containers before ExcelJS decompresses anything. Declared sizes are not trusted:
 * every compressed entry is inflated here under a shared output cap, and its real size must match
 * the directory. Only then is the workbook handed to the spreadsheet reader.
 */
function inspectWorkbookArchive(bytes: Buffer): void {
  const entries = readEntries(bytes);
  const names = new Set<string>();
  let total = 0;
  let contentTypes: string | undefined;
  for (const entry of entries) {
    if (entry.flags & 0x0001 || entry.flags & 0x0040) throw unsupported('Encrypted workbooks are not supported');
    if (entry.method !== 0 && entry.method !== 8) throw unsupported('Workbook uses an unsupported compression method');
    if (entry.name.includes('\\') || entry.name.startsWith('/') || /^[a-zA-Z]:/.test(entry.name) || entry.name.split('/').includes('..')) {
      throw invalid('Workbook contains an unsafe part name');
    }
    if (names.has(entry.name)) throw invalid('Workbook contains duplicate part names');
    names.add(entry.name);
    if (/vbaProject\.bin$/i.test(entry.name)) throw unsupported('Macro-enabled workbooks are not supported');
    if (entry.uncompressedSize > MAX_WORKBOOK_UNCOMPRESSED_BYTES) throw limit('Workbook expands beyond the accepted size');

    if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw invalid('Workbook archive local header is corrupt');
    }
    const dataStart = entry.localOffset + 30 + bytes.readUInt16LE(entry.localOffset + 26) + bytes.readUInt16LE(entry.localOffset + 28);
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.length) throw invalid('Workbook archive part data is truncated');
    const data = bytes.subarray(dataStart, dataEnd);
    const remaining = MAX_WORKBOOK_UNCOMPRESSED_BYTES - total;
    let actual: Buffer;
    if (entry.method === 0) {
      actual = data;
      if (actual.length > remaining) throw limit('Workbook expands beyond the accepted size');
    } else {
      try {
        actual = inflateRawSync(data, { maxOutputLength: Math.max(1, remaining) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw limit('Workbook expands beyond the accepted size');
        throw invalid('Workbook part is corrupt');
      }
    }
    if (actual.length !== entry.uncompressedSize) throw invalid('Workbook directory does not match its content');
    total += actual.length;
    if (entry.name === '[Content_Types].xml') contentTypes = actual.toString('utf8');
  }
  if (!names.has('xl/workbook.xml')) throw invalid('Workbook is missing its workbook part');
  if (contentTypes && /macroEnabled/i.test(contentTypes)) throw unsupported('Macro-enabled workbooks are not supported');
}

/** Formula cells are never evaluated or trusted. Their cached results are rejected until the cached-formula policy is approved. */
function cellText(cell: Cell, line: number): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (cell.type === ExcelJS.ValueType.Formula) throw new Error(`Formula cells are not supported at source line ${line}`);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric cell at source line ${line}`);
    return String(value);
  }
  if (value instanceof Date) throw new Error(`Date cells are not supported at source line ${line}`);
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text).join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
  throw new Error(`Unsupported cell value at source line ${line}`);
}

/**
 * Parse the single Trial Balance worksheet of an .xlsx workbook. Header names and validation match
 * the CSV path exactly, so both formats produce identical normalized rows. `sourceLine` is the
 * 1-based worksheet row number, which is the row a reviewer sees in the file.
 */
export async function* parseTrialBalanceWorkbook(bytes: Buffer): AsyncGenerator<TrialBalanceRow> {
  inspectWorkbookArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS declares its Buffer against the @types/node 14 it bundles; the runtime value is the same bytes.
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw invalid('Workbook could not be read as a spreadsheet');
  }
  if (workbook.worksheets.length !== 1) throw invalid('Workbook must contain exactly one worksheet');
  const sheet = workbook.worksheets[0];
  // ExcelJS computes these sizes by scanning the sheet on every read, so read each once.
  const columnCount = sheet.columnCount;
  const rowCount = sheet.rowCount;
  if (columnCount > MAX_COLUMNS) throw invalid(`Workbook must not use more than ${MAX_COLUMNS} columns`);
  if (rowCount > MAX_ROWS + 1) throw invalid('Import must contain 1-50,000 rows');

  const headerRow = sheet.getRow(1);
  const columnFor = new Map<ExpectedColumn, number>();
  for (let column = 1; column <= columnCount; column += 1) {
    let heading: string;
    try {
      heading = cellText(headerRow.getCell(column), 1).trim().toLowerCase();
    } catch {
      throw invalid('Workbook headers must contain exactly code, name, current, prior');
    }
    if (!heading) continue;
    const expected = EXPECTED_COLUMNS.find(name => name === heading);
    if (!expected || columnFor.has(expected)) throw invalid('Workbook headers must contain exactly code, name, current, prior');
    columnFor.set(expected, column);
  }
  if (columnFor.size !== EXPECTED_COLUMNS.length) throw invalid('Workbook headers must contain exactly code, name, current, prior');

  const seenCodes = new Set<string>();
  const errors = new RowErrorCollector();
  let count = 0;
  for (let line = 2; line <= rowCount; line += 1) {
    const row = sheet.getRow(line);
    try {
      const record = { code: '', name: '', current: '', prior: '' };
      for (const name of EXPECTED_COLUMNS) {
        const column = columnFor.get(name);
        record[name] = column === undefined ? '' : cellText(row.getCell(column), line);
      }
      for (let column = 1; column <= columnCount; column += 1) {
        if (!Array.from(columnFor.values()).includes(column) && cellText(row.getCell(column), line).trim() !== '') {
          throw new Error(`Unexpected value in column ${column} at source line ${line}`);
        }
      }
      if (EXPECTED_COLUMNS.every(name => record[name].trim() === '')) continue;
      if (count >= MAX_ROWS) throw invalid('Import must contain 1-50,000 rows');
      // Same record rules as the CSV path, so the two formats cannot disagree on any value.
      const parsed = rowFromRecord(record, count, line, seenCodes);
      count += 1;
      yield parsed;
    } catch (error) {
      if (error instanceof TrialBalanceValidationError) throw error;
      errors.add(line, error);
    }
  }
  errors.finish();
  if (!count) throw invalid('Import must contain 1-50,000 rows');
}

const isZip = (bytes: Buffer) => bytes.length >= 4 && bytes.readUInt32LE(0) === ZIP_LOCAL_SIGNATURE;
const isOle = (bytes: Buffer) => bytes.length >= OLE_SIGNATURE.length && bytes.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE);

/**
 * Format dispatch for a stored Trial Balance document: .xlsx packages are ZIP containers, anything
 * else is handled as UTF-8 CSV. Encrypted and legacy binary workbooks are rejected explicitly.
 */
export async function* parseTrialBalanceEvidence(content: string | Buffer | Uint8Array): AsyncGenerator<TrialBalanceRow> {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  if (isOle(bytes)) throw unsupported('Encrypted or legacy spreadsheet formats are not supported; save the file as .xlsx or .csv');
  if (isZip(bytes)) {
    yield* parseTrialBalanceWorkbook(bytes);
    return;
  }
  yield* parseTrialBalanceStream(bytes);
}
