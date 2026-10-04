import { Injectable, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { db } from './db.js';
import { ClockModule } from './clock.js';
import { operationalMetrics, type DependencyState } from './observability/metrics.js';
import { safeOperationalCode } from './observability/logging.js';
export const DATABASE = Symbol('DATABASE');
export const OPERATIONAL_METRICS = Symbol('OPERATIONAL_METRICS');
export const REDIS_HEALTH_PROBE = Symbol('REDIS_HEALTH_PROBE');

export type ReadinessResult = {
  status: 'ready' | 'degraded' | 'unready';
  dependencies: { postgres: DependencyState; redis: DependencyState };
  alerts: Array<{ code: 'POSTGRES_UNAVAILABLE' | 'DATABASE_ROLE_OVERPRIVILEGED' | 'REDIS_UNAVAILABLE'; action: string }>;
};

export type RedisHealthProbe = { ping(): Promise<boolean>; close(): void };

export function createRedisHealthProbe(redisUrl: string): RedisHealthProbe {
  let client: Redis | undefined;
  let pending: Promise<boolean> | undefined;
  return {
    ping() {
      if (pending) return pending;
      pending = (async () => {
        if (!client || client.status === 'end') {
          client = new Redis(redisUrl, {
            lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
            connectTimeout: 750, commandTimeout: 750, retryStrategy: () => null,
          });
          client.on('error', () => undefined);
        }
        try {
          if (client.status === 'wait') await client.connect();
          return await client.ping() === 'PONG';
        } catch {
          return false;
        }
      })().finally(() => { pending = undefined; });
      return pending;
    },
    close() { client?.disconnect(); client = undefined; pending = undefined; },
  };
}

@Injectable()
export class Readiness implements OnModuleDestroy {
  private redisCache?: { checkedAt: number; up: boolean };
  private redisCheck?: Promise<boolean>;

  constructor(
    @Inject(DATABASE) private readonly database: typeof db,
    @Inject(OPERATIONAL_METRICS) private readonly metrics: typeof operationalMetrics,
    @Inject(REDIS_HEALTH_PROBE) private readonly redisProbe: RedisHealthProbe,
  ) {}

  async check(): Promise<ReadinessResult> {
    let postgres: DependencyState = 'up';
    let postgresAlert: ReadinessResult['alerts'][number] | undefined;
    try {
      await this.database.$queryRaw`SELECT 1`;
      if (process.env.NODE_ENV === 'production') {
        const rows = await this.database.$queryRaw<Array<{ privileged: boolean }>>`SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR has_schema_privilege(current_user, 'public', 'CREATE')) AS privileged FROM pg_roles WHERE rolname = current_user`;
        if (rows[0]?.privileged !== false) {
          postgres = 'down';
          postgresAlert = { code: 'DATABASE_ROLE_OVERPRIVILEGED', action: 'Replace the runtime database role with the reviewed least-privilege role before accepting traffic.' };
        }
      }
    } catch (error) {
      postgres = 'down';
      postgresAlert = {
        code: 'POSTGRES_UNAVAILABLE',
        action: `Restore PostgreSQL connectivity before directing traffic (${safeOperationalCode(error, 'DATABASE_CONNECTION_FAILED')}).`,
      };
    }
    const redisUp = await this.redisAvailable();
    const redis: DependencyState = redisUp ? 'up' : 'down';
    this.transition('postgres', postgres, postgresAlert?.code, postgresAlert?.action);
    this.transition('redis', redis, 'REDIS_UNAVAILABLE', 'Restore Redis connectivity; queued work remains durable in PostgreSQL and will resume when Redis recovers.');
    const alerts = [postgresAlert, ...(redisUp ? [] : [{ code: 'REDIS_UNAVAILABLE' as const, action: 'Restore Redis connectivity; queued work remains durable in PostgreSQL and will resume when Redis recovers.' }])].filter((alert): alert is ReadinessResult['alerts'][number] => !!alert);
    return {
      status: postgres === 'down' ? 'unready' : redis === 'down' ? 'degraded' : 'ready',
      dependencies: { postgres, redis },
      alerts,
    };
  }

  async assertRequired(): Promise<ReadinessResult> {
    const result = await this.check();
    if (result.status === 'unready') throw new Error(`Required PostgreSQL dependency is unavailable (${result.alerts[0]?.code ?? 'DATABASE_UNAVAILABLE'})`);
    return result;
  }

  onModuleDestroy(): void { this.redisProbe.close(); }

  private async redisAvailable(): Promise<boolean> {
    if (this.redisCache && Date.now() - this.redisCache.checkedAt < 1_000) return this.redisCache.up;
    if (this.redisCheck) return this.redisCheck;
    this.redisCheck = this.redisProbe.ping().catch(() => false).then(up => {
      this.redisCache = { checkedAt: Date.now(), up };
      return up;
    }).finally(() => { this.redisCheck = undefined; });
    return this.redisCheck;
  }

  private transition(dependency: 'postgres' | 'redis', state: DependencyState, code: string | undefined, action: string | undefined): void {
    const previous = this.metrics.dependencyState(dependency);
    this.metrics.setDependency(dependency, state);
    if (previous === state) return;
    const event = { event: 'dependency.health_transition', dependency, state, ...(code ? { code } : {}), ...(state === 'down' && action ? { action } : {}) };
    if (state === 'down') console.error(JSON.stringify(event));
    else if (previous === 'down') console.info(JSON.stringify(event));
  }
}

@Module({ imports: [ClockModule], providers: [
  { provide: DATABASE, useValue: db },
  { provide: OPERATIONAL_METRICS, useValue: operationalMetrics },
  { provide: REDIS_HEALTH_PROBE, useFactory: () => createRedisHealthProbe(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379') },
  Readiness,
], exports: [DATABASE, OPERATIONAL_METRICS, Readiness, ClockModule] })
export class RuntimeModule {}
