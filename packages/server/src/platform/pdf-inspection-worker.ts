import { readFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { AnnotationType, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PDF_BYTES = 15_000_000;
const MAX_PAGES = 500;
const MAX_ANNOTATIONS = 10_000;
const ACTIVE_PDF_NAMES = new Set([
  'OpenAction', 'AA', 'JavaScript', 'JS', 'Launch', 'EmbeddedFiles', 'EmbeddedFile',
  'AcroForm', 'XFA', 'RichMedia', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE',
  'Movie', 'Sound', '3D',
]);
const PASSIVE_ANNOTATION_TYPES = new Set([
  AnnotationType.TEXT, AnnotationType.FREETEXT, AnnotationType.LINE, AnnotationType.SQUARE,
  AnnotationType.CIRCLE, AnnotationType.POLYGON, AnnotationType.POLYLINE, AnnotationType.HIGHLIGHT,
  AnnotationType.UNDERLINE, AnnotationType.SQUIGGLY, AnnotationType.STRIKEOUT, AnnotationType.STAMP,
  AnnotationType.CARET, AnnotationType.INK, AnnotationType.POPUP, AnnotationType.PRINTERMARK,
  AnnotationType.TRAPNET, AnnotationType.WATERMARK, AnnotationType.REDACT,
]);

function containsUnsafeAction(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value instanceof Map) return value.size > 0;
  if (Array.isArray(value)) return value.some(item => containsUnsafeAction(item, seen));
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if (record.url || record.unsafeUrl || record.action || (record.actions instanceof Map && record.actions.size > 0) || (record.actions && typeof record.actions === 'object' && Object.keys(record.actions).length > 0)) return true;
  return Object.values(record).some(item => containsUnsafeAction(item, seen));
}

function containsActivePdfName(bytes: Buffer): boolean {
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index];
    if (byte === 0x25) { // PDF comment
      while (index < bytes.length && bytes[index] !== 0x0a && bytes[index] !== 0x0d) index++;
      continue;
    }
    if (byte === 0x28) { // Nested literal string, with escaped delimiters.
      index++;
      let depth = 1;
      while (index < bytes.length && depth > 0) {
        if (bytes[index] === 0x5c) index += 2;
        else if (bytes[index] === 0x28) { depth++; index++; }
        else if (bytes[index] === 0x29) { depth--; index++; }
        else index++;
      }
      continue;
    }
    if (byte === 0x3c && bytes[index + 1] === 0x3c) { // Dictionary opener.
      index += 2;
      continue;
    }
    if (byte === 0x3c) { // Hex string.
      index++;
      while (index < bytes.length && bytes[index] !== 0x3e) index++;
      index++;
      continue;
    }
    if (byte === 0x2f) {
      index++;
      let name = '';
      while (index < bytes.length && ![0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25].includes(bytes[index])) {
        if (bytes[index] === 0x23 && /^[\da-f]{2}$/i.test(bytes.subarray(index + 1, index + 3).toString('ascii'))) {
          name += String.fromCharCode(Number.parseInt(bytes.subarray(index + 1, index + 3).toString('ascii'), 16));
          index += 3;
        } else {
          name += String.fromCharCode(bytes[index++]);
        }
      }
      if (ACTIVE_PDF_NAMES.has(name)) return true;
      continue;
    }
    index++;
  }
  return false;
}

async function inspect() {
  const bytes = await readFile(workerData.filePath as string);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') return false;
  if (containsActivePdfName(bytes)) return false;

  const loadingTask = getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, enableXfa: false, useSystemFonts: false, verbosity: 0 });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES || pdf.isPureXfa) return false;
    const openAction = await pdf.getOpenAction();
    if (openAction) return false;
    if (await pdf.getJSActions()) return false;
    if (await pdf.getAttachments()) return false;
    if (await pdf.getFieldObjects()) return false;

    const outline = await pdf.getOutline();
    if (containsUnsafeAction(outline)) return false;

    let annotationCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      if (await page.getJSActions()) return false;
      const annotations = await page.getAnnotations({ intent: 'any' });
      annotationCount += annotations.length;
      if (annotationCount > MAX_ANNOTATIONS || annotations.some(annotation => !PASSIVE_ANNOTATION_TYPES.has(annotation.annotationType)) || containsUnsafeAction(annotations)) return false;
    }
    return true;
  } finally {
    await loadingTask.destroy();
  }
}

parentPort?.postMessage({ ready: true });
parentPort?.once('message', (message: { command?: string }) => {
  if (message?.command !== 'inspect') return;
  void inspect().then(
    safe => parentPort?.postMessage({ safe }),
    () => parentPort?.postMessage({ safe: false }),
  );
});
