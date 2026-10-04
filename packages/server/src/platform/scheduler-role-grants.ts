/** Least-privilege table grants required by the durable deadline API and worker paths. */
export const schedulerRoleGrants = [
  'GRANT SELECT, INSERT, UPDATE ON "background_operations", "OutboxEvent", scheduled_deadlines TO auditsphere_worker',
  'GRANT SELECT, INSERT, UPDATE ON scheduled_deadlines TO auditsphere_api',
  'GRANT SELECT, INSERT ON "OutboxEvent" TO auditsphere_api',
] as const;
