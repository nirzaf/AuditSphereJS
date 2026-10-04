import { createHash } from 'node:crypto';
import { chromium, type Browser } from 'playwright';

const MAX_TEMPLATE_BYTES = 2_000_000;
const MAX_PDF_BYTES = 20_000_000;
const MAX_PDF_PAGES = 100;
const RENDER_TIMEOUT_MS = 15_000;

export type TrustedPdfTemplate = {
  id: string;
  version: number;
  html: string;
  sha256: string;
};

export type PdfDataSnapshot = Readonly<Record<string, string | number | boolean | null>>;

export type PdfArtifact = {
  bytes: Buffer;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  provenance: {
    renderer: 'playwright-chromium';
    playwrightVersion: string;
    chromiumVersion: string;
    templateId: string;
    templateVersion: number;
    templateSha256: string;
    dataSha256: string;
  };
  blockedResourceCount: number;
};

export class PdfRenderError extends Error {
  constructor(message = 'The document could not be rendered safely.') {
    super(message);
    this.name = 'PdfRenderError';
  }
}

const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new PdfRenderError('The document data snapshot must contain only JSON values.');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderEscapedTemplate(template: string, data: PdfDataSnapshot): string {
  const html = template.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(data, key)) throw new PdfRenderError('The document template requires missing data.');
    const value = data[key];
    return escapeHtml(value === null ? '' : String(value));
  });
  if (/\{\{|\}\}/.test(html)) throw new PdfRenderError('The document template has an unsupported placeholder.');
  if (/\bjavascript\s*:|\bfile\s*:/i.test(html)) throw new PdfRenderError('The document template contains a prohibited local or executable URL.');
  if (/<\s*(script|iframe|frame|object|embed)\b/i.test(html)) throw new PdfRenderError('Active document elements are not permitted in PDF templates.');
  return html;
}

async function pageCount(bytes: Buffer): Promise<number> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const document = await loading.promise;
    const count = document.numPages;
    await loading.destroy();
    if (!Number.isInteger(count) || count < 1 || count > MAX_PDF_PAGES) throw new PdfRenderError('The document exceeds the permitted page count.');
    return count;
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError('The rendered document is invalid or could not be inspected.');
  }
}

async function closeQuietly(browser: Browser | undefined): Promise<void> {
  if (browser) await browser.close().catch(() => undefined);
}

/**
 * Render one immutable template/data snapshot in the dedicated worker process.
 * Scripts are disabled, every browser resource request is aborted, and only escaped
 * scalar data can enter the version-identified template.
 */
export async function renderTrustedPdf(input: {
  template: TrustedPdfTemplate;
  data: PdfDataSnapshot;
}): Promise<PdfArtifact> {
  const { template, data } = input;
  if (!template || typeof template !== 'object' || typeof template.id !== 'string' || typeof template.html !== 'string'
    || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PdfRenderError('The document template or data snapshot is invalid.');
  }
  const dataJson = canonicalJson(data);
  if (Buffer.byteLength(dataJson, 'utf8') > MAX_TEMPLATE_BYTES) throw new PdfRenderError('The document data snapshot exceeds its size limit.');
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(template.id)
    || !Number.isSafeInteger(template.version) || template.version < 1
    || Buffer.byteLength(template.html, 'utf8') > MAX_TEMPLATE_BYTES
    || !/^[a-f0-9]{64}$/.test(template.sha256)
    || digest(template.html) !== template.sha256) {
    throw new PdfRenderError('The document template identity is invalid.');
  }
  const html = renderEscapedTemplate(template.html, data);
  if (Buffer.byteLength(html, 'utf8') > MAX_TEMPLATE_BYTES * 2) throw new PdfRenderError('The rendered HTML exceeds its size limit.');
  const dataSha256 = digest(dataJson);
  let browser: Browser | undefined;
  let blockedResourceCount = 0;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      timeout: 5_000,
      args: ['--disable-dev-shm-usage', '--renderer-process-limit=1'],
    });
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
      viewport: { width: 1240, height: 1754 },
      deviceScaleFactor: 1,
    });
    await context.route('**/*', async route => {
      blockedResourceCount++;
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    let pageError = false;
    page.on('pageerror', () => { pageError = true; });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS });
    const bytes = await Promise.race([
      page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: false, tagged: true }),
      new Promise<never>((_resolve, reject) => { renderTimer = setTimeout(() => reject(new PdfRenderError('Document rendering exceeded its time limit.')), RENDER_TIMEOUT_MS); }),
    ]);
    if (pageError) throw new PdfRenderError();
    const output = Buffer.from(bytes);
    if (output.byteLength < 8 || output.byteLength > MAX_PDF_BYTES || output.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new PdfRenderError('The rendered document exceeds its size limit or is invalid.');
    }
    const count = await pageCount(output);
    return {
      bytes: output,
      sha256: digest(output),
      sizeBytes: output.byteLength,
      pageCount: count,
      provenance: {
        renderer: 'playwright-chromium',
        playwrightVersion: '1.58.2',
        chromiumVersion: browser.version(),
        templateId: template.id,
        templateVersion: template.version,
        templateSha256: template.sha256,
        dataSha256,
      },
      blockedResourceCount,
    };
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError();
  } finally {
    if (renderTimer) clearTimeout(renderTimer);
    await closeQuietly(browser);
  }
}

/** Call the document-version writer only after a complete, inspected PDF exists. */
export async function renderAndPublishPdf<T>(
  input: { template: TrustedPdfTemplate; data: PdfDataSnapshot },
  publishImmutableVersion: (artifact: PdfArtifact) => Promise<T>,
): Promise<T> {
  const artifact = await renderTrustedPdf(input);
  return publishImmutableVersion(artifact);
}
