import { describe, expect, it } from 'vitest';
import { realtimeInvalidationSchema, realtimeJoinRequestSchema } from '@auditsphere/contracts';
import { publishRealtimeInvalidation, subscribeRealtimeInvalidations } from '../src/platform/realtime/invalidation.js';
import { internalEngagementRoom, internalImportRoom, portalEngagementRoom } from '../src/platform/realtime/rooms.js';

const engagementId = '11111111-1111-4111-8111-111111111111';
const importId = '22222222-2222-4222-8222-222222222222';
const hint = { schemaVersion: 1 as const, engagementId, resourceType: 'trial-balance-import' as const, resourceId: importId, version: 2 };

describe('realtime transport contracts', () => {
  it('accepts only server-derivable engagement resource subscriptions', () => {
    expect(realtimeJoinRequestSchema.safeParse({ engagementId, resource: { type: 'engagement' } }).success).toBe(true);
    expect(realtimeJoinRequestSchema.safeParse({ engagementId, resource: { type: 'trial-balance-import', id: importId } }).success).toBe(true);
    expect(realtimeJoinRequestSchema.safeParse({ engagementId, room: 'internal:all' }).success).toBe(false);
    expect(realtimeJoinRequestSchema.safeParse({ engagementId, resource: { type: 'trial-balance-import', id: 'not-a-guid' } }).success).toBe(false);
  });

  it('keeps internal, portal and Trial Balance room names disjoint', () => {
    expect(internalEngagementRoom(engagementId)).toBe(`internal:engagement:${engagementId}`);
    expect(internalImportRoom(engagementId, importId)).toBe(`${internalEngagementRoom(engagementId)}:trial-balance-import:${importId}`);
    expect(portalEngagementRoom(engagementId)).toBe(`portal:engagement:${engagementId}`);
    expect(portalEngagementRoom(engagementId)).not.toBe(internalEngagementRoom(engagementId));
  });

  it('broadcast hints contain only identifiers and versions and subscriptions can be removed', () => {
    let received: unknown;
    const unsubscribe = subscribeRealtimeInvalidations(event => { received = event; });
    publishRealtimeInvalidation({ ...hint, amount: 'not a transport field' } as typeof hint);
    unsubscribe();
    expect(realtimeInvalidationSchema.parse(received)).toEqual(hint);
    expect(realtimeInvalidationSchema.safeParse({ ...hint, balance: 'private-financial-data' }).data).toEqual(hint);
    expect(() => publishRealtimeInvalidation({ ...hint, version: 0 })).toThrow();
  });

  it('continues notification delivery when an unrelated listener fails', () => {
    let received = 0;
    const removeThrowing = subscribeRealtimeInvalidations(() => { throw new Error('transport listener failed'); });
    const removeObserver = subscribeRealtimeInvalidations(() => { received++; });
    publishRealtimeInvalidation(hint);
    removeThrowing(); removeObserver();
    expect(received).toBe(1);
  });
});
