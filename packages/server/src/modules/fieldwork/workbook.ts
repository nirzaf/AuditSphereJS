import ExcelJS, { type Cell } from 'exceljs';
import { inspectWorkbookArchive, MAX_WORKBOOK_UNCOMPRESSED_BYTES, WorkbookArchiveRejectedError } from '../../platform/workbook-archive.js';
import {
  MAX_ROWS,
  parseTrialBalanceStream,
  rowFromRecord,
  RowErrorCollector,
  TrialBalanceValidationError,
  type TrialBalanceRow,
} from './parser.js';

export { MAX_WORKBOOK_UNCOMPRESSED_BYTES };

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_COLUMNS = 16;
const EXPECTED_COLUMNS = ['code', 'name', 'current', 'prior'] as const;
type ExpectedColumn = (typeof EXPECTED_COLUMNS)[number];
const invalid = (message: string) => new TrialBalanceValidationError(message);
const unsupported = (message: string) => new TrialBalanceValidationError(message);

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
  try {
    inspectWorkbookArchive(bytes);
  } catch (error) {
    if (error instanceof WorkbookArchiveRejectedError) throw invalid(error.message);
    throw error;
  }
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
