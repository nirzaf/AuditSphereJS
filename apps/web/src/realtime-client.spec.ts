import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSocket = {
  connected: boolean;
  events: Map<string, Array<(...args: unknown[]) => void>>;
  joins: Array<{ request: unknown; acknowledge: (...args: unknown[]) => void }>;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  timeout: (_ms: number) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
  removeAllListeners: () => unknown;
  disconnect: () => unknown;
  trigger: (event: string, ...args: unknown[]) => void;
};
const socketHarness = vi.hoisted(() => ({ instance: null as MockSocket | null, options: null as unknown }));

vi.mock('socket.io-client', () => ({
  io: vi.fn((_url: string, options: unknown) => {
    socketHarness.options = options;
    const events = new Map<string, Array<(...args: unknown[]) => void>>();
    const socket = {
      connected: false,
      events,
      joins: [] as Array<{ request: unknown; acknowledge: (...args: unknown[]) => void }>,
      on(event: string, listener: (...args: unknown[]) => void) { events.set(event, [...(events.get(event) ?? []), listener]); return this; },
      timeout(_ms: number) { return this; },
      emit(event: string, ...args: unknown[]) {
        const [request, acknowledge] = args;
        if (event === 'join' && typeof acknowledge === 'function') this.joins.push({ request, acknowledge: acknowledge as (...values: unknown[]) => void });
        return this;
      },
      removeAllListeners() { events.clear(); return this; },
      disconnect() { this.connected = false; return this; },
      trigger(event: string, ...args: unknown[]) { for (const listener of events.get(event) ?? []) listener(...args); },
    };
    socketHarness.instance = socket;
    return socket;
  }),
}));

const engagementId = '11111111-1111-4111-8111-111111111111';
const firstImportId = '22222222-2222-4222-8222-222222222222';
const nextImportId = '33333333-3333-4333-8333-333333333333';
const ack = (resourceId: string, version: number) => ({ ok: true, snapshot: { engagementId, engagementVersion: 1, resource: { type: 'trial-balance-import', id: resourceId }, resourceVersion: version } });

describe('realtime client recovery', () => {
  beforeEach(() => { vi.resetModules(); socketHarness.instance = null; socketHarness.options = null; });

  it('joins after connect and refreshes instead of applying or losing invalidation data', async () => {
    const { RealtimeClient } = await import('./realtime-client');
    const client = new RealtimeClient();
    const onSnapshot = vi.fn(); const onInvalidation = vi.fn(); const onRefreshRequired = vi.fn();
    client.connect({ kind: 'internal', accessToken: async () => 'current-access-token' }, { engagementId, resource: { type: 'trial-balance-import', id: firstImportId } }, { onSnapshot, onInvalidation, onRefreshRequired });
    const socket = socketHarness.instance!;
    const auth = (socketHarness.options as { auth: (callback: (value: unknown) => void) => void }).auth;
    await new Promise<void>(resolve => auth(value => { expect(value).toEqual({ kind: 'internal', accessToken: 'current-access-token' }); resolve(); }));

    socket.connected = true;
    socket.trigger('connect');
    expect(socket.joins).toHaveLength(1);
    socket.joins[0]!.acknowledge(null, ack(firstImportId, 1));
    socket.trigger('invalidate', { schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: firstImportId, version: 2 });
    expect(onInvalidation).toHaveBeenCalledOnce();
    expect(onInvalidation.mock.calls[0]![0]).toMatchObject({ version: 2 });

    socket.trigger('invalidate', { schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: firstImportId, version: 4 });
    expect(onRefreshRequired).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledOnce();

    socket.trigger('connect');
    expect(socket.joins).toHaveLength(2);
    socket.joins[1]!.acknowledge(null, ack(firstImportId, 4));
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it('resets version tracking when a user explicitly changes import rooms', async () => {
    const { RealtimeClient } = await import('./realtime-client');
    const client = new RealtimeClient();
    const onInvalidation = vi.fn(); const onRefreshRequired = vi.fn();
    const connection = client.connect({ kind: 'portal' }, { engagementId, resource: { type: 'trial-balance-import', id: firstImportId } }, { onSnapshot: vi.fn(), onInvalidation, onRefreshRequired });
    const socket = socketHarness.instance!;
    socket.connected = true; socket.trigger('connect');
    socket.joins[0]!.acknowledge(null, ack(firstImportId, 9));
    connection.join({ engagementId, resource: { type: 'trial-balance-import', id: nextImportId } });
    socket.joins[1]!.acknowledge(null, ack(nextImportId, 1));
    socket.trigger('invalidate', { schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: nextImportId, version: 2 });
    expect(onInvalidation).toHaveBeenCalledOnce();
    expect(onRefreshRequired).not.toHaveBeenCalled();
  });

  it('ignores an older join acknowledgement after a newer resource has been selected', async () => {
    const { RealtimeClient } = await import('./realtime-client');
    const client = new RealtimeClient();
    const onSnapshot = vi.fn(); const onInvalidation = vi.fn(); const onRefreshRequired = vi.fn();
    const connection = client.connect({ kind: 'portal' }, { engagementId, resource: { type: 'trial-balance-import', id: firstImportId } }, { onSnapshot, onInvalidation, onRefreshRequired });
    const socket = socketHarness.instance!;
    socket.connected = true; socket.trigger('connect');
    connection.join({ engagementId, resource: { type: 'trial-balance-import', id: nextImportId } });
    socket.joins[0]!.acknowledge(null, ack(firstImportId, 50));
    socket.joins[1]!.acknowledge(null, ack(nextImportId, 1));
    socket.trigger('invalidate', { schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: nextImportId, version: 2 });
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot.mock.calls[0]![0]).toMatchObject({ resource: { id: nextImportId }, resourceVersion: 1 });
    expect(onInvalidation).toHaveBeenCalledOnce();
    expect(onRefreshRequired).not.toHaveBeenCalled();
  });
});
