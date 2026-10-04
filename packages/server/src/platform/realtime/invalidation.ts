import { realtimeInvalidationSchema } from '@auditsphere/contracts';
import type { RealtimeInvalidation } from '@auditsphere/contracts';

type Listener = (event: RealtimeInvalidation) => void;
const listeners = new Set<Listener>();

/** Process-local wake-up seam. Redis fans the gateway's room emission to other API replicas. */
export function publishRealtimeInvalidation(value: RealtimeInvalidation): void {
  const event = realtimeInvalidationSchema.parse(value);
  for (const listener of listeners) {
    try { listener(event); } catch { /* A committed business command cannot be rolled back by realtime delivery. */ }
  }
}

export function subscribeRealtimeInvalidations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
