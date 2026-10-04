import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { documentTemplateBlockSchema, documentTemplateVariableKeys } from '@auditsphere/contracts';
import type { z } from 'zod';

export type TemplateBlock = z.infer<typeof documentTemplateBlockSchema>;
export type TemplatePreviewBlock = {
  id: string;
  kind: TemplateBlock['kind'];
  text?: string;
  items?: string[];
  assetName?: string;
  assetCategory?: string;
  sequence?: number;
  signatureLabel?: string;
  sealLabel?: string;
};

const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  throw new BadRequestException('Template content must contain only JSON values.');
};

export function documentTemplateDigest(value: { blocks: readonly TemplateBlock[]; allowedVariables: readonly string[] }): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function interpolate(text: string, allowed: ReadonlySet<string>, data: Readonly<Record<string, string>>, missing: Set<string>): string {
  const rendered = text.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_match, key: string) => {
    if (!documentTemplateVariableKeys.includes(key as (typeof documentTemplateVariableKeys)[number]) || !allowed.has(key)) {
      throw new BadRequestException(`Template variable “${key}” is not allowed by this version.`);
    }
    const value = data[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.add(key);
      return '';
    }
    return value;
  });
  if (/\{\{|\}\}/.test(rendered)) throw new BadRequestException('Template contains an unsupported or malformed variable placeholder.');
  return rendered;
}

/** Resolve only the selected immutable version and its explicitly pinned assets before preview. */
export function compileDocumentTemplatePreview(input: {
  blocks: readonly TemplateBlock[];
  allowedVariables: readonly string[];
  data: Readonly<Record<string, string>>;
  assets: ReadonlyMap<string, { name: string; category: string; sequence: number }>;
}): TemplatePreviewBlock[] {
  const allowed = new Set(input.allowedVariables);
  const supplied = Object.keys(input.data);
  const unexpected = supplied.filter(key => !allowed.has(key));
  if (unexpected.length) throw new BadRequestException(`Template preview received variables not allowed by this version: ${unexpected.join(', ')}.`);
  const missing = new Set<string>();
  const blocks = input.blocks.map((block): TemplatePreviewBlock => {
    if (block.kind === 'APPROVED_ASSET') {
      const asset = input.assets.get(block.assetVersionId);
      if (!asset) throw new BadRequestException('This template version references an asset that is not currently approved.');
      return { id: block.id, kind: block.kind, text: block.caption, assetName: asset.name, assetCategory: asset.category, sequence: asset.sequence };
    }
    if (block.kind === 'PARTNER_SIGNATURE') {
      const signature = input.assets.get(block.signatureAssetVersionId);
      const seal = block.sealAssetVersionId ? input.assets.get(block.sealAssetVersionId) : undefined;
      if (!signature || (block.sealAssetVersionId && !seal)) throw new BadRequestException('This template version references an asset that is not currently approved.');
      return {
        id: block.id, kind: block.kind,
        signatureLabel: `${signature.name} · version ${signature.sequence}`,
        sealLabel: seal ? `${seal.name} · version ${seal.sequence}` : undefined,
      };
    }
    if (block.kind === 'BULLET_LIST') return { id: block.id, kind: block.kind, items: block.items.map(item => interpolate(item, allowed, input.data, missing)) };
    return { id: block.id, kind: block.kind, text: interpolate(block.text, allowed, input.data, missing) };
  });
  if (missing.size) throw new BadRequestException(`Complete the required template values: ${[...missing].sort().join(', ')}.`);
  return blocks;
}

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** HTML is constructed from fixed tags only; user-authored text and interpolated data are escaped. */
export function templatePreviewHtml(blocks: readonly TemplatePreviewBlock[]): string {
  const body = blocks.map(block => {
    if (block.kind === 'TITLE') return `<h1>${escapeHtml(block.text ?? '')}</h1>`;
    if (block.kind === 'HEADING') return `<h2>${escapeHtml(block.text ?? '')}</h2>`;
    if (block.kind === 'PARAGRAPH') return `<p>${escapeHtml(block.text ?? '')}</p>`;
    if (block.kind === 'BULLET_LIST') return `<ul>${(block.items ?? []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (block.kind === 'PARTNER_SIGNATURE') return `<p class="signature">Approved partner artwork: ${escapeHtml(block.signatureLabel ?? '')}${block.sealLabel ? ` · Firm seal: ${escapeHtml(block.sealLabel)}` : ''}</p>`;
    return `<p class="asset">${escapeHtml(block.text ?? '')} — ${escapeHtml(block.assetName ?? '')} (${escapeHtml(block.assetCategory ?? '')} v${block.sequence ?? ''})</p>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font:11pt Arial,sans-serif;color:#1e293b;line-height:1.55}h1{font-size:22pt}h2{font-size:15pt;margin-top:18pt}.signature,.asset{border-top:1px solid #94a3b8;padding-top:8pt;color:#475569}</style></head><body>${body}</body></html>`;
}
