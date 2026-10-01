import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(), REDIS_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DEV_AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
  STORAGE_PROVIDER: z.enum(['graph', 'local-s3']).optional(),
  AUTH_PROVIDER: z.enum(['entra', 'development']).optional(),
  WEB_ORIGIN: z.url().default('http://127.0.0.1:4200'),
  HOST: z.string().default('127.0.0.1'),
});
export function readConfiguration(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration keys: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    if (config.DEV_AUTH_ENABLED === 'true' || env.DEV_AUTH_TOKEN) throw new Error('Development authentication is forbidden in production');
    if (config.AUTH_PROVIDER !== 'entra' || config.STORAGE_PROVIDER !== 'graph') throw new Error('Production requires Entra identity and Graph storage');
    if (new URL(config.WEB_ORIGIN).protocol !== 'https:') throw new Error('Production WEB_ORIGIN requires HTTPS');
    for (const key of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'ENTRA_API_AUDIENCE', 'ENTRA_API_SCOPE', 'ENTRA_BROWSER_CLIENT_ID', 'ENTRA_BROWSER_API_SCOPE', 'ENTRA_BROWSER_REDIRECT_URI', 'SHAREPOINT_DRIVE_ID', 'SHAREPOINT_FOLDER_ID', 'ONEDRIVE_DRIVE_ID', 'ONEDRIVE_FOLDER_ID']) if (!env[key]) throw new Error(`Missing production configuration: ${key}`);
  }
  return config;
}
