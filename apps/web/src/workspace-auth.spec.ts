import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Workspace } from './workspace';
import { IDENTITY_ADAPTER } from './identity';

const auth = { identityConfiguration: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), currentAccessToken: vi.fn(), currentIdentity: vi.fn() };

describe('Workspace Microsoft sign-in session', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: IDENTITY_ADAPTER, useValue: auth }] });
    auth.identityConfiguration.mockResolvedValue({ provider: 'entra' });
    auth.signIn.mockResolvedValue('access-token');
    auth.signOut.mockResolvedValue(undefined);
    auth.currentAccessToken.mockResolvedValue('access-token');
    auth.currentIdentity.mockResolvedValue({ id: 'user-id', email: 'auditor@example.test', active: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); TestBed.resetTestingModule(); });

  it('checks the local identity and clears visible engagement data on sign out', async () => {
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
    fixture.detectChanges();
    const view = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Sign in with Microsoft');
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign in with Microsoft')!.click();
    await vi.waitFor(() => expect(view.currentUser()?.email).toBe('auditor@example.test'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Signed in as auditor@example.test');
    expect(fixture.nativeElement.textContent).toContain('Sign out');
    view.imports.set([{ id: 'private-engagement-record' }]);
    view.batch.set({ id: 'private-import' });
    view.changes.set({ row: { rowId: 'row', expectedVersion: 1, fsli: 'Revenue' } });
    [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(view.signedIn()).toBe(false));
    fixture.detectChanges();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(view.currentUser()).toBeNull();
    expect(view.imports()).toEqual([]);
    expect(view.batch()).toBeNull();
    expect(view.dirty()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Signed out.');
    fixture.destroy();
  });

  it('clears local access and data when Microsoft popup logout cannot be confirmed', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('Popup closed'));
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra'));
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
    fixture.destroy();
  });
});
