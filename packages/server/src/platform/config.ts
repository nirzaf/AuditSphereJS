import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine(value => URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol)), REDIS_URL: z.url().refine(value => URL.canParse(value) && ['redis:', 'rediss:'].includes(new URL(value).protocol)),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  CLAMAV_HOST: z.string().min(1).default('127.0.0.1'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DEV_AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
  STORAGE_PROVIDER: z.enum(['graph', 'local-s3']).optional(),
  NOTIFICATION_PROVIDER: z.enum(['disabled', 'graph']).default('disabled'),
  M365_MAIL_TENANT_ID: z.preprocess(value => value === '' ? undefined : value, z.uuid().optional()),
  M365_MAIL_CLIENT_ID: z.preprocess(value => value === '' ? undefined : value, z.uuid().optional()),
  M365_MAIL_CLIENT_SECRET: z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional()),
  M365_NOTIFICATION_SENDER: z.preprocess(value => value === '' ? undefined : value, z.string().email().optional()),
  AUTH_PROVIDER: z.enum(['entra', 'development']).optional(),
  WEB_ORIGIN: z.url().refine(value => {
    const origin = new URL(value);
    return ['http:', 'https:'].includes(origin.protocol) && origin.origin === value;
  }, 'WEB_ORIGIN must be an HTTP(S) origin without a path, query or fragment').default('http://127.0.0.1:4200'),
  HOST: z.string().default('127.0.0.1'),
});
export function readConfiguration(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration keys: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const config = parsed.data;
  if (config.DEV_AUTH_ENABLED === 'true' && (!env.DEV_AUTH_TOKEN || env.DEV_AUTH_TOKEN.startsWith('replace-'))) throw new Error('Development authentication requires a generated local token');
  if (config.NODE_ENV === 'production') {
    const database = new URL(config.DATABASE_URL);
    if (database.searchParams.has('sslmode') && database.searchParams.get('sslmode') !== 'verify-full') throw new Error('Production database TLS must verify the server certificate');
    if (config.DEV_AUTH_ENABLED === 'true' || env.DEV_AUTH_TOKEN) throw new Error('Development authentication is forbidden in production');
    if (config.AUTH_PROVIDER !== 'entra' || config.STORAGE_PROVIDER !== 'graph') throw new Error('Production requires Entra identity and Graph storage');
    if (new URL(config.WEB_ORIGIN).protocol !== 'https:') throw new Error('Production WEB_ORIGIN requires HTTPS');
    for (const key of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'ENTRA_API_AUDIENCE', 'ENTRA_API_SCOPE', 'ENTRA_BROWSER_CLIENT_ID', 'ENTRA_BROWSER_API_SCOPE', 'ENTRA_BROWSER_REDIRECT_URI', 'SHAREPOINT_DRIVE_ID', 'SHAREPOINT_FOLDER_ID', 'ONEDRIVE_DRIVE_ID', 'ONEDRIVE_FOLDER_ID', 'CLAMAV_HOST', 'CLAMAV_PORT']) if (!env[key]) throw new Error(`Missing production configuration: ${key}`);
  }
  if (config.NOTIFICATION_PROVIDER === 'graph' && (!config.M365_MAIL_TENANT_ID || !config.M365_MAIL_CLIENT_ID || !config.M365_MAIL_CLIENT_SECRET || !config.M365_NOTIFICATION_SENDER)) {
    throw new Error('Graph notifications require separate M365_MAIL credentials and M365_NOTIFICATION_SENDER');
  }
  return config;
}
