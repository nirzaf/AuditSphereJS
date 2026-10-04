import assert from 'node:assert/strict';
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

  it('fails closed on malformed PDFs', async () => {
    await assert.rejects(inspect(Buffer.from('%PDF-1.7\nnot a PDF')), PdfPolicyRejectedError);
  });
});
