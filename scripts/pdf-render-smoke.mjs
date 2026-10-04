import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { renderTrustedPdf } from '@auditsphere/server';

const html = '<!doctype html><html><head><style>body{font-family:"Noto Sans",sans-serif}</style></head><body><h1>AuditSphere PDF runtime</h1><p>Scoped, versioned, immutable document output.</p></body></html>';
const artifact = await renderTrustedPdf({
  template: { id: 'runtime-smoke', version: 1, html, sha256: createHash('sha256').update(html).digest('hex') },
  data: {},
});
const font = execFileSync('fc-match', ['Noto Sans'], { encoding: 'utf8' }).trim();
if (!font || artifact.pageCount !== 1 || !artifact.sha256 || artifact.provenance.chromiumVersion.length === 0) {
  throw new Error('Target image PDF renderer smoke failed.');
}
console.log(JSON.stringify({
  ok: true,
  renderer: artifact.provenance.renderer,
  playwrightVersion: artifact.provenance.playwrightVersion,
  chromiumVersion: artifact.provenance.chromiumVersion,
  fontMatch: font,
  pageCount: artifact.pageCount,
  sizeBytes: artifact.sizeBytes,
  sha256: artifact.sha256,
  uid: process.getuid?.(),
}));
