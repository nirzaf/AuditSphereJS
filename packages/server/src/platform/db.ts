import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
const poolMax = Number(process.env.DATABASE_POOL_MAX || 10);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50) throw new Error('DATABASE_POOL_MAX must be 1–50');
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.SERVICE_NAME === 'auditsphere-worker' ? process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL : process.env.DATABASE_URL, max: poolMax, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ...(process.env.DATABASE_TLS_CA_FILE ? { ca: readFileSync(process.env.DATABASE_TLS_CA_FILE, 'utf8') } : {}) } : undefined, application_name: process.env.SERVICE_NAME || 'auditsphere' }) });
