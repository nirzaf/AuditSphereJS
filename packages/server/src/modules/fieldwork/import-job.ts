import { z } from 'zod';

export const importJobSchema = z.object({
  importId: z.uuid(),
  firmId: z.uuid(),
  clientId: z.uuid(),
  engagementId: z.uuid(),
});

export type ImportJob = z.infer<typeof importJobSchema>;

/** Queue/outbox payloads must carry the authorized ownership tuple; IDs alone are insufficient. */
export function parseImportJob(payload: unknown): ImportJob {
  const parsed = importJobSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid scoped trial-balance import job');
  return parsed.data;
}

/** Translate the queue identifier into the owned row key plus its full scope tuple. */
export function importWhere(job: ImportJob) {
  return { id: job.importId, firmId: job.firmId, clientId: job.clientId, engagementId: job.engagementId };
}
