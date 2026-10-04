import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, type OnModuleDestroy } from '@nestjs/common';
import { editLeaseSchema } from '@auditsphere/contracts';

const LEASE_TTL_MS = 60_000;
const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 2_000,
});

export class EditLeaseConnection implements OnModuleDestroy {
  onModuleDestroy(): void {
    redis.disconnect();
  }
}

type LeaseRecord = { userId: string; displayName: string; leaseToken: string; expiresAt: number };
type LeaseAction = 'status' | 'acquire' | 'renew' | 'release';
type LeaseRedis = Pick<Redis, 'get' | 'eval'>;

function leaseKey(engagementId: string, importId: string, rowId: string): string {
  return `audit:edit:tb:${engagementId}:${importId}:${rowId}`;
}

function isRedisUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as NodeJS.ErrnoException;
  return ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'].includes(candidate.code ?? '')
    || candidate.name === 'MaxRetriesPerRequestError'
    || /connection is closed|connection lost|connect ECONN|stream isn't writable|read only replica|command timed out/i.test(candidate.message);
}

function leaseView(action: LeaseAction, record: LeaseRecord | null, actorId: string) {
  if (!record) return { available: true as const, action, lease: null };
  const ownedByCurrentUser = record.userId === actorId;
  return {
    available: true as const,
    action,
    lease: {
      userId: record.userId,
      displayName: record.displayName,
      expiresAt: new Date(record.expiresAt).toISOString(),
      ownedByCurrentUser,
      ...(ownedByCurrentUser ? { leaseToken: record.leaseToken } : {}),
    },
  };
}

/**
 * Factory keeps the Redis boundary injectable so outage behavior can be tested without stopping
 * the shared queue/realtime Redis service. Redis owns presence only; PostgreSQL owns write conflicts.
 */
export function createEditLeaseService(client: LeaseRedis) {
  let outageLogged = false;
  const unavailable = (action: LeaseAction) => {
    if (!outageLogged) {
      console.warn('Redis edit leases are unavailable; PostgreSQL version checks remain active.');
      outageLogged = true;
    }
    return { available: false as const, action, reason: 'REDIS_UNAVAILABLE' as const };
  };
  const recovered = () => { outageLogged = false; };

  return {
    async status(engagementId: string, importId: string, rowId: string, actorId: string) {
      const action = 'status';
      try {
        const value = await client.get(leaseKey(engagementId, importId, rowId));
        recovered();
        return leaseView(action, value ? JSON.parse(value) as LeaseRecord : null, actorId);
      } catch (error) {
        if (isRedisUnavailable(error)) return unavailable(action);
        throw error;
      }
    },
    async mutate(engagementId: string, importId: string, rowId: string, actorId: string, displayName: string, body: unknown) {
      const parsed = editLeaseSchema.safeParse(body);
      if (!parsed.success) throw new BadRequestException(parsed.error.issues);
      const key = leaseKey(engagementId, importId, rowId);
      try {
        if (parsed.data.action === 'acquire') {
          const result = await client.eval(`
            local key = KEYS[1]
            local existing = redis.call('GET', key)
            local lease
            if existing then
              lease = cjson.decode(existing)
              if lease.userId ~= ARGV[1] then
                return cjson.encode({ result = 'occupied', lease = lease })
              end
            else
              lease = { userId = ARGV[1], displayName = ARGV[2], leaseToken = ARGV[3] }
            end
            local now = redis.call('TIME')
            lease.displayName = ARGV[2]
            lease.expiresAt = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) + tonumber(ARGV[4])
            local encoded = cjson.encode(lease)
            redis.call('SET', key, encoded, 'PX', ARGV[4])
            return cjson.encode({ result = 'acquired', lease = lease })`,
          1, key, actorId, displayName, randomUUID(), LEASE_TTL_MS);
          recovered();
          const outcome = JSON.parse(result as string) as { result: 'acquired' | 'occupied'; lease: LeaseRecord };
          if (outcome.result === 'occupied') throw new ConflictException('Another editor currently holds this row lease');
          return leaseView('acquire', outcome.lease, actorId);
        }

        const outcome = await client.eval(`
          local encoded = redis.call('GET', KEYS[1])
          if not encoded then return cjson.encode({ ok = false }) end
          local lease = cjson.decode(encoded)
          if lease.userId ~= ARGV[1] or lease.leaseToken ~= ARGV[2] then
            return cjson.encode({ ok = false })
          end
          if ARGV[3] == 'renew' then
            local now = redis.call('TIME')
            lease.expiresAt = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) + tonumber(ARGV[4])
            redis.call('SET', KEYS[1], cjson.encode(lease), 'PX', ARGV[4])
            return cjson.encode({ ok = true, lease = lease })
          end
          redis.call('DEL', KEYS[1])
          return cjson.encode({ ok = true })`,
        1, key, actorId, parsed.data.token, parsed.data.action, LEASE_TTL_MS);
        recovered();
        const result = JSON.parse(outcome as string) as { ok: boolean; lease?: LeaseRecord };
        if (!result.ok) throw new ConflictException('Lease expired or ownership token differs');
        return leaseView(parsed.data.action, result.lease ?? null, actorId);
      } catch (error) {
        if (isRedisUnavailable(error)) return unavailable(parsed.data.action);
        throw error;
      }
    },
  };
}

const editLeases = createEditLeaseService(redis);
export const editLeaseStatus = editLeases.status;
export const editLease = editLeases.mutate;
