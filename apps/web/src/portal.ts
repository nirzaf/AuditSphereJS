import { Component } from '@angular/core';
@Component({ selector: 'client-portal', template: `
  <a class="skip-link" href="#portal-content">Skip to client portal</a>
  <main class="portal-layout" id="portal-content" tabindex="-1">
    <section class="portal-card" aria-labelledby="portal-title">
      <img src="/ste-logo.avif" width="128" height="93" alt="STE — Salem Taleb Efaifa, Auditing and Consulting">
      <div class="eyebrow">AUDITSPHERE</div><h1 id="portal-title">Client portal</h1>
      <p>Your engagement documents and requests, in one secure workspace.</p>
      <div class="portal-form"><label for="client-email">Email address</label><input id="client-email" type="email" autocomplete="username" disabled><label for="client-password">Password</label><input id="client-password" type="password" autocomplete="current-password" disabled><button class="primary" disabled>Sign in</button></div>
      <p role="status">Client portal access is not enabled in this environment. Your engagement team will provide an invitation when access is available.</p>
      <a href="/">Return to the internal workspace</a>
    </section>
  </main>
` })
export class Portal {}
