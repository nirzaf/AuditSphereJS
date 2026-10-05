import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const ROW_COUNTS = Object.freeze([5_000, 25_000, 50_000]);

export const FSLI_BY_PREFIX = Object.freeze({
  '10': 'Cash and cash equivalents',
  '11': 'Trade receivables',
  '12': 'Inventory',
  '20': 'Trade payables',
  '30': 'Retained earnings',
  '40': 'Revenue',
});

const prefixes = Object.keys(FSLI_BY_PREFIX);
const encoder = new TextEncoder();

function accountCode(index) {
  const prefix = prefixes[index % prefixes.length];
  const sequence = String(Math.floor(index / prefixes.length)).padStart(6, '0');
  return `${prefix}${sequence}`;
}

function amount(cents) {
  const minor = BigInt(cents);
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function trialBalanceRows(count) {
  if (!ROW_COUNTS.includes(count)) throw new Error(`Unsupported fixture size: ${count}`);
  return Array.from({ length: count }, (_, index) => {
    const currentCents = (index % 2 === 0 ? 1 : -1) * (100 + (Math.floor(index / 2) % 997));
    const priorGroup = Math.floor(index / 4) % 997;
    const priorCents = index % 4 < 2 ? 0 : (index % 4 === 2 ? 1 : -1) * (100 + priorGroup);
    const indexLabel = String(index + 1).padStart(6, '0');
    const name = index % 211 === 0
      ? `Synthetic "review" account ${indexLabel}`
      : index % 101 === 0
        ? `Synthetic, quoted account ${indexLabel}`
        : `Synthetic account ${indexLabel}`;
    return { code: accountCode(index), name, current: amount(currentCents), prior: amount(priorCents) };
  });
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvForRows(rows) {
  return `code,name,current,prior\n${rows.map(row => [row.code, row.name, row.current, row.prior].map(csvCell).join(',')).join('\n')}\n`;
}

function xmlText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function inlineCell(reference, value) {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
}

function worksheetXml(rows) {
  const sheet = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`];
  const headings = ['code', 'name', 'current', 'prior'];
  sheet.push(`<row r="1">${headings.map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}1`, value)).join('')}</row>`);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const number = index + 2;
    sheet.push(`<row r="${number}">${inlineCell(`A${number}`, row.code)}${inlineCell(`B${number}`, row.name)}<c r="C${number}"><v>${row.current}</v></c><c r="D${number}"><v>${row.prior}</v></c></row>`);
  }
  sheet.push('</sheetData><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>');
  return sheet.join('');
}

const workbookParts = rows => [
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Trial Balance" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', worksheetXml(rows)],
];

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(parts) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [path, text] of parts) {
    const name = Buffer.from(path, 'utf8');
    const body = Buffer.from(text, 'utf8');
    const compressed = deflateRawSync(body, { level: 9 });
    const checksum = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

export function xlsxForRows(rows) {
  return zip(workbookParts(rows));
}

export function readZipLocalEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const expectedCrc = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const bodyStart = nameStart + nameLength + extraLength;
    const compressed = archive.subarray(bodyStart, bodyStart + compressedSize);
    const body = method === 8 ? inflateRawSync(compressed) : method === 0 ? Buffer.from(compressed) : null;
    if (!body) throw new Error(`Unsupported ZIP method ${method}`);
    if (body.length !== uncompressedSize || crc32(body) !== expectedCrc) throw new Error('Fixture ZIP entry integrity check failed');
    entries.set(archive.subarray(nameStart, nameStart + nameLength).toString('utf8'), body.toString('utf8'));
    offset = bodyStart + compressedSize;
  }
  if (entries.size === 0) throw new Error('Fixture is not a ZIP archive');
  return entries;
}

export function cents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error(`Fixture amount is not exact cents: ${value}`);
  const minor = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -minor : minor;
}

