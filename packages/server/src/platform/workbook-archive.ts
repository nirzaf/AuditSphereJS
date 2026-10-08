import { inflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
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

/** Raised for any container-level rejection. The fieldwork reader converts it into a file-level validation error. */
export class WorkbookArchiveRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbookArchiveRejectedError';
  }
}
const invalid = (message: string) => new WorkbookArchiveRejectedError(message);
const unsupported = (message: string) => new WorkbookArchiveRejectedError(message);
const limit = (message: string) => new WorkbookArchiveRejectedError(message);

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
export function inspectWorkbookArchive(bytes: Buffer): void {
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

/** Read a stored workbook (already capped by the upload size limit) and run the container preflight on it. */
export async function preflightWorkbookFile(path: string): Promise<void> {
  inspectWorkbookArchive(await readFile(path));
}
