import { Component, signal, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormField, email, form, minLength, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { PortalAuthClient } from './portal-auth-client.js';
import { PortalProposal } from './portal-proposal.js';

type PortalMode = 'login' | 'invitation' | 'reset-token' | 'first-password' | 'signed-in';

@Component({
  selector: 'client-portal',
  imports: [FormField, NgOptimizedImage, PortalProposal],
  template: `
    <a class="skip-link" href="#portal-content">Skip to client portal</a>
    <main class="portal-layout" id="portal-content" tabindex="-1">
      <section class="portal-card" aria-labelledby="portal-title">
        <img ngSrc="/ste-logo.avif" width="128" height="93" priority alt="STE — Salem Taleb Efaifa, Auditing and Consulting">
        <div class="eyebrow">AUDITSPHERE · CLIENT ACCESS</div>
        <h1 id="portal-title">Client portal</h1>
        <p>Your engagement documents and requests, in one secure workspace.</p>

        @if (mode() === 'login' || mode() === 'invitation' || mode() === 'reset-token') {
          <div class="portal-mode-switch" aria-label="Portal access method">
            <button type="button" [class.active]="mode() === 'login'" [attr.aria-pressed]="mode() === 'login'" (click)="selectMode('login')">Sign in</button>
            <button type="button" [class.active]="mode() === 'invitation'" [attr.aria-pressed]="mode() === 'invitation'" (click)="selectMode('invitation')">Use invitation</button>
          </div>
        }

        @if (mode() === 'login') {
          <form class="portal-form" (submit)="signIn($event)" novalidate>
            <label for="client-email">Email address</label>
            <input id="client-email" type="email" autocomplete="username" [formField]="loginForm.email">
            @if (loginForm.email().touched() && loginForm.email().invalid()) {
              <p class="field-error" id="email-error">Enter a valid email address.</p>
            }
            <label for="client-password">Password</label>
            <input id="client-password" type="password" autocomplete="current-password" [formField]="loginForm.password">
            <button class="primary" type="submit" [disabled]="busy() || loginForm().invalid()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
            <button class="portal-text-button" type="button" (click)="selectMode('reset-token')">Reset password with a one-time link</button>
          </form>
        } @else if (mode() === 'invitation') {
          <form class="portal-form" (submit)="redeem($event)" novalidate>
            <label for="invitation-token">Invitation code</label>
            <input id="invitation-token" type="text" autocomplete="one-time-code" [formField]="invitationForm.token" aria-describedby="invite-help">
            <p id="invite-help" class="field-help">Paste the one-time code supplied by your engagement team.</p>
            <button class="primary" type="submit" [disabled]="busy() || invitationForm().invalid()">{{ busy() ? 'Checking invitation…' : 'Continue securely' }}</button>
          </form>
        } @else if (mode() === 'reset-token') {
          <form class="portal-form" (submit)="completeReset($event)" novalidate>
            <p class="portal-callout">Enter the one-time reset code from your engagement team and choose a new password.</p>
            <label for="reset-token">Reset code</label>
            <input id="reset-token" type="text" autocomplete="one-time-code" [formField]="resetForm.token">
            <label for="reset-password">New password</label>
            <input id="reset-password" type="password" autocomplete="new-password" [formField]="resetForm.password">
            <p class="field-help">Use at least 12 characters.</p>
            <button class="primary" type="submit" [disabled]="busy() || resetForm().invalid()">{{ busy() ? 'Updating…' : 'Reset password' }}</button>
          </form>
        } @else if (mode() === 'first-password') {
          <form class="portal-form" (submit)="setFirstPassword($event)" novalidate>
            <p class="portal-callout">Set a new password to finish activating your client access.</p>
            <label for="new-password">New password</label>
            <input id="new-password" type="password" autocomplete="new-password" [formField]="passwordForm.password">
            <p class="field-help">Use at least 12 characters and include a number.</p>
            <button class="primary" type="submit" [disabled]="busy() || passwordForm().invalid()">{{ busy() ? 'Updating…' : 'Set password' }}</button>
          </form>
        } @else {
          <div class="portal-callout" role="status">
            <h2>Signed in</h2>
            <p>{{ identity()?.email }}</p>
            <p>Your secure session is active. Engagement requests appear here when your workspace is ready.</p>
          </div>
          <portal-proposal />
          <button class="secondary" type="button" [disabled]="busy()" (click)="signOut()">Sign out</button>
        }

        @if (error(); as message) { <p class="portal-error" role="alert">{{ message }}</p> }
        @if (notice(); as message) { <p class="portal-notice" role="status">{{ message }}</p> }
        <a class="portal-return" href="/">Return to the internal workspace</a>
      </section>
    </main>
  `,
})
export class Portal {
  private readonly auth = inject(PortalAuthClient);
  readonly mode = signal<PortalMode>('login');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly identity = signal<{ email: string } | null>(null);

  readonly loginModel = signal({ email: '', password: '' });
  readonly invitationModel = signal({ token: '' });
  readonly resetModel = signal({ token: '', password: '' });
  readonly passwordModel = signal({ password: '' });
  readonly loginForm = form(this.loginModel, (path) => { required(path.email); email(path.email); required(path.password); });
  readonly invitationForm = form(this.invitationModel, (path) => { required(path.token); minLength(path.token, 64); });
  readonly resetForm = form(this.resetModel, (path) => { required(path.token); minLength(path.token, 64); required(path.password); minLength(path.password, 12); });
  readonly passwordForm = form(this.passwordModel, (path) => { required(path.password); minLength(path.password, 12); });

  selectMode(mode: 'login' | 'invitation' | 'reset-token'): void {
    this.error.set('');
    this.notice.set('');
    this.mode.set(mode);
  }

  async completeReset(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.resetForm, { action: async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        await firstValueFrom(this.auth.completePasswordReset(this.resetModel().token.trim(), this.resetModel().password));
        this.resetModel.set({ token: '', password: '' });
        this.mode.set('login');
        this.notice.set('Password updated. You can now sign in with your new password.');
      } catch {
        this.error.set('We could not reset your password. The code may be expired or already used. Request a new reset code.');
      } finally { this.busy.set(false); }
    } });
  }

  async signIn(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.loginForm, { action: async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        await firstValueFrom(this.auth.login(this.loginModel().email, this.loginModel().password));
        const identity = await firstValueFrom(this.auth.me());
        this.identity.set(identity);
        this.mode.set(identity.mustChangePassword ? 'first-password' : 'signed-in');
      } catch {
        this.error.set('We could not sign you in. Check your details or use a current invitation.');
      } finally { this.busy.set(false); }
    } });
  }

  async redeem(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.invitationForm, { action: async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        await firstValueFrom(this.auth.redeemInvitation(this.invitationModel().token.trim()));
        const identity = await firstValueFrom(this.auth.me());
        this.identity.set(identity);
        this.mode.set('first-password');
        this.notice.set('Invitation accepted. Set your password to continue.');
      } catch {
        this.error.set('This invitation is invalid, expired, already used, or not yet available. Contact your engagement team.');
      } finally { this.busy.set(false); }
    } });
  }

  async setFirstPassword(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.passwordForm, { action: async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        await firstValueFrom(this.auth.setFirstPassword(this.passwordModel().password));
        const identity = await firstValueFrom(this.auth.me());
        this.identity.set(identity);
        this.mode.set('signed-in');
        this.notice.set('Password updated. Your previous session has been replaced.');
      } catch {
        this.error.set('We could not update your password. Refresh your invitation and try again.');
      } finally { this.busy.set(false); }
    } });
  }

  async signOut(): Promise<void> {
    this.busy.set(true);
    try { await firstValueFrom(this.auth.logout()); } catch { /* local state still clears if the server is unavailable */ }
    this.identity.set(null);
    this.loginModel.set({ email: '', password: '' });
    this.mode.set('login');
    this.busy.set(false);
  }
}
