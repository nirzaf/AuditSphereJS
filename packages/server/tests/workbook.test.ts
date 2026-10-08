import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseTrialBalance, TrialBalanceValidationError, type TrialBalanceRow } from '../src/modules/fieldwork/parser.js';
import { MAX_WORKBOOK_UNCOMPRESSED_BYTES, parseTrialBalanceEvidence, parseTrialBalanceWorkbook } from '../src/modules/fieldwork/workbook.js';

const fixtures = resolve('fixtures/trial-balance/generated');

async function collect(source: AsyncIterable<TrialBalanceRow>): Promise<TrialBalanceRow[]> {
  const rows: TrialBalanceRow[] = [];
  for await (const row of source) rows.push(row);
  return rows;
}

/** Canonical six-place decimal text, so "1", "1.0" and "1.000000" compare as the same balance. */
const canonical = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(6, '0')}`;
};

/** A minimal ZIP writer for building hostile containers. CRC fields are zero: the reader must reject these before trusting them. */
function buildZip(entries: Array<{ name: string; data: Buffer; method?: 0 | 8; flags?: number; declaredUncompressed?: number }>): Buffer {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 0;
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.declaredUncompressed ?? entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBuffer, end]);
}

const workbookPart = Buffer.from('<workbook/>');
const contentTypes = Buffer.from('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');

/** Build a real workbook with the spreadsheet writer, so the reader is tested against an independent producer. */
async function workbookWith(build: (book: ExcelJS.Workbook) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  build(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Trial Balance workbook import (T045)', () => {
  it('AC1: the golden workbook normalizes to the same rows, in the same source lines, as its CSV twin', { timeout: 60_000 }, async () => {
    const csv = readFileSync(resolve(fixtures, 'balance-5000.csv'));
    const xlsx = readFileSync(resolve(fixtures, 'balance-5000.xlsx'));
    const fromCsv = await collect(parseTrialBalanceEvidence(csv));
    const fromWorkbook = await collect(parseTrialBalanceEvidence(xlsx));
    expect(fromWorkbook).toHaveLength(5_000);
    expect(fromWorkbook.map(row => row.code)).toEqual(fromCsv.map(row => row.code));
    expect(fromWorkbook.map(row => row.name)).toEqual(fromCsv.map(row => row.name));
    expect(fromWorkbook.map(row => row.sourceLine)).toEqual(fromCsv.map(row => row.sourceLine));
    expect(fromWorkbook.map(row => canonical(row.current))).toEqual(fromCsv.map(row => canonical(row.current)));
    expect(fromWorkbook.map(row => canonical(row.prior))).toEqual(fromCsv.map(row => canonical(row.prior)));
    expect(fromWorkbook[0]).toMatchObject({ sourceLine: 2, code: '10000000' });
    expect(fromWorkbook[0].rawValues.code).toBe('10000000');
  });

  it('keeps the CSV path for text input and matches the synchronous CSV parser', async () => {
    const csv = 'code,name,current,prior\n0012,"Cash, bank",10.00,-0.25\n';
    await expect(collect(parseTrialBalanceEvidence(csv))).resolves.toEqual(parseTrialBalance(csv));
  });

  it('rejects an encrypted or legacy binary container before reading it', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(collect(parseTrialBalanceEvidence(ole))).rejects.toThrow('Encrypted or legacy spreadsheet formats are not supported');
  });

  it('rejects bytes that only claim to be a ZIP archive', async () => {
    const garbage = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0xab)]);
    await expect(collect(parseTrialBalanceWorkbook(garbage))).rejects.toThrow('not a valid spreadsheet archive');
  });

  it('rejects encrypted parts, macro-enabled content and unsafe part names from the directory alone', async () => {
    const encrypted = buildZip([{ name: 'xl/workbook.xml', data: workbookPart, flags: 0x0001 }]);
    await expect(collect(parseTrialBalanceWorkbook(encrypted))).rejects.toThrow('Encrypted workbooks are not supported');

    const macro = buildZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: 'xl/workbook.xml', data: workbookPart },
      { name: 'xl/vbaProject.bin', data: Buffer.from('macro') },
    ]);
    await expect(collect(parseTrialBalanceWorkbook(macro))).rejects.toThrow('Macro-enabled workbooks are not supported');

    const macroContentType = buildZip([
      { name: '[Content_Types].xml', data: Buffer.from('<Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>') },
      { name: 'xl/workbook.xml', data: workbookPart },
    ]);
    await expect(collect(parseTrialBalanceWorkbook(macroContentType))).rejects.toThrow('Macro-enabled workbooks are not supported');

    const traversal = buildZip([{ name: '../xl/workbook.xml', data: workbookPart }]);
    await expect(collect(parseTrialBalanceWorkbook(traversal))).rejects.toThrow('unsafe part name');
  });

  it('AC2: fails safely when a part expands beyond the accepted size, however small its compressed form', async () => {
    const bomb = buildZip([
      { name: 'xl/workbook.xml', data: workbookPart },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(MAX_WORKBOOK_UNCOMPRESSED_BYTES + 1, 0), method: 8 },
    ]);
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const failure = await collect(parseTrialBalanceWorkbook(bomb)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TrialBalanceValidationError);
    expect((failure as Error).message).toBe('Workbook expands beyond the accepted size');
  });

  it('AC2: caps real inflation even when the directory under-declares the expanded size', async () => {
    const underDeclared = buildZip([
      { name: 'xl/workbook.xml', data: workbookPart },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(MAX_WORKBOOK_UNCOMPRESSED_BYTES + 1, 0), method: 8, declaredUncompressed: 1_024 },
    ]);
    const failure = await collect(parseTrialBalanceWorkbook(underDeclared)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TrialBalanceValidationError);
    expect((failure as Error).message).toBe('Workbook expands beyond the accepted size');
  });

  it('AC2: rejects a directory whose declared sizes disagree with the real content', async () => {
    const lying = buildZip([
      { name: 'xl/workbook.xml', data: workbookPart },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(1_024, 0x41), method: 8, declaredUncompressed: 10 },
    ]);
    await expect(collect(parseTrialBalanceWorkbook(lying))).rejects.toThrow('Workbook directory does not match its content');
  });

  it('rejects a corrupt workbook part, a missing workbook part and a truncated archive', async () => {
    const corrupt = buildZip([{ name: 'xl/workbook.xml', data: Buffer.from('not deflate data'), method: 8 }]);
    // Overwrite the stored bytes so they are not a valid raw DEFLATE stream.
    const corruptBytes = Buffer.from(corrupt);
    corruptBytes.fill(0xff, 30 + 'xl/workbook.xml'.length, 30 + 'xl/workbook.xml'.length + 8);
    await expect(collect(parseTrialBalanceWorkbook(corruptBytes))).rejects.toThrow(/corrupt|does not match/);

    await expect(collect(parseTrialBalanceWorkbook(buildZip([{ name: 'xl/other.xml', data: workbookPart }]))))
      .rejects.toThrow('missing its workbook part');

    const truncated = readFileSync(resolve(fixtures, 'balance-5000.xlsx')).subarray(0, 4096);
    await expect(collect(parseTrialBalanceWorkbook(truncated))).rejects.toThrow('not a valid spreadsheet archive');
  });

  it('rejects formula cells rather than trusting or executing them, with the source line', async () => {
    const formulaWorkbook = await workbookWith(book => {
      const sheet = book.addWorksheet('Trial Balance');
      sheet.addRow(['code', 'name', 'current', 'prior']);
      sheet.addRow(['100', 'Cash', { formula: '1+1', result: 2 }, 0]);
      sheet.addRow(['200', 'Equity', -2, 0]);
    });
    const failure = await collect(parseTrialBalanceWorkbook(formulaWorkbook)).catch((error: unknown) => error) as TrialBalanceValidationError;
    expect(failure).toBeInstanceOf(TrialBalanceValidationError);
    expect(failure.rowErrors).toEqual([{ sourceLine: 2, message: 'Formula cells are not supported at source line 2' }]);
  });

  it('keeps the same validation rules as the CSV path and reports every defect with its worksheet row', async () => {
    const book = await workbookWith(workbook => {
      const sheet = workbook.addWorksheet('Trial Balance');
      sheet.addRow(['code', 'name', 'current', 'prior']);
      sheet.addRow(['100', 'Cash', 1, 0]);
      sheet.addRow(['100', 'Duplicate', 1, 0]);
      sheet.addRow(['200', 'Blank row skipped below', 'NaN', 0]);
      sheet.addRow([]);
      sheet.addRow(['300', 'Prior', 1, 'abc']);
    });
    const failure = await collect(parseTrialBalanceWorkbook(book)).catch((error: unknown) => error) as TrialBalanceValidationError;
    expect(failure.rowErrors).toEqual([
      { sourceLine: 3, message: 'Invalid or duplicate account at source line 3' },
      { sourceLine: 4, message: 'Invalid current balance at source line 4' },
      { sourceLine: 6, message: 'Invalid prior balance at source line 6' },
    ]);
  });

  it('requires exactly one worksheet and the exact Trial Balance headers', async () => {
    const twoSheets = await workbookWith(book => {
      book.addWorksheet('Trial Balance').addRow(['code', 'name', 'current', 'prior']);
      book.addWorksheet('Notes').addRow(['x']);
    });
    await expect(collect(parseTrialBalanceWorkbook(twoSheets))).rejects.toThrow('exactly one worksheet');

    const badHeaders = await workbookWith(book => {
      book.addWorksheet('Trial Balance').addRow(['code', 'name', 'current', 'extra']);
    });
    await expect(collect(parseTrialBalanceWorkbook(badHeaders))).rejects.toThrow('Workbook headers must contain exactly code, name, current, prior');
  });

  it('rejects an unexpected value outside the four Trial Balance columns', async () => {
    const extra = await workbookWith(book => {
      const sheet = book.addWorksheet('Trial Balance');
      sheet.addRow(['code', 'name', 'current', 'prior']);
      sheet.addRow(['100', 'Cash', 1, 0, 'stray']);
    });
    const failure = await collect(parseTrialBalanceWorkbook(extra)).catch((error: unknown) => error) as TrialBalanceValidationError;
    expect(failure.rowErrors).toEqual([{ sourceLine: 2, message: 'Unexpected value in column 5 at source line 2' }]);
  });
});
