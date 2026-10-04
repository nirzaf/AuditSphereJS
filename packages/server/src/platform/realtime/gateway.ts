import { UnauthorizedException, type OnModuleDestroy } from '@nestjs/common';
import {
  Ack, ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { realtimeJoinAckSchema, realtimeJoinRequestSchema, realtimeInvalidationSchema } from '@auditsphere/contracts';
import type { RealtimeInvalidation, RealtimeJoinRequest } from '@auditsphere/contracts';
import type { Namespace, Socket } from 'socket.io';
import { authorizeRealtimeJoin, resolveRealtimePrincipal, type RealtimePrincipal } from './authorization.js';
import { subscribeRealtimeInvalidations } from './invalidation.js';
import { internalImportRoom } from './rooms.js';

type Subscription = { principal: RealtimePrincipal; request: RealtimeJoinRequest; room: string };
type JoinAck = (value: unknown) => void;

@WebSocketGateway({
  namespace: '/realtime',
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: process.env.WEB_ORIGIN ?? false, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() private namespace!: Namespace;
  private unsubscribe?: () => void;
  private revalidationTimer?: ReturnType<typeof setInterval>;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly joinOperations = new Map<string, Promise<void>>();

  afterInit(namespace: Namespace): void {
    this.namespace = namespace;
    this.unsubscribe = subscribeRealtimeInvalidations(event => this.publish(event));
    this.revalidationTimer = setInterval(() => { void this.revalidateActiveSockets(); }, 15_000);
    this.revalidationTimer.unref?.();
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() value: unknown, @Ack() acknowledge?: JoinAck): Promise<void> {
    const previous = this.joinOperations.get(socket.id) ?? Promise.resolve();
    const operation = previous.then(() => this.processJoin(socket, value, acknowledge));
    this.joinOperations.set(socket.id, operation);
    try { await operation; }
    finally { if (this.joinOperations.get(socket.id) === operation) this.joinOperations.delete(socket.id); }
  }

  private async processJoin(socket: Socket, value: unknown, acknowledge?: JoinAck): Promise<void> {
    try {
      await this.leaveSubscription(socket);
      if (!socket.connected) return;
      const parsed = realtimeJoinRequestSchema.safeParse(value);
      if (!parsed.success) {
        acknowledge?.(realtimeJoinAckSchema.parse({ ok: false, error: 'Invalid room request' }));
        return;
      }
      const principal = await resolveRealtimePrincipal({
        auth: socket.handshake.auth,
        cookie: socket.handshake.headers.cookie,
        origin: socket.handshake.headers.origin,
      });
      const authorization = await authorizeRealtimeJoin(principal, parsed.data);
      if (!socket.connected) return;
      await socket.join(authorization.room);
      if (!socket.connected) { await socket.leave(authorization.room); return; }
      this.subscriptions.set(socket.id, { principal: authorization.principal, request: parsed.data, room: authorization.room });
      acknowledge?.(realtimeJoinAckSchema.parse({ ok: true, snapshot: authorization.snapshot }));
    } catch {
      acknowledge?.(realtimeJoinAckSchema.parse({ ok: false, error: 'Room access denied' }));
    }
  }

  handleDisconnect(socket: Socket): void {
    this.subscriptions.delete(socket.id);
  }

  async revalidateActiveSockets(): Promise<void> {
    for (const [socketId, subscription] of this.subscriptions) {
      const socket = this.namespace?.sockets.get(socketId);
      if (!socket) { this.subscriptions.delete(socketId); continue; }
      try {
        const principal = await resolveRealtimePrincipal({
          auth: socket.handshake.auth,
          cookie: socket.handshake.headers.cookie,
          origin: socket.handshake.headers.origin,
        });
        if (principal.kind !== subscription.principal.kind || principal.userId !== subscription.principal.userId) throw new UnauthorizedException();
        await authorizeRealtimeJoin(principal, subscription.request);
      } catch {
        socket.emit('access-revoked');
        await this.leaveSubscription(socket);
        socket.disconnect(true);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.revalidationTimer) clearInterval(this.revalidationTimer);
    this.unsubscribe?.();
    this.subscriptions.clear();
  }

  private async leaveSubscription(socket: Socket): Promise<void> {
    const existing = this.subscriptions.get(socket.id);
    if (!existing) return;
    await socket.leave(existing.room);
    this.subscriptions.delete(socket.id);
  }

  private publish(value: RealtimeInvalidation): void {
    const event = realtimeInvalidationSchema.parse(value);
    this.namespace?.to(internalImportRoom(event.engagementId, event.resourceId)).emit('invalidate', event);
  }
}
