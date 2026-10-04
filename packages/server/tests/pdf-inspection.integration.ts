import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { inspectPdfFile, PdfPolicyRejectedError } from '../dist/platform/pdf-inspection.js';

const directories: string[] = [];

function pdf(catalogEntries = '', trailerEntries = '', encryption = false, pageEntries = '', content = '') {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${catalogEntries} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R ${pageEntries} >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  if (pageEntries) objects.push('<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://example.test) >> >>');
  if (encryption) objects.push('<< /Filter /Standard /V 1 /R 2 /O <0000000000000000000000000000000000000000000000000000000000000000> /U <0000000000000000000000000000000000000000000000000000000000000000> /P -4 >>');
  const parts = ['%PDF-1.7\n'];
  const offsets = [0];
  let length = Buffer.byteLength(parts[0]);
  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const object = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    parts.push(object);
    length += Buffer.byteLength(object);
  }
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const offset of offsets.slice(1)) xref.push(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${encryption ? '/Encrypt 5 0 R' : ''} ${trailerEntries} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(...xref, trailer);
  return Buffer.from(parts.join(''), 'ascii');
}

function compressedCatalogPdf(catalogEntries = '') {
  const catalog = `<< /Type /Catalog /Pages 2 0 R ${catalogEntries} >>`;
  const objectStreamHeader = '1 0 ';
  const compressedObjects = deflateSync(Buffer.from(`${objectStreamHeader}${catalog}`, 'ascii'));
  const pageContent = Buffer.from('q Q', 'ascii');
  const prefix = ['%PDF-1.5\n'];
  const offsets = new Map<number, number>();
  let length = Buffer.byteLength(prefix[0]);
  const appendObject = (number: number, body: Buffer | string) => {
    offsets.set(number, length);
    const start = Buffer.from(`${number} 0 obj\n`, 'ascii');
    const end = Buffer.from('\nendobj\n', 'ascii');
    const contents = typeof body === 'string' ? Buffer.from(body, 'ascii') : body;
    prefix.push(start.toString('binary'), contents.toString('binary'), end.toString('binary'));
    length += start.length + contents.length + end.length;
  };

  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  appendObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>');
  appendObject(4, Buffer.concat([
    Buffer.from(`<< /Length ${pageContent.length} >>\nstream\n`, 'ascii'),
    pageContent,
    Buffer.from('\nendstream', 'ascii'),
  ]));
  const objectStream = Buffer.concat([
    Buffer.from(`<< /Type /ObjStm /N 1 /First ${Buffer.byteLength(objectStreamHeader)} /Length ${compressedObjects.length} /Filter /FlateDecode >>\nstream\n`, 'ascii'),
    compressedObjects,
    Buffer.from('\nendstream', 'ascii'),
  ]);
  appendObject(5, objectStream);

  const xrefOffset = length;
  const xrefEntry = (type: number, field2: number, field3: number) => {
    const entry = Buffer.alloc(7);
    entry.writeUInt8(type, 0);
    entry.writeUInt32BE(field2, 1);
    entry.writeUInt16BE(field3, 5);
    return entry;
  };
  const xref = Buffer.concat([
    xrefEntry(0, 0, 0xffff),
    xrefEntry(2, 5, 0),
    ...[2, 3, 4, 5].map(number => xrefEntry(1, offsets.get(number)!, 0)),
    xrefEntry(1, xrefOffset, 0),
  ]);
  const xrefObject = Buffer.concat([
    Buffer.from(`6 0 obj\n<< /Type /XRef /Size 7 /Root 1 0 R /W [1 4 2] /Index [0 7] /Length ${xref.length} >>\nstream\n`, 'ascii'),
    xref,
    Buffer.from('\nendstream\nendobj\n', 'ascii'),
  ]);
  prefix.push(xrefObject.toString('binary'), `startxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(prefix.join(''), 'binary');
}

async function inspect(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-pdf-policy-'));
  directories.push(directory);
  const filePath = join(directory, 'fixture.pdf');
  await writeFile(filePath, bytes);
  return inspectPdfFile(filePath);
}

after(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('bounded PDF active-content inspection', () => {
  it('accepts a valid passive one-page PDF', async () => {
    await inspect(pdf());
  });

  it('ignores action-like names inside visible text, comments and hex strings', async () => {
    await inspect(pdf('', '', false, '', 'BT /F1 12 Tf (/JavaScript is a field label) Tj ET'));
    await inspect(pdf('% /OpenAction is only a comment\n'));
    await inspect(pdf('', '', false, '', 'BT <2f4a617661536372697074> Tj ET'));
  });

  it('rejects encrypted PDFs before accepting a password', async () => {
    await assert.rejects(inspect(pdf('', '', true)), PdfPolicyRejectedError);
  });

  it('rejects automatic JavaScript actions', async () => {
    await assert.rejects(inspect(pdf('/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>')), PdfPolicyRejectedError);
    await assert.rejects(inspect(pdf('/OpenAction << /S /Java#53cript /JS (app.alert\\(1\\)) >>')), PdfPolicyRejectedError);
  });

  it('rejects externally active URI open actions and annotations', async () => {
    await assert.rejects(inspect(pdf('/OpenAction << /S /URI /URI (https://example.test) >>')), PdfPolicyRejectedError);
    await assert.rejects(inspect(pdf('', '', false, '/Annots [5 0 R]')), PdfPolicyRejectedError);
  });

  it('rejects catalog JavaScript actions and embedded files', async () => {
    await assert.rejects(inspect(pdf('/Names << /JavaScript << /Names [(run) << /S /JavaScript /JS (app.alert\\(1\\)) >>] >> >>')), PdfPolicyRejectedError);
    await assert.rejects(inspect(pdf('/Names << /EmbeddedFiles << /Names [(payload) << /Type /Filespec /F (payload.txt) /EF << /F << /Type /EmbeddedFile /Length 0 >> >> >>] >> >>')), PdfPolicyRejectedError);
  });

  it('inspects compressed catalog objects without rejecting action-like visible text', async () => {
    await assert.rejects(
      inspect(compressedCatalogPdf('/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>')),
      PdfPolicyRejectedError,
    );
    await inspect(compressedCatalogPdf('/Lang (JavaScript)'));
  });

  it('fails closed on malformed PDFs', async () => {
    await assert.rejects(inspect(Buffer.from('%PDF-1.7\nnot a PDF')), PdfPolicyRejectedError);
  });
});
