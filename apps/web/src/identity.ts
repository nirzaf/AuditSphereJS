import { InjectionToken } from '@angular/core';
import { PublicClientApplication } from '@azure/msal-browser';
type PublicIdentity = { provider: 'entra' | 'development'; tenantId?: string; clientId?: string; scopes?: string[]; redirectUri?: string };
export type InternalIdentity = { id: string; email: string; active: boolean };
let scopes: string[] = [];
let clientReady: Promise<PublicClientApplication> | undefined;
let redirectReady: Promise<void> | undefined;
export async function identityConfiguration(): Promise<PublicIdentity> {
  const response = await fetch('/api/v1/identity/config');
  if (!response.ok) throw new Error('Identity configuration is unavailable');
  return response.json();
}
async function getClient(config: PublicIdentity) {
  if (config.provider !== 'entra' || !config.clientId || !config.tenantId || !config.scopes?.length || !config.redirectUri) throw new Error('Microsoft Entra sign-in is not configured');
  if (!clientReady) {
    const instance = new PublicClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: config.redirectUri, postLogoutRedirectUri: config.redirectUri }, cache: { cacheLocation: 'sessionStorage' } });
    clientReady = instance.initialize().then(() => { scopes = config.scopes!; return instance; });
  }
  return clientReady;
}
async function processRedirect(config: PublicIdentity) {
  const instance = await getClient(config);
  if (!redirectReady) redirectReady = instance.handleRedirectPromise().then(result => {
    if (result?.account) instance.setActiveAccount(result.account);
    else if (!instance.getActiveAccount()) {
      const accounts = instance.getAllAccounts();
      if (accounts.length === 1) instance.setActiveAccount(accounts[0]);
    }
  });
  await redirectReady;
  return instance;
}
export async function restoreSession(): Promise<InternalIdentity | null> {
  const config = await identityConfiguration();
  if (config.provider !== 'entra') return null;
  const instance = await processRedirect(config);
  if (!instance.getActiveAccount()) return null;
  return currentIdentity();
}
export async function signIn(): Promise<void> {
  const config = await identityConfiguration();
  const instance = await processRedirect(config);
  await instance.loginRedirect({ scopes });
}
export async function currentAccessToken() {
  const config = await identityConfiguration();
  const instance = await processRedirect(config);
  const account = instance.getActiveAccount();
  if (!account) throw new Error('Microsoft sign-in required');
  return (await instance.acquireTokenSilent({ scopes, account })).accessToken;
}
export async function currentIdentity(): Promise<InternalIdentity> {
  const response = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${await currentAccessToken()}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : 'Active internal identity is required');
  return result as InternalIdentity;
}
export async function signOut() {
  const config = await identityConfiguration();
  if (config.provider !== 'entra') return;
  const instance = await processRedirect(config);
  await instance.logoutRedirect({ account: instance.getActiveAccount(), postLogoutRedirectUri: config.redirectUri });
}

export const IDENTITY_ADAPTER = new InjectionToken('IDENTITY_ADAPTER', {
  providedIn: 'root',
  factory: () => ({ identityConfiguration, restoreSession, signIn, signOut, currentAccessToken, currentIdentity }),
});
