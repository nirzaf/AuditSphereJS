import { InjectionToken } from '@angular/core';
import { PublicClientApplication } from '@azure/msal-browser';
type PublicIdentity = { provider: 'entra' | 'development'; tenantId?: string; clientId?: string; scopes?: string[]; redirectUri?: string };
export type InternalIdentity = { id: string; email: string; active: boolean };
let client: PublicClientApplication | undefined;
let scopes: string[] = [];
export async function identityConfiguration(): Promise<PublicIdentity> {
  const response = await fetch('/api/v1/identity/config');
  if (!response.ok) throw new Error('Identity configuration is unavailable');
  return response.json();
}
export async function signIn() {
  const config = await identityConfiguration();
  if (config.provider !== 'entra' || !config.clientId || !config.tenantId || !config.scopes?.length || !config.redirectUri) throw new Error('Microsoft Entra sign-in is not configured');
  if (!client) {
    client = new PublicClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: config.redirectUri }, cache: { cacheLocation: 'sessionStorage' } });
    await client.initialize(); scopes = config.scopes;
  }
  const result = await client.loginPopup({ scopes });
  client.setActiveAccount(result.account);
  return result.accessToken;
}
export async function currentAccessToken() {
  const account = client?.getActiveAccount();
  if (!client || !account) throw new Error('Microsoft sign-in required');
  return (await client.acquireTokenSilent({ scopes, account })).accessToken;
}
export async function currentIdentity(): Promise<InternalIdentity> {
  const response = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${await currentAccessToken()}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : 'Active internal identity is required');
  return result as InternalIdentity;
}
export async function signOut() {
  if (!client) return;
  const account = client.getActiveAccount();
  try {
    await client.logoutPopup({ account });
  } finally {
    client.setActiveAccount(null);
    client = undefined;
    scopes = [];
  }
}

export const IDENTITY_ADAPTER = new InjectionToken('IDENTITY_ADAPTER', {
  providedIn: 'root',
  factory: () => ({ identityConfiguration, signIn, signOut, currentAccessToken, currentIdentity }),
});
