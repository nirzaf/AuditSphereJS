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
