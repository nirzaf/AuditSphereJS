import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Workspace } from './workspace';
import { IDENTITY_ADAPTER } from './identity';
import { afterEach, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
it('exposes only the five real business workspaces without demo messaging', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

  const moduleButtons = [...fixture.nativeElement.querySelectorAll('nav[aria-label="Business modules"] button')]
    .map((element: HTMLButtonElement) => element.textContent.trim().replace(/\s+/g, ' '));
  expect(moduleButtons).toEqual(['Commercial→', 'Governance→', 'Fieldwork03', 'Reporting→', 'Practice→']);
  expect(fixture.nativeElement.textContent).not.toContain('SIMULATION PROTOTYPE');
  expect(fixture.nativeElement.textContent).not.toContain('Synthetic records');
  fixture.destroy();
});
it('shows the selected-engagement state instead of asking the user to select again', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await fixture.whenStable();
  const view = fixture.componentInstance;
  view.identityProvider.set('entra');
  view.signedIn.set(true);
  const engagementId = '11111111-1111-4111-8111-111111111111';
  view.readableEngagements.set([{ id: engagementId, name: 'Acceptance engagement', clientId: '22222222-2222-4222-8222-222222222222', clientName: 'Acceptance client', version: 1 }]);
  view.selectEngagement(engagementId);
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('Engagement selected. The server checks your access again for every request.');
  expect(fixture.nativeElement.textContent).not.toContain('Choose an engagement to continue;');

  view.selectEngagement('');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Choose an engagement to continue;');
  fixture.destroy();
});
it('replaces the retired Simulation URL with the real Fieldwork workspace', async () => {
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({ providers: [
    { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ module: 'Simulation', view: 'simulation' })) } },
    { provide: Router, useValue: { navigate } },
  ] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

  expect(fixture.componentInstance.active()).toBe('Fieldwork');
  expect(fixture.componentInstance.screenId()).toBe('trial-balance');
  expect(navigate).toHaveBeenCalledWith([], { queryParams: { module: 'Fieldwork', view: 'trial-balance' }, replaceUrl: true });
  expect(fixture.nativeElement.textContent).not.toContain('SIMULATION PROTOTYPE');
  fixture.destroy();
});
it('keeps the browser title aligned with the workspace and avoids duplicate report status', async () => {
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({ providers: [
    { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ module: 'Practice', view: 'profit-loss' })) } },
    { provide: Router, useValue: { navigate } },
  ] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const title = TestBed.inject(Title);

  expect(title.getTitle()).toBe('Monthly Profit & Loss | Practice | AuditSphere');
  expect(fixture.nativeElement.querySelector('p.notice')).toBeNull();

  fixture.componentInstance.navigate('Reporting', 'templates');
  fixture.detectChanges();
  expect(title.getTitle()).toBe('Document templates | Reporting | AuditSphere');
  expect(fixture.nativeElement.querySelector('p.notice')).not.toBeNull();
  fixture.destroy();
});
it('prevents paging away from unsaved mappings and discards explicitly', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('development')); fixture.detectChanges();
  const view = fixture.componentInstance;
  view.changes.set({ row: { rowId: 'row', expectedVersion: 1, fsli: 'Revenue' } });
  view.page(200);
  expect(view.offset).toBe(0);
  expect(view.message()).toContain('Save or discard');
  fixture.detectChanges();
  const button = [...fixture.nativeElement.querySelectorAll('button')].find((element: HTMLButtonElement) => element.textContent === 'Discard');
  button.click(); expect(view.dirty()).toBe(0);
  fixture.destroy();
});
it('shows row lease owner and expiry while keeping database conflict checks visible during Redis outage', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('development')); fixture.detectChanges();
  const view = fixture.componentInstance;
  const rowId = '33333333-3333-4333-8333-333333333333';
  view.batch.set({ id: '44444444-4444-4444-8444-444444444444', status: 'MAPPING_REQUIRED', error: null, rowCount: 1, version: 1, createdAt: new Date().toISOString() });
  view.rows.set([{ id: rowId, code: '4000', name: 'Sales', current: '10.000000', prior: '9.000000', fsli: null, version: 1 }]);
  view.rowLeases.set({ [rowId]: { available: true, action: 'status', lease: {
    userId: '55555555-5555-4555-8555-555555555555', displayName: 'Other auditor', expiresAt: new Date(Date.now() + 60_000).toISOString(), ownedByCurrentUser: false,
  } } });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Other auditor is editing');
  expect(fixture.nativeElement.textContent).toContain('Database checks remain active.');

  view.rowLeases.set({ [rowId]: { available: false, action: 'status', reason: 'REDIS_UNAVAILABLE' } });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Shared presence unavailable; save still checks the database version.');
  fixture.destroy();
});
it('releases held Trial Balance row leases when leaving the workspace', async () => {
  const rowId = '33333333-3333-4333-8333-333333333333';
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const payload = String(input).includes('/rows/')
      ? { available: true, action: 'release', lease: null }
      : { provider: 'development' };
    return Promise.resolve(new Response(JSON.stringify(payload)));
  });
  vi.stubGlobal('fetch', fetchMock);
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('development'));
  const view = fixture.componentInstance;
  view.batch.set({ id: '44444444-4444-4444-8444-444444444444', status: 'MAPPING_REQUIRED', error: null, rowCount: 1, version: 1, createdAt: new Date().toISOString() });
  view.rowLeaseTokens.set({ [rowId]: '55555555-5555-4555-8555-555555555555' });

  view.navigate('Commercial', 'leads');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/rows/${rowId}/lease`), expect.objectContaining({ method: 'POST' })));
  const releaseRequest = fetchMock.mock.calls.find(([url]) => String(url).includes(`/rows/${rowId}/lease`));
  expect(JSON.parse((releaseRequest?.[1] as RequestInit).body as string)).toEqual({ action: 'release', token: '55555555-5555-4555-8555-555555555555' });
  fixture.destroy();
});
it('hides development token entry when Microsoft identity is selected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    provider: 'entra', tenantId: 'tenant', clientId: 'client',
    scopes: ['api://api/access_as_user'], redirectUri: 'http://localhost:4200',
  }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra')); fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('#token')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Sign in with Microsoft');
  fixture.destroy();
});
it('keeps the workspace signed out when Microsoft sign-in has no active local identity', async () => {
  const identity = {
    identityConfiguration: vi.fn().mockResolvedValue({ provider: 'entra' }),
    restoreSession: vi.fn().mockResolvedValue(null),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    currentIdentity: vi.fn().mockRejectedValue(new Error('AuditSphere could not confirm an active staff identity for this Microsoft sign-in.')),
    currentAccessToken: vi.fn().mockResolvedValue('access-token'),
    listReadableEngagements: vi.fn().mockResolvedValue([]),
  };
  TestBed.configureTestingModule({ providers: [{ provide: IDENTITY_ADAPTER, useValue: identity }] });
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));

  fixture.componentInstance.microsoftSignIn();
  await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
  fixture.detectChanges();

  expect(identity.currentIdentity).toHaveBeenCalledOnce();
  expect(fixture.componentInstance.signedIn()).toBe(false);
  expect(fixture.componentInstance.currentUser()).toBeNull();
  expect(fixture.componentInstance.message()).toContain('active staff identity');
  expect(fixture.nativeElement.textContent).toContain('active AuditSphere staff identity');
  fixture.destroy();
});
it('fails closed with a clear message when identity configuration cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Bad Gateway')));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('unavailable'));
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('Workspace access is unavailable');
  expect(fixture.nativeElement.textContent).toContain('Check the API connection, then retry');
  expect(fixture.nativeElement.textContent).toContain('Retry API connection');
  expect(fixture.nativeElement.querySelector('practice-ledger')).toBeNull();
  expect(fixture.nativeElement.querySelector('#token')).toBeNull();
  fixture.destroy();
});
it('recovers identity configuration through an in-app retry after a temporary API outage', async () => {
  const identity = {
    identityConfiguration: vi.fn()
      .mockRejectedValueOnce(new Error('Bad Gateway'))
      .mockResolvedValueOnce({ provider: 'entra' }),
    restoreSession: vi.fn().mockResolvedValue(null),
    signIn: vi.fn(), signOut: vi.fn(), revokeSessions: vi.fn(), currentAccessToken: vi.fn(),
    currentIdentity: vi.fn(), listReadableEngagements: vi.fn(),
  };
  TestBed.configureTestingModule({ providers: [{ provide: IDENTITY_ADAPTER, useValue: identity }] });
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('unavailable'));
  fixture.detectChanges();

  const retry = [...fixture.nativeElement.querySelectorAll('button')]
    .find((element: HTMLButtonElement) => element.textContent.trim() === 'Retry API connection');
  expect(retry).toBeTruthy();
  retry!.click();
  await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
  await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(false));
  fixture.detectChanges();

  expect(identity.identityConfiguration).toHaveBeenCalledTimes(2);
  expect(identity.restoreSession).toHaveBeenCalledOnce();
  expect(fixture.nativeElement.textContent).toContain('Sign in to continue');
  fixture.destroy();
});
it('does not confuse an engagement-list outage with an empty assignment list', async () => {
  const identity = {
    identityConfiguration: vi.fn().mockResolvedValue({ provider: 'entra' }),
    restoreSession: vi.fn().mockResolvedValue({ id: 'user-a', email: 'auditor@example.test', active: true }),
    signIn: vi.fn(), signOut: vi.fn(), currentIdentity: vi.fn(), currentAccessToken: vi.fn(),
    listReadableEngagements: vi.fn().mockRejectedValue(new Error('Assigned engagements could not be loaded (HTTP 502).')),
  };
  TestBed.configureTestingModule({ providers: [{ provide: IDENTITY_ADAPTER, useValue: identity }] });
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.engagementLoadError()).toContain('HTTP 502'));
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('Assignments could not be verified');
  expect(fixture.nativeElement.textContent).not.toContain('No readable engagement is assigned');
  expect(fixture.nativeElement.querySelector('practice-ledger')).toBeNull();
  fixture.destroy();
});