export function balanceTotals(rows) {
  return rows.reduce((total, row) => ({ current: total.current + cents(row.current), prior: total.prior + cents(row.prior) }), { current: 0n, prior: 0n });
}

export function assertBalanced(rows) {
  const totals = balanceTotals(rows);
  if (totals.current !== 0n || totals.prior !== 0n) throw new Error(`Trial balance is unbalanced (current ${totals.current} cents, prior ${totals.prior} cents)`);
  return totals;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function fixtureFiles() {
  const output = new Map();
  const datasets = [];
  for (const count of ROW_COUNTS) {
    const rows = trialBalanceRows(count);
    const csv = Buffer.from(csvForRows(rows), 'utf8');
    const xlsx = xlsxForRows(rows);
    const prefixCounts = Object.fromEntries(prefixes.map(prefix => [prefix, rows.filter(row => row.code.startsWith(prefix)).length]));
    const totals = rows.reduce((result, row) => {
      const current = cents(row.current);
      const prior = cents(row.prior);
      if (current >= 0n) result.currentDebits += current;
      else result.currentCredits -= current;
      if (prior >= 0n) result.priorDebits += prior;
      else result.priorCredits -= prior;
      return result;
    }, { currentDebits: 0n, currentCredits: 0n, priorDebits: 0n, priorCredits: 0n });
    const metadata = {
      rows: count,
      expectedCurrentNet: '0.00',
      expectedPriorNet: '0.00',
      expectedCurrentDebits: amount(totals.currentDebits),
      expectedCurrentCredits: amount(totals.currentCredits),
      expectedPriorDebits: amount(totals.priorDebits),
      expectedPriorCredits: amount(totals.priorCredits),
      negativeCurrentRows: rows.filter(row => row.current.startsWith('-')).length,
      negativePriorRows: rows.filter(row => row.prior.startsWith('-')).length,
      zeroPriorRows: rows.filter(row => cents(row.prior) === 0n).length,
      mappingOutcomes: Object.fromEntries(Object.entries(prefixCounts).map(([prefix, rowsForPrefix]) => [FSLI_BY_PREFIX[prefix], rowsForPrefix])),
    };
    for (const [extension, bytes] of [['csv', csv], ['xlsx', xlsx]]) {
      const filename = `balance-${count}.${extension}`;
      output.set(filename, bytes);
      datasets.push({ filename, bytes: bytes.length, sha256: sha256(bytes), ...metadata });
    }
  }
  const exceptions = new Map([
    ['duplicate-account.csv', 'code,name,current,prior\n10000000,Synthetic cash,12.00,0.00\n10000000,Synthetic cash duplicate,12.00,0.00\n'],
    ['malformed-row.csv', 'code,name,current,prior\n10000001,Synthetic receivable,not-money,0.00\n'],
    ['unbalanced.csv', 'code,name,current,prior\n10000002,Synthetic unbalanced asset,125.00,0.00\n'],
  ]);
  const exceptionalFiles = [];
  for (const [filename, text] of exceptions) {
    const bytes = Buffer.from(text, 'utf8');
    output.set(filename, bytes);
    exceptionalFiles.push({ filename, bytes: bytes.length, sha256: sha256(bytes), expectedDisposition: filename === 'unbalanced.csv' ? 'fixture-oracle-reject' : 'csv-parser-reject' });
  }
  const manifest = {
    fixtureVersion: 1,
    generator: 'AuditSphere deterministic Trial Balance fixture generator v1',
    algorithm: 'counted alternating integer-cent balances; prior zero for first half and paired nonzero values for the rest; prefix-coded FSLI classes',
    datasets,
    exceptionalFiles,
    mapping: FSLI_BY_PREFIX,
    crossClientLookalike: {
      accountCode: '10000000',
      clients: ['Synthetic Fixture Client A', 'Synthetic Fixture Client B'],
      expected: 'The identical account code may occur in separate client engagements; no mapping or row data crosses scope.',
    },
  };
  output.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  return output;
}
