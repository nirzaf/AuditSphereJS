import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { operationalMetrics } from './observability/metrics.js';
import { safeOperationalCode } from './observability/logging.js';
const poolMax = Number(process.env.DATABASE_POOL_MAX || 10);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50) throw new Error('DATABASE_POOL_MAX must be 1–50');
export const databasePool = new Pool({
  connectionString: process.env.SERVICE_NAME === 'auditsphere-worker' ? process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL : process.env.DATABASE_URL,
  max: poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ...(process.env.DATABASE_TLS_CA_FILE ? { ca: readFileSync(process.env.DATABASE_TLS_CA_FILE, 'utf8') } : {}) } : undefined,
  application_name: process.env.SERVICE_NAME || 'auditsphere',
});
databasePool.on('error', error => {
  operationalMetrics.setDependency('postgres', 'down');
  console.error(JSON.stringify({ event: 'dependency.pool_error', dependency: 'postgres', errorCode: safeOperationalCode(error, 'DATABASE_POOL_ERROR'), action: 'Check PostgreSQL availability and pool pressure; request and queue state remains correlated by request ID.' }));
});
export const db = new PrismaClient({ adapter: new PrismaPg(databasePool as unknown as ConstructorParameters<typeof PrismaPg>[0], { disposeExternalPool: true }) });
