import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { ConflictException, BadRequestException, type OnModuleDestroy } from '@nestjs/common';
import { editLeaseSchema } from '@auditsphere/contracts';
const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on('error', error => console.error('Redis lease coordination unavailable:', error.message));
// These leases improve collaboration only. PostgreSQL version checks remain mandatory.
export class EditLeaseConnection implements OnModuleDestroy {
  onModuleDestroy(): void {
    redis.disconnect();
  }
}

export async function editLease(resourceId: string, actorId: string, body: unknown) {
  const parsed = editLeaseSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const key = `audit:edit:tb:${resourceId}`;
  if (parsed.data.action === 'acquire') {
    const token = randomUUID();
    const result = await redis.eval(`
      if redis.call('EXISTS', KEYS[1]) == 1 then return nil end
      local fence = redis.call('INCR', KEYS[2])
      local value = cjson.encode({userId=ARGV[1], displayName='Development preparer', leaseToken=ARGV[2], fencingNumber=fence})
      redis.call('SET', KEYS[1], value, 'EX', 60)
      return value`, 2, key, key + ':fence', actorId, token);
    if (!result) throw new ConflictException('Another editor holds this lease');
    return JSON.parse(result as string);
  }
  const result = await redis.eval(`
    local value = redis.call('GET', KEYS[1])
    if not value then return 0 end
    local lease = cjson.decode(value)
    if lease.userId ~= ARGV[1] or lease.leaseToken ~= ARGV[2] then return 0 end
    if ARGV[3] == 'renew' then return redis.call('EXPIRE', KEYS[1], 60) end
    return redis.call('DEL', KEYS[1])`, 1, key, actorId, parsed.data.token, parsed.data.action);
  if (!result) throw new ConflictException('Lease expired or ownership token differs');
  return { action: parsed.data.action, ok: true };
}
