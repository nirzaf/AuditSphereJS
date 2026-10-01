import { describe, it, expect } from 'vitest';
import { parseTrialBalance } from '@auditsphere/server';
import { mappingSchema, nextState, states, moneySchema } from '@auditsphere/contracts';
describe('TB validation', () => {
  it('preserves decimal strings without floating arithmetic', () => { expect(parseTrialBalance('code,name,current,prior\n1,Cash,0.10,-0.20')[0].current).toBe('0.10'); expect(moneySchema.safeParse('1e3').success).toBe(false); });
  it('rejects duplicate codes and malformed balances', () => { expect(() => parseTrialBalance('code,name,current,prior\n1,Cash,1,0\n1,Other,-1,0')).toThrow(); expect(() => parseTrialBalance('code,name,current,prior\n1,Cash,NaN,0')).toThrow(); });
  it.each([5000,25000,50000])('validates %i accounts', count => { const csv = 'code,name,current,prior\n' + Array.from({ length: count }, (_, i) => `${i},Account ${i},${i % 2 ? '-1.00' : '1.00'},0.00`).join('\n'); expect(parseTrialBalance(csv)).toHaveLength(count); });
  it('rejects over-limit imports', () => { const csv = 'code,name,current,prior\n' + Array.from({length:50001},(_,i)=>`${i},Account,0,0`).join('\n'); expect(() => parseTrialBalance(csv)).toThrow('50,000'); });
});
describe('contracts', () => { it('preserves the 11 states and terminal archive', () => { expect(states).toHaveLength(11); expect(nextState('LEAD_INGESTION')).toBe('PROPOSAL_GENERATION'); expect(nextState('ARCHIVED_READ_ONLY')).toBeUndefined(); }); it('rejects oversized mapping batches', () => { expect(mappingSchema.safeParse({idempotencyKey:crypto.randomUUID(),changes:[]}).success).toBe(false); }); });
