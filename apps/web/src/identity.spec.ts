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
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'local-user', email: 'auditor@example.test', active: true, passwordHash: 'never-expose' })));
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

  it('processes Entra redirects during application initialization', async () => {
    msal.handleRedirectPromise.mockResolvedValue({ account });
    msal.setActiveAccount.mockImplementation((value) => msal.getActiveAccount.mockReturnValue(value));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(config)))));
    const identity = await import('./identity');

    await identity.prepareIdentityRedirect();

    expect(msal.initialize).toHaveBeenCalledOnce();
    expect(msal.handleRedirectPromise).toHaveBeenCalledOnce();
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
    expect(msal.getActiveAccount()).toBe(account);
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
        error: { code: 'UNAUTHENTICATED', status: 401, message: { message: 'Internal authentication required', error: 'Unauthorized', statusCode: 401 }, correlationId: 'identity-failure-123' },
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'UNAUTHENTICATED', status: 401, message: { message: 'Internal authentication required', error: 'Unauthorized', statusCode: 401 }, correlationId: 'identity-failure-123' },
      }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.currentIdentity()).rejects.toThrow(/verify its local Entra identity mapping\. Reference: identity-failure-123/);
    expect(msal.acquireTokenSilent).toHaveBeenNthCalledWith(1, { scopes: config.scopes, account });
    expect(msal.acquireTokenSilent).toHaveBeenNthCalledWith(2, { scopes: config.scopes, account, forceRefresh: true });
  });

  it('refreshes a cached token once after a 401 and accepts the active mapped identity', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'UNAUTHENTICATED', status: 401, message: { message: 'Internal authentication required', error: 'Unauthorized', statusCode: 401 } },
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'local-user', email: 'auditor@example.test', active: true })));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.currentIdentity()).resolves.toEqual({ id: 'local-user', email: 'auditor@example.test', active: true });

    expect(msal.acquireTokenSilent).toHaveBeenNthCalledWith(1, { scopes: config.scopes, account });
    expect(msal.acquireTokenSilent).toHaveBeenNthCalledWith(2, { scopes: config.scopes, account, forceRefresh: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/identity/config', '/api/v1/me', '/api/v1/identity/config', '/api/v1/me',
    ]);
  });

  it('fails closed when an identity payload does not match its shared response contract', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'local-user', email: 'auditor@example.test', active: 'yes' }))));
    const identity = await import('./identity');

    await expect(identity.currentIdentity()).rejects.toThrow('did not match its contract');
  });

  it('requests a typed list of engagements through the current access token', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    const items = [{ id: 'engagement-a', name: 'FY26 audit', clientId: 'client-a', clientName: 'Example Ltd', version: 4 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify(items)));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.listReadableEngagements()).resolves.toEqual(items);
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/api/v1/me/engagements');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('persists the Entra session cutoff with the current access token', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revokedBefore: '2026-10-03T00:00:00.000Z' })));
    vi.stubGlobal('fetch', fetchMock);
    const identity = await import('./identity');

    await expect(identity.revokeSessions()).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/api/v1/me/revoke-sessions');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('does not claim session revocation when the API rejects the request', async () => {
    msal.getActiveAccount.mockReturnValue(account);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Internal authentication required' }), { status: 401 })));
    const identity = await import('./identity');

    await expect(identity.revokeSessions()).rejects.toThrow('The server could not confirm session revocation.');
  });
});
