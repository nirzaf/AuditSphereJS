import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  portalAuthResultSchema,
  portalFirstPasswordRequestSchema,
  portalIdentitySchema,
  portalInvitationRedeemRequestSchema,
  portalLoginRequestSchema,
  portalLogoutResultSchema,
  portalPasswordResetRequestSchema,
  portalPasswordResetResultSchema,
} from '@auditsphere/contracts';
import type {
  PortalAuthResult,
  PortalIdentity,
  PortalLogoutResult,
  PortalPasswordResetResult,
} from '@auditsphere/contracts';
import type { z } from 'zod';
import { map, type Observable } from 'rxjs';
import { parseContractValue } from './api-client';

@Injectable({ providedIn: 'root' })
export class PortalAuthClient {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/portal/auth';

  login(email: string, password: string): Observable<PortalAuthResult> {
    const body = portalLoginRequestSchema.parse({ email, password });
    return this.post(this.base + '/login', body, portalAuthResultSchema);
  }

  redeemInvitation(token: string): Observable<PortalAuthResult> {
    const body = portalInvitationRedeemRequestSchema.parse({ token });
    return this.post(this.base + '/invitations/redeem', body, portalAuthResultSchema);
  }

  me(): Observable<PortalIdentity> {
    return this.http.get<unknown>(this.base + '/me', { withCredentials: true }).pipe(
      map((payload) => parseContractValue(portalIdentitySchema, payload)),
    );
  }

  setFirstPassword(password: string): Observable<PortalAuthResult> {
    const body = portalFirstPasswordRequestSchema.parse({ password });
    const csrf = this.cookie('auditsphere_portal_csrf');
    return this.post(this.base + '/first-password', body, portalAuthResultSchema, new HttpHeaders({ 'x-csrf-token': csrf }));
  }

  completePasswordReset(token: string, password: string): Observable<PortalPasswordResetResult> {
    const body = portalPasswordResetRequestSchema.parse({ token, password });
    return this.post(this.base + '/password-reset/complete', body, portalPasswordResetResultSchema);
  }

  logout(): Observable<PortalLogoutResult> {
    const csrf = this.cookie('auditsphere_portal_csrf');
    return this.post(this.base + '/logout', {}, portalLogoutResultSchema, new HttpHeaders({ 'x-csrf-token': csrf }));
  }

  private post<TSchema extends z.ZodType>(
    url: string,
    body: unknown,
    schema: TSchema,
    headers?: HttpHeaders,
  ): Observable<z.output<TSchema>> {
    return this.http.post<unknown>(url, body, { withCredentials: true, ...(headers ? { headers } : {}) }).pipe(
      map((payload) => parseContractValue(schema, payload)),
    );
  }

  private cookie(name: string): string {
    const prefix = name + '=';
    const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }
}
