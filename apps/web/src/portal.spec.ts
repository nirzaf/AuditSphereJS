import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Portal } from './portal';
import { PortalAuthClient } from './portal-auth-client';

const auth = {
  login: vi.fn(),
  redeemInvitation: vi.fn(),
  me: vi.fn(),
  setFirstPassword: vi.fn(),
  completePasswordReset: vi.fn(),
  logout: vi.fn(),
};

describe('Client portal authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.login.mockReturnValue(of({ mustChangePassword: false }));
    auth.redeemInvitation.mockReturnValue(of({ mustChangePassword: true }));
    auth.me.mockReturnValue(of({ id: 'portal-user', email: 'client@example.test', mustChangePassword: false }));
    auth.setFirstPassword.mockReturnValue(of({ mustChangePassword: false }));
    auth.completePasswordReset.mockReturnValue(of({ passwordReset: true, signedOut: true }));
    auth.logout.mockReturnValue(of({ signedOut: true }));
    TestBed.configureTestingModule({ providers: [{ provide: PortalAuthClient, useValue: auth }] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('redeems an invitation, forces password setup, then clears local identity on sign out', async () => {
    auth.me.mockReturnValueOnce(of({ id: 'portal-user', email: 'client@example.test', mustChangePassword: true }))
      .mockReturnValueOnce(of({ id: 'portal-user', email: 'client@example.test', mustChangePassword: false }));
    const fixture = TestBed.createComponent(Portal);
    fixture.detectChanges();
    const invitationTab = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Use invitation')) as HTMLButtonElement;
    invitationTab.click();
    fixture.detectChanges();
    const codeInput = fixture.nativeElement.querySelector('#invitation-token') as HTMLInputElement;
    codeInput.value = 'a'.repeat(64);
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const continueButton = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Continue securely')) as HTMLButtonElement;
    continueButton.click();
    await vi.waitFor(() => expect(fixture.componentInstance.mode()).toBe('first-password'));
    fixture.detectChanges();
    expect(auth.redeemInvitation).toHaveBeenCalledWith('a'.repeat(64));
    expect(fixture.nativeElement.textContent).toContain('Set a new password');

    const password = fixture.nativeElement.querySelector('#new-password') as HTMLInputElement;
    password.value = 'LongEnoughPass123';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const setButton = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Set password')) as HTMLButtonElement;
    setButton.click();
    await vi.waitFor(() => expect(fixture.componentInstance.mode()).toBe('signed-in'));
    fixture.detectChanges();
    expect(auth.setFirstPassword).toHaveBeenCalledWith('LongEnoughPass123');
    expect(fixture.nativeElement.textContent).toContain('client@example.test');
    const signOut = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Sign out')) as HTMLButtonElement;
    signOut.click();
    await vi.waitFor(() => expect(fixture.componentInstance.mode()).toBe('login'));
    expect(fixture.componentInstance.identity()).toBeNull();
    expect(auth.logout).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('shows a non-enumerating sign-in error when credentials are rejected', async () => {
    auth.login.mockReturnValue(throwError(() => new Error('invalid credentials')));
    const fixture = TestBed.createComponent(Portal);
    fixture.detectChanges();
    fixture.componentInstance.loginModel.set({ email: 'client@example.test', password: 'wrong-password' });
    await fixture.componentInstance.signIn(new Event('submit'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('We could not sign you in.');
    expect(fixture.nativeElement.textContent).not.toContain('invalid credentials');
    fixture.destroy();
  });

  it('completes a one-time password reset and returns to sign in', async () => {
    const fixture = TestBed.createComponent(Portal);
    fixture.detectChanges();
    fixture.componentInstance.selectMode('reset-token');
    fixture.detectChanges();
    fixture.componentInstance.resetModel.set({ token: 'b'.repeat(64), password: 'ResetPassword123' });
    await fixture.componentInstance.completeReset(new Event('submit'));
    fixture.detectChanges();
    expect(auth.completePasswordReset).toHaveBeenCalledWith('b'.repeat(64), 'ResetPassword123');
    expect(fixture.componentInstance.mode()).toBe('login');
    expect(fixture.nativeElement.textContent).toContain('Password updated. You can now sign in');
    fixture.destroy();
  });
});
