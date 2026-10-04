import { createAdapter } from '@socket.io/redis-adapter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';

class RedisRealtimeIoAdapter extends IoAdapter {
  private closed = false;

  constructor(app: INestApplication, private readonly publisher: Redis, private readonly subscriber: Redis) {
    super(app);
  }

  override createIOServer(...args: Parameters<IoAdapter['createIOServer']>): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(...args);
    server.adapter(createAdapter(this.publisher, this.subscriber, { key: 'auditsphere:realtime:v1' }));
    return server;
  }

  override async close(server: Parameters<IoAdapter['close']>[0]): Promise<void> {
    try { await super.close(server); }
    finally {
      if (!this.closed) {
        this.closed = true;
        await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
      }
    }
  }
}

/** Install before Nest initializes gateways so the Socket.IO namespace uses Redis from its first listen. */
export async function installRealtimeRedisAdapter(app: INestApplication, redisUrl: string): Promise<void> {
  const publisher = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
  const subscriber = publisher.duplicate({ lazyConnect: true });
  publisher.on('error', () => undefined);
  subscriber.on('error', () => undefined);
  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    app.useWebSocketAdapter(new RedisRealtimeIoAdapter(app, publisher, subscriber));
  } catch (error) {
    await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    throw error;
  }
}
