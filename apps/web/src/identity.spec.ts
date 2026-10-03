import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const msal = vi.hoisted(() => ({
  initialize: vi.fn(),
  handleRedirectPromise: vi.fn(),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn(),
  getAllAccounts: vi.fn(),
  acquireTokenSilent: vi.fn(),
  loginRedirect: vi.fn(),
  logoutRedirect: vi.fn(),
}));

vi.mock('@azure/msal-browser', () => ({ PublicClientApplication: vi.fn(function PublicClientApplication() { return msal; }) }));

const config = { provider: 'entra', tenantId: 'tenant', clientId: 'client', scopes: ['api://api/access_as_user'], redirectUri: 'http://localhost:4200' };
const account = { username: 'auditor@example.test' };

describe('MSAL redirect adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    msal.initialize.mockResolvedValue(undefined);
    msal.handleRedirectPromise.mockResolvedValue(null);
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([]);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'access-token' });
    msal.loginRedirect.mockResolvedValue(undefined);
    msal.logoutRedirect.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('processes a returned authorization response before checking the local identity', async () => {
    msal.handleRedirectPromise.mockResolvedValue({ account });
    msal.getActiveAccount.mockReturnValue(account);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'local-user', email: 'auditor@example.test', active: true })));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.restoreSession()).resolves.toEqual({ id: 'local-user', email: 'auditor@example.test', active: true });

    expect(msal.initialize).toHaveBeenCalledOnce();
    expect(msal.handleRedirectPromise).toHaveBeenCalledOnce();
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({ scopes: config.scopes, account });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/identity/config', '/api/v1/identity/config', '/api/v1/me',
    ]);
  });

  it('uses redirect login and logout APIs without opening a popup', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(config)))));
    const identity = await import('./identity');

    await identity.signIn();
    await identity.signOut();

    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: config.scopes, prompt: 'select_account' });
    expect(msal.logoutRedirect).toHaveBeenCalledWith({ account, postLogoutRedirectUri: config.redirectUri });
    expect(msal).not.toHaveProperty('loginPopup');
    expect(msal).not.toHaveProperty('logoutPopup');
  });

  it('turns an unmapped or inactive staff identity into actionable, non-technical guidance', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 401, message: { message: 'Internal authentication required', error: 'Unauthorized', statusCode: 401 } },
      }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.currentIdentity()).rejects.toThrow(/verify your local Entra identity mapping/);
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({ scopes: config.scopes, account });
  });

  it('requests a typed list of engagements through the current access token', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    const items = [{ id: 'engagement-a', name: 'FY26 audit', clientId: 'client-a', clientName: 'Example Ltd' }];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify(items))));
    const identity = await import('./identity');

    await expect(identity.listReadableEngagements()).resolves.toEqual(items);
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/me/engagements', { headers: { Authorization: 'Bearer access-token' } });
  });
});
