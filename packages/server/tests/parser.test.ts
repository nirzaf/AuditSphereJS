import { describe, expect, it } from 'vitest';
import { parseTrialBalance, parseTrialBalanceStream, writeTrialBalanceChunks } from '../src/modules/fieldwork/parser.js';

async function collect(source: string | Buffer) {
  const rows = [];
  for await (const row of parseTrialBalanceStream(source)) rows.push(row);
  return rows;
}

describe('bounded Trial Balance CSV parsing', () => {
  it('handles BOM, CRLF, quoted commas and leading-zero account codes', async () => {
    const csv = Buffer.from('\uFEFFCode,Name,Current,Prior\r\n0012,"Cash, bank",10.00,-0.25\r\n');
    await expect(collect(csv)).resolves.toEqual([
      { position: 0, code: '0012', name: 'Cash, bank', current: '10.00', prior: '-0.25' },
    ]);
  });

  it('rejects ambiguous headers, inconsistent rows and malformed numeric values with source lines', async () => {
    await expect(collect('code,name,current,prior,extra\n1,Cash,1,0,x'))
      .rejects.toThrow('exactly code, name, current, prior');
    await expect(collect('code,name,current,prior\n1,Cash,1,0\n2,Receivable,NaN,0'))
      .rejects.toThrow('Invalid current balance at source line 3');
    await expect(collect('code,name,current,prior\n1,Cash,1,0,extra'))
      .rejects.toThrow(/Malformed CSV.*CSV_RECORD_INCONSISTENT_COLUMNS/);
  });

  it('streams the 50,000-row limit without constructing a complete row array', async () => {
    const csv = 'code,name,current,prior\n' + Array.from(
      { length: 50_000 }, (_, i) => `${String(i).padStart(5, '0')},Account ${i},1.00,-1.00`,
    ).join('\n');
    let count = 0;
    let firstCode = '';
    let lastCode = '';
    for await (const row of parseTrialBalanceStream(csv)) {
      if (count === 0) firstCode = row.code;
      lastCode = row.code;
      count += 1;
    }
    expect({ count, firstCode, lastCode }).toEqual({ count: 50_000, firstCode: '00000', lastCode: '49999' });
  });

  it('rejects the first row beyond the 50,000-row bound and keeps the small synchronous contract safe', async () => {
    const csv = 'code,name,current,prior\n' + Array.from(
      { length: 50_001 }, (_, i) => `${i},Account,1.00,-1.00`,
    ).join('\n');
    await expect(collect(csv)).rejects.toThrow('Import must contain 1-50,000 rows');
    expect(() => parseTrialBalance('code,name,current,prior\n1,Cash,0.10,-0.20')[0]?.current).not.toThrow();
  });

  it('persists rows in bounded chunks and flushes the final partial chunk', async () => {
    async function* rows() {
      for (let position = 0; position < 2_505; position += 1) {
        yield { position, code: String(position), name: 'Account', current: '1', prior: '-1' };
      }
    }
    const sizes: number[] = [];
    const total = await writeTrialBalanceChunks(rows(), async chunk => { sizes.push(chunk.length); });
    expect({ total, sizes }).toEqual({ total: 2_505, sizes: [1_000, 1_000, 505] });
    await expect(writeTrialBalanceChunks(rows(), async () => {}, 0)).rejects.toThrow('Invalid trial-balance chunk size');
  });

  it('checks cooperative cancellation between bounded row batches', async () => {
    async function* rows() {
      for (let position = 0; position < 2_500; position += 1) {
        yield { position, code: String(position), name: 'Account', current: '1', prior: '-1' };
      }
    }
    const controller = new AbortController();
    const persistedChunkSizes: number[] = [];
    await expect(writeTrialBalanceChunks(rows(), async chunk => {
      persistedChunkSizes.push(chunk.length);
      controller.abort();
    }, 1_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(persistedChunkSizes).toEqual([1_000]);
  });
});
