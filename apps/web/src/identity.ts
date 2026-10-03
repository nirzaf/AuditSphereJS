import { InjectionToken } from '@angular/core';
import { PublicClientApplication } from '@azure/msal-browser';
import {
  identityConfigurationSchema,
  internalIdentitySchema,
  readableEngagementsSchema,
  sessionRevocationResponseSchema,
} from '@auditsphere/contracts';
import type { IdentityConfiguration, InternalIdentity, ReadableEngagement } from '@auditsphere/contracts';
import { ApiContractError, requestAuthenticatedContractJson, requestContractJson } from './api-client';
export type { InternalIdentity, ReadableEngagement } from '@auditsphere/contracts';
let scopes: string[] = [];
let clientReady: Promise<PublicClientApplication> | undefined;
let redirectReady: Promise<void> | undefined;
export async function identityConfiguration(): Promise<IdentityConfiguration> {
  return requestContractJson('/api/v1/identity/config', identityConfigurationSchema)
    .catch(() => { throw new Error('Identity configuration is unavailable'); });
}
async function getClient(config: IdentityConfiguration) {
  if (config.provider !== 'entra' || !config.clientId || !config.tenantId || !config.scopes?.length || !config.redirectUri) throw new Error('Microsoft Entra sign-in is not configured');
  if (!clientReady) {
    const instance = new PublicClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: config.redirectUri, postLogoutRedirectUri: config.redirectUri }, cache: { cacheLocation: 'sessionStorage' } });
    clientReady = instance.initialize().then(() => { scopes = config.scopes!; return instance; });
  }
  return clientReady;
}
async function processRedirect(config: IdentityConfiguration) {
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
/** Process an Entra redirect before Angular Router can consume or rewrite its response fragment. */
export async function prepareIdentityRedirect(): Promise<void> {
  try {
    const config = await identityConfiguration();
    if (config.provider === 'entra') await processRedirect(config);
  } catch {
    // Keep startup available so Workspace can render its normal identity-configuration error state.
  }
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
  await instance.loginRedirect({ scopes, prompt: 'select_account' });
}
export async function currentAccessToken(forceRefresh = false) {
  const config = await identityConfiguration();
  const instance = await processRedirect(config);
  const account = instance.getActiveAccount();
  if (!account) throw new Error('Microsoft sign-in required');
  return (await instance.acquireTokenSilent({ scopes, account, ...(forceRefresh ? { forceRefresh: true } : {}) })).accessToken;
}
export async function currentIdentity(): Promise<InternalIdentity> {
  try {
    return await requestAuthenticatedContractJson('/api/v1/me', internalIdentitySchema, undefined, currentAccessToken);
  } catch (error) {
    if (error instanceof ApiContractError && error.status === 401) {
      const reference = error.correlationId ? ` Reference: ${error.correlationId}.` : '';
      throw new Error(`AuditSphere could not confirm an active staff identity for this Microsoft sign-in. Refresh the Microsoft session and sign in with the designated staff account; if the problem persists, ask an administrator to verify its local Entra identity mapping.${reference}`);
    }
    if (error instanceof ApiContractError) throw new Error(error.message || `AuditSphere identity check failed (HTTP ${error.status}).`);
    throw error;
  }
}
export async function listReadableEngagements(): Promise<ReadableEngagement[]> {
  try {
    return await requestAuthenticatedContractJson('/api/v1/me/engagements', readableEngagementsSchema, undefined, currentAccessToken);
  } catch (error) {
    if (!(error instanceof ApiContractError)) throw error;
    const reference = error.correlationId ? ` Reference: ${error.correlationId}.` : '';
    throw new Error(error.status === 401
      ? `Your Microsoft session is no longer active. Sign in again to refresh your engagement access.${reference}`
      : error.message || `Assigned engagements could not be loaded (HTTP ${error.status}).`);
  }
}
/** Persist the Entra API-token cutoff before clearing the browser's local identity. */
export async function revokeSessions(): Promise<void> {
  try {
    await requestAuthenticatedContractJson('/api/v1/me/revoke-sessions', sessionRevocationResponseSchema, { method: 'POST' }, currentAccessToken);
  } catch {
    throw new Error('The server could not confirm session revocation.');
  }
}
export async function signOut() {
  const config = await identityConfiguration();
  if (config.provider !== 'entra') return;
  const instance = await processRedirect(config);
  await instance.logoutRedirect({ account: instance.getActiveAccount(), postLogoutRedirectUri: config.redirectUri });
}

export const IDENTITY_ADAPTER = new InjectionToken('IDENTITY_ADAPTER', {
  providedIn: 'root',
  factory: () => ({ identityConfiguration, restoreSession, signIn, signOut, revokeSessions, currentAccessToken, currentIdentity, listReadableEngagements }),
});
