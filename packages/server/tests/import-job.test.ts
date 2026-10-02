import { describe, expect, it } from 'vitest';
import { importWhere, parseImportJob } from '../src/modules/fieldwork/import-job.js';

describe('scoped trial-balance jobs', () => {
  it('accepts a complete ownership tuple', () => {
    const job = parseImportJob({
      importId: '11111111-1111-4111-8111-111111111111',
      firmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      engagementId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    expect(job.firmId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(importWhere(job)).toEqual({ id: job.importId, firmId: job.firmId, clientId: job.clientId, engagementId: job.engagementId });
  });

  it('rejects legacy or incomplete unscoped payloads', () => {
    expect(() => parseImportJob({ importId: '11111111-1111-4111-8111-111111111111' }))
      .toThrow('Invalid scoped trial-balance import job');
  });
});
