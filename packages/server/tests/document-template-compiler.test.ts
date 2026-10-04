import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { documentTemplateBlockSchema } from '@auditsphere/contracts';
import { compileDocumentTemplatePreview, documentTemplateDigest, templatePreviewHtml } from '../src/platform/document-template-compiler.js';

describe('versioned document template compiler', () => {
  it('hashes canonical template content independent of object key order', () => {
    const first = { blocks: [{ id: 'title', kind: 'TITLE' as const, text: '{{clientLegalName}}' }], allowedVariables: ['clientLegalName'] };
    const second = { allowedVariables: ['clientLegalName'], blocks: [{ text: '{{clientLegalName}}', kind: 'TITLE' as const, id: 'title' }] };
    expect(documentTemplateDigest(first)).toBe(documentTemplateDigest(second));
  });

  it('requires every referenced variable and reports missing keys clearly', () => {
    expect(() => compileDocumentTemplatePreview({
      blocks: [{ id: 'title', kind: 'TITLE', text: 'Audit of {{clientLegalName}} for {{statutoryPeriod}}' }],
      allowedVariables: ['clientLegalName', 'statutoryPeriod'], data: { clientLegalName: 'Northwind WLL' }, assets: new Map(),
    })).toThrow(/statutoryPeriod/);
  });

  it('rejects undeclared, unknown, and malformed placeholders before preview', () => {
    const input = { allowedVariables: ['clientLegalName'], data: { clientLegalName: 'Northwind WLL' }, assets: new Map() };
    expect(() => compileDocumentTemplatePreview({ ...input, blocks: [{ id: 'title', kind: 'TITLE', text: '{{clientLegalName}} {{rawHtml}}' }] })).toThrow(/not allowed/);
    expect(() => compileDocumentTemplatePreview({ ...input, blocks: [{ id: 'title', kind: 'TITLE', text: '{{clientLegalName' }] })).toThrow(/malformed/);
    expect(() => compileDocumentTemplatePreview({ ...input, data: { ...input.data, script: 'bad' }, blocks: [{ id: 'title', kind: 'TITLE', text: '{{clientLegalName}}' }] })).toThrow(/not allowed/);
  });

  it('interpolates as text and escapes data when building the constrained PDF preview', () => {
    const blocks = compileDocumentTemplatePreview({
      blocks: [{ id: 'title', kind: 'TITLE', text: '{{clientLegalName}}' }, { id: 'paragraph', kind: 'PARAGRAPH', text: 'Period {{statutoryPeriod}}' }],
      allowedVariables: ['clientLegalName', 'statutoryPeriod'],
      data: { clientLegalName: '<script>alert(1)</script>', statutoryPeriod: 'FY 2026' }, assets: new Map(),
    });
    const html = templatePreviewHtml(blocks);
    expect(html).toBe(readFileSync(new URL('./fixtures/document-template-preview.html', import.meta.url), 'utf8').trimEnd());
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Period FY 2026');
  });

  it('requires exact approved asset metadata and keeps asset bytes out of the preview contract', () => {
    const blocks = [{ id: 'signature', kind: 'PARTNER_SIGNATURE' as const, signatureAssetVersionId: '11111111-1111-4111-8111-111111111111', sealAssetVersionId: null }];
    expect(() => compileDocumentTemplatePreview({ blocks, allowedVariables: [], data: {}, assets: new Map() })).toThrow(/not currently approved/);
    const preview = compileDocumentTemplatePreview({
      blocks, allowedVariables: [], data: {},
      assets: new Map([[blocks[0]!.signatureAssetVersionId, { name: 'Partner signature', category: 'PARTNER_SIGNATURE', sequence: 3 }]]),
    });
    expect(preview).toEqual([{ id: 'signature', kind: 'PARTNER_SIGNATURE', signatureLabel: 'Partner signature · version 3', sealLabel: undefined }]);
    expect(JSON.stringify(preview)).not.toContain('base64');
  });

  it('rejects HTML as a template block rather than accepting executable markup', () => {
    expect(documentTemplateBlockSchema.safeParse({ id: 'body', kind: 'PARAGRAPH', text: '<script>alert(1)</script>' }).success).toBe(false);
  });
});
