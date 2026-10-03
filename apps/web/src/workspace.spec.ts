import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
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
  expect(fixture.nativeElement.textContent).toContain('Check the API connection and reload');
  expect(fixture.nativeElement.querySelector('practice-ledger')).toBeNull();
  expect(fixture.nativeElement.querySelector('#token')).toBeNull();
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
