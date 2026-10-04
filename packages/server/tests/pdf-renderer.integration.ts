import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderAndPublishPdf, renderTrustedPdf, type TrustedPdfTemplate } from '../src/platform/pdf-renderer.js';

const makeTemplate = (id: string, html: string): TrustedPdfTemplate => ({
  id,
  version: 1,
  html,
  sha256: createHash('sha256').update(html).digest('hex'),
});

async function textFromPdf(bytes: Uint8Array): Promise<string> {
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const document = await loading.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    return pages.join('\n');
  } finally {
    await loading.destroy();
  }
}

test('approved quotation and multi-page report templates render with immutable provenance', async () => {
  const quoteTemplate = makeTemplate('quotation-v1', `<!doctype html><html><head><style>body{font-family:Arial,sans-serif}table{width:100%}</style></head><body><h1>Audit quotation</h1><p>Client: {{client}}</p><table><tr><td>Audit fee</td><td>{{fee}}</td></tr><tr><td>Payment terms</td><td>{{terms}}</td></tr></table></body></html>`);
  const quoteData = { client: '<Client & Associates>', fee: 'SAR 12,000.00', terms: '50% advance / 50% at release' };
  const quotation = await renderTrustedPdf({ template: quoteTemplate, data: quoteData });
  const quotationText = await textFromPdf(quotation.bytes);
  assert.match(quotation.bytes.subarray(0, 4).toString('ascii'), /^%PDF$/);
  assert.equal(quotation.pageCount, 1);
  assert.match(quotationText, /Client:/);
  assert.match(quotationText, /<Client & Associates>/, 'HTML metacharacters are rendered as literal text rather than active markup');
  assert.match(quotationText, /50% advance \/ 50% at release/);
  assert.equal(quotation.provenance.templateSha256, quoteTemplate.sha256);
  assert.equal(quotation.provenance.dataSha256, (await renderTrustedPdf({ template: quoteTemplate, data: { terms: quoteData.terms, fee: quoteData.fee, client: quoteData.client } })).provenance.dataSha256, 'canonical snapshot hash is independent of object insertion order');

  const sections = Array.from({ length: 4 }, (_unused, index) => `<section style="break-after:page"><h1>Report section ${index + 1}</h1><p>Audited statements and management commentary ${index + 1}</p></section>`).join('');
  const report = await renderTrustedPdf({ template: makeTemplate('auditor-report-fixture-v1', `<!doctype html><html><head><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif}section{min-height:250mm}</style></head><body>${sections}<h2>Final conclusion</h2></body></html>`), data: {} });
  const reportText = await textFromPdf(report.bytes);
  assert.ok(report.pageCount >= 4, `expected at least four pages, got ${report.pageCount}`);
  assert.match(reportText, /Report section 1/);
  assert.match(reportText, /Report section 4/);
  assert.match(reportText, /Final conclusion/);
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.sizeBytes, report.bytes.byteLength);
  assert.ok(report.provenance.chromiumVersion.length > 0);
});

test('injected metadata-service URLs are blocked before any request reaches the service', async () => {
  let hits = 0;
  const metadata = createServer((_request, response) => { hits++; response.end('should never be reached'); });
  await new Promise<void>(resolve => metadata.listen(0, '127.0.0.1', resolve));
  const address = metadata.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/metadata`;
  try {
    const artifact = await renderTrustedPdf({
      template: makeTemplate('resource-denial-fixture-v1', `<!doctype html><html><body><h1>Resource test</h1><img src="${url}" alt="metadata probe"></body></html>`),
      data: {},
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(artifact.blockedResourceCount >= 1, 'the browser resource route must deny the injected URL');
    assert.equal(hits, 0, 'the internal metadata listener must receive no connection');
    assert.match(await textFromPdf(artifact.bytes), /Resource test/);
  } finally {
    await new Promise<void>((resolve, reject) => metadata.close(error => error ? reject(error) : resolve()));
  }
});

test('a failed render cannot publish or mark a document version ready', async () => {
  let published = false;
  const template = makeTemplate('invalid-fixture-v1', '<html><body>{{missing}}</body></html>');
  await assert.rejects(renderAndPublishPdf({ template, data: {} }, async () => { published = true; }), /missing data/);
  assert.equal(published, false);
});
