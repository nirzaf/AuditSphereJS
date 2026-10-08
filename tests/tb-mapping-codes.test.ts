import { describe, it, expect } from 'vitest';
import { mappingSchema } from '@auditsphere/contracts';

// The mapping contract no longer hard-codes the seven labels. The approved taxonomy decides which codes are valid
// (approveImportMapping refuses any code outside it), so the contract only bounds the shape of a code.
const change = (fsli: string) => ({ idempotencyKey: '3f0c1a2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', changes: [{ rowId: '6f0c1a2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', expectedVersion: 1, fsli }] });

describe('mapping contract: codes come from the approved taxonomy', () => {
  it('accepts a taxonomy code outside the seven original labels', () => {
    expect(mappingSchema.safeParse(change('Cost of sales')).success).toBe(true);
    expect(mappingSchema.safeParse(change('Inventory')).success).toBe(true);
  });

  it('still bounds the shape of a code', () => {
    expect(mappingSchema.safeParse(change('   ')).success).toBe(false);
    expect(mappingSchema.safeParse(change('x'.repeat(121))).success).toBe(false);
  });
});
