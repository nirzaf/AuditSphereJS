import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';

describe('Fastify 5 multipart upload adapter', () => {
  const app = Fastify({ bodyLimit: 1024 });
  let address: string;

  before(async () => {
    await app.register(multipart, { limits: { fileSize: 8, files: 1, fields: 1, parts: 2 } });
    app.post('/upload', async (request, reply) => {
      const part = await request.file();
      if (!part) return reply.code(400).send({ error: 'file required' });
      let size = 0;
      for await (const chunk of part.file) size += chunk.length;
      if (part.file.truncated) return reply.code(413).send({ error: 'file too large', size });
      return { filename: part.filename, mimetype: part.mimetype, size };
    });
    address = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  after(async () => { await app.close(); });

  it('consumes an allowed file stream and exposes its bounded metadata', async () => {
    const form = new FormData();
    form.append('file', new Blob(['bounded']), 'fixture.txt');
    const response = await fetch(`${address}/upload`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { filename: 'fixture.txt', mimetype: 'application/octet-stream', size: 7 });
  });

  it('rejects content beyond the explicit per-file bound', async () => {
    const form = new FormData();
    form.append('file', new Blob(['123456789']), 'oversize.txt');
    const response = await fetch(`${address}/upload`, { method: 'POST', body: form });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'file too large', size: 8 });
  });
});
