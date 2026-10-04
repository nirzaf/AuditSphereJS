import { Injectable } from '@angular/core';
import { realtimeInvalidationSchema, realtimeJoinAckSchema, realtimeJoinRequestSchema } from '@auditsphere/contracts';
import type { RealtimeInvalidation, RealtimeJoinRequest, RealtimeJoinSnapshot } from '@auditsphere/contracts';
import { io, type Socket } from 'socket.io-client';

export type RealtimeCredentials =
  | { kind: 'internal'; accessToken: () => Promise<string> }
  | { kind: 'portal' };

export type RealtimeCallbacks = {
  onSnapshot: (snapshot: RealtimeJoinSnapshot) => void;
  onInvalidation: (event: RealtimeInvalidation) => void;
  onRefreshRequired: () => void;
  onStatus?: (status: 'connected' | 'disconnected' | 'denied') => void;
  onAccessRevoked?: () => void;
};

export type RealtimeConnection = { join(request: RealtimeJoinRequest): void; close(): void };

@Injectable({ providedIn: 'root' })
export class RealtimeClient {
  connect(credentials: RealtimeCredentials, initial: RealtimeJoinRequest, callbacks: RealtimeCallbacks): RealtimeConnection {
    let desired = realtimeJoinRequestSchema.parse(initial);
    let latestVersion = 0;
    let joinedResource = `${desired.engagementId}:${JSON.stringify(desired.resource)}`;
    let joinSequence = 0;
    let closed = false;
    const socket: Socket = io('/realtime', {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: callback => {
        if (credentials.kind === 'portal') { callback({ kind: 'portal' }); return; }
        void credentials.accessToken().then(accessToken => callback({ kind: 'internal', accessToken }))
          .catch(() => callback({ kind: 'internal', accessToken: '' }));
      },
    });

    socket.on('connect', () => {
      if (closed) return;
      const request = desired;
      const sequence = ++joinSequence;
      socket.timeout(8_000).emit('join', request, (error: Error | null, raw: unknown) => {
        if (closed || sequence !== joinSequence) return;
        if (error) { callbacks.onStatus?.('disconnected'); return; }
        const result = realtimeJoinAckSchema.safeParse(raw);
        if (!result.success || !result.data.ok) { callbacks.onStatus?.('denied'); return; }
        latestVersion = Math.max(latestVersion, result.data.snapshot.resourceVersion);
        callbacks.onSnapshot(result.data.snapshot);
        callbacks.onStatus?.('connected');
      });
    });
    socket.on('invalidate', (raw: unknown) => {
      if (closed) return;
      const parsed = realtimeInvalidationSchema.safeParse(raw);
      if (!parsed.success) {
        callbacks.onRefreshRequired();
        return;
      }
      const event = parsed.data;
      if (desired.resource.type !== 'trial-balance-import' || event.engagementId !== desired.engagementId || event.resourceId !== desired.resource.id || event.version <= latestVersion) return;
      const missedVersions = latestVersion > 0 && event.version > latestVersion + 1;
      latestVersion = event.version;
      // An invalidation is never applied as data; it always causes an API refresh from PostgreSQL.
      if (missedVersions) callbacks.onRefreshRequired();
      else callbacks.onInvalidation(event);
    });
    socket.on('access-revoked', () => { callbacks.onAccessRevoked?.(); socket.disconnect(); });
    socket.on('disconnect', () => { if (!closed) callbacks.onStatus?.('disconnected'); });
    socket.on('connect_error', () => { if (!closed) callbacks.onStatus?.('disconnected'); });

    return {
      join: request => {
        desired = realtimeJoinRequestSchema.parse(request);
        const sequence = ++joinSequence;
        const nextResource = `${desired.engagementId}:${JSON.stringify(desired.resource)}`;
        if (joinedResource !== nextResource) { latestVersion = 0; joinedResource = nextResource; }
        if (socket.connected) socket.timeout(8_000).emit('join', desired, (error: Error | null, raw: unknown) => {
          if (closed || sequence !== joinSequence) return;
          if (error) { callbacks.onStatus?.('disconnected'); return; }
          const result = realtimeJoinAckSchema.safeParse(raw);
          if (!result.success || !result.data.ok) { callbacks.onStatus?.('denied'); return; }
          latestVersion = Math.max(latestVersion, result.data.snapshot.resourceVersion);
          callbacks.onSnapshot(result.data.snapshot);
        });
      },
      close: () => { closed = true; socket.removeAllListeners(); socket.disconnect(); },
    };
  }
}
