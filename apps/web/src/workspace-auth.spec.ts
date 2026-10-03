import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Workspace } from './workspace';
import { IDENTITY_ADAPTER } from './identity';
import { trialBalanceImportSchema, trialBalanceImportsSchema } from '@auditsphere/contracts';

const auth = { identityConfiguration: vi.fn(), restoreSession: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), revokeSessions: vi.fn(), currentAccessToken: vi.fn(), currentIdentity: vi.fn(), listReadableEngagements: vi.fn() };
const importFixture = trialBalanceImportSchema.parse({
  id: '11111111-1111-4111-8111-111111111111', status: 'QUEUED', error: null,
  rowCount: 0, version: 1, createdAt: '2026-10-03T00:00:00.000Z',
});

describe('Workspace Microsoft sign-in session', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: IDENTITY_ADAPTER, useValue: auth }] });
    auth.identityConfiguration.mockResolvedValue({ provider: 'entra' });
    auth.restoreSession.mockResolvedValue(null);
    auth.signIn.mockResolvedValue('access-token');
    auth.signOut.mockResolvedValue(undefined);
    auth.revokeSessions.mockResolvedValue(undefined);
    auth.currentAccessToken.mockResolvedValue('access-token');
    auth.currentIdentity.mockResolvedValue({ id: 'user-id', email: 'auditor@example.test', active: true });
    auth.listReadableEngagements.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); TestBed.resetTestingModule(); });

  it('checks the local identity and clears visible engagement data on sign out', async () => {
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
    await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(false));
    fixture.detectChanges();
    const view = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Sign in with Microsoft');
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign in with Microsoft')!.click();
    await vi.waitFor(() => expect(view.currentUser()?.email).toBe('auditor@example.test'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Signed in as auditor@example.test');
    expect(fixture.nativeElement.textContent).toContain('Sign out');
    view.imports.set([importFixture]);
    view.batch.set(importFixture);
    view.changes.set({ row: { rowId: 'row', expectedVersion: 1, fsli: 'Revenue' } });
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(false));
    fixture.detectChanges();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.revokeSessions).toHaveBeenCalledOnce();
    expect(auth.revokeSessions.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
    expect(view.currentUser()).toBeNull();
    expect(view.imports()).toEqual([]);
    expect(view.batch()).toBeNull();
    expect(view.dirty()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Server-side session revocation was confirmed');
    fixture.destroy();
  });

  it('restores an Entra session after the redirect without loading engagement records', async () => {
    auth.restoreSession.mockResolvedValueOnce({ id: 'user-id', email: 'auditor@example.test', active: true });
    auth.listReadableEngagements.mockResolvedValueOnce([{ id: 'engagement-a', name: 'FY26 audit', clientId: 'client-a', clientName: 'Example Ltd' }]);
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.signedIn()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Signed in as auditor@example.test');
    expect(fixture.nativeElement.textContent).toContain('Example Ltd · FY26 audit');
    expect(fixture.nativeElement.textContent).toContain('Choose an engagement');
    expect(fixture.componentInstance.imports()).toEqual([]);
    expect(fixture.nativeElement.querySelector('practice-ledger')).toBeNull();
    fixture.componentInstance.navigate('Practice', 'ledger');
    fixture.componentInstance.selectEngagement('engagement-a');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('practice-ledger')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Load ledger');
    fixture.destroy();
  });

  it('keeps the sign-in gate hidden until cached Microsoft identity restoration finishes', async () => {
    let completeRestore!: (value: { id: string; email: string; active: true } | null) => void;
    auth.restoreSession.mockReturnValueOnce(new Promise(resolve => { completeRestore = resolve; }));
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Checking your Microsoft session');
    expect(fixture.nativeElement.textContent).not.toContain('Sign in with Microsoft');

    completeRestore({ id: 'user-id', email: 'auditor@example.test', active: true });
    await vi.waitFor(() => expect(fixture.componentInstance.signedIn()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Signed in as auditor@example.test');
    expect(fixture.nativeElement.textContent).not.toContain('Sign in with Microsoft');
    fixture.destroy();
  });

  it('does not expose Practice actions or use a fixture ID before sign-in and assignment', async () => {
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
    await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(false));
    fixture.componentInstance.navigate('Practice', 'ledger');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('practice-ledger')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Sign in to continue');
    expect(fixture.nativeElement.textContent).not.toContain('00000000-0000-4000-8000-000000000002');
    expect(fixture.nativeElement.textContent).not.toContain('{"message":');
    fixture.destroy();
  });

  it('clears local access and data when Microsoft redirect logout cannot be confirmed', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('Popup closed'));
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
    await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(false));
    fixture.detectChanges();
    const view = fixture.componentInstance;
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign in with Microsoft')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(true));
    fixture.detectChanges();
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(false));
    fixture.detectChanges();
    expect(view.token).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Microsoft sign-out could not be confirmed');
    expect(auth.revokeSessions).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('still clears the local session when the server cannot confirm token revocation', async () => {
    auth.revokeSessions.mockRejectedValueOnce(new Error('API unavailable'));
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
    await vi.waitFor(() => expect(fixture.componentInstance.sessionRestoring()).toBe(false));
    fixture.detectChanges();
    const view = fixture.componentInstance;
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign in with Microsoft')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(true));
    fixture.detectChanges();

    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(false));
    fixture.detectChanges();

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(view.currentUser()).toBeNull();
    expect(view.imports()).toEqual([]);
    expect(view.dirty()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('server could not confirm session revocation');
    fixture.destroy();
  });

  it('rejects Trial Balance JSON that does not match the shared response contract', async () => {
    auth.identityConfiguration.mockResolvedValue({ provider: 'development' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'malformed' }]), { headers: { 'Content-Type': 'application/json' } })));
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('development'));

    await expect(fixture.componentInstance.api('', trialBalanceImportsSchema)).rejects.toThrow('did not match its contract');
    fixture.destroy();
  });
});
