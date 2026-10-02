import { z } from 'zod';

const importOutboxIdSchema = z.uuid();

export const importJobSchema = z.object({
  importId: z.uuid(),
  firmId: z.uuid(),
  clientId: z.uuid(),
  engagementId: z.uuid(),
});

export type ImportJob = z.infer<typeof importJobSchema>;

/** A database-loaded ownership tuple must be validated before worker access; IDs alone are insufficient. */
export function parseImportJob(payload: unknown): ImportJob {
  const parsed = importJobSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid scoped trial-balance import job');
  return parsed.data;
}

/** The queue carries only the durable PostgreSQL outbox key; scope is reloaded from PostgreSQL. */
export function parseImportOutboxId(value: unknown): string {
  const parsed = importOutboxIdSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid trial-balance outbox event id');
  return parsed.data;
}

/** Translate the queue identifier into the owned row key plus its full scope tuple. */
export function importWhere(job: ImportJob) {
  return { id: job.importId, firmId: job.firmId, clientId: job.clientId, engagementId: job.engagementId };
}
