import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? '.env' });

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--local-user-id', '--tenant-id', '--object-id', '--apply']);
  for (let index = 0; index < args.length;) {
    const name = args[index];
    if (!allowed.has(name)) throw new Error(`Unexpected or incomplete argument: ${name}`);
    if (name === '--apply') {
      index += 1;
      continue;
    }
    if (index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error(`Unexpected or incomplete argument: ${name}`);
    index += 2;
  }
  for (const name of ['--local-user-id', '--tenant-id', '--object-id']) {
    if (args.filter((value) => value === name).length !== 1) throw new Error(`Provide ${name} exactly once`);
  }
  if (args.filter((value) => value === '--apply').length > 1) throw new Error('Provide --apply at most once');

  const localUserId = option('--local-user-id');
  const tenantId = option('--tenant-id');
  const objectId = option('--object-id');
  const configuredTenant = process.env.M365_TENANT_ID;
  if (!configuredTenant) throw new Error('M365_TENANT_ID must be configured before mapping an Entra identity');
  if (configuredTenant.toLowerCase() !== tenantId.toLowerCase()) throw new Error('The requested tenant does not match configured M365_TENANT_ID');

  const input = { localUserId, tenantId, objectId };
  const [{ db }, { inspectEntraIdentityMapping, mapEntraIdentityToExistingUser }] = await Promise.all([
    import('../src/platform/db.js'),
    import('../src/platform/entra-user-mapping.js'),
  ]);
  disconnect = () => db.$disconnect();
  const plan = await inspectEntraIdentityMapping(input);
  if (plan.status === 'ALREADY_MAPPED') {
    console.log(`Identity is already mapped to local user ${plan.localUserId}; no change made.`);
    return;
  }

  if (!args.includes('--apply')) {
    console.log(`Dry run valid for active local user ${plan.localUserId}; no database change made. Add --apply to bind the immutable Entra identity.`);
    return;
  }

  const result = await mapEntraIdentityToExistingUser(input);
  console.log(result.changed ? `Mapped Entra identity to existing local user ${result.localUserId}. No memberships or role grants were created.` : `Identity is already mapped to local user ${result.localUserId}; no change made.`);
}

let disconnect: (() => Promise<void>) | undefined;
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Identity mapping failed');
  process.exitCode = 1;
}).finally(async () => await disconnect?.());
