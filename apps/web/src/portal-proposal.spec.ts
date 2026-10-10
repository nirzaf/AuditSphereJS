import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PortalProposal } from './portal-proposal';
const id = '11111111-1111-4111-8111-111111111111';
const proposal = { id, engagementId: '22222222-2222-4222-8222-222222222222', revision: 3, status: 'PRESENTED', service: 'Statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '12500.25', currency: 'QAR' };
beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
afterEach(() => { TestBed.inject(HttpTestingController).verify(); document.cookie = 'auditsphere_portal_csrf=; Path=/; Max-Age=0'; TestBed.resetTestingModule(); });

it('reviews exact server terms, requires acknowledgement and sends one CSRF-bound acceptance', async () => {
  const fixture = TestBed.createComponent(PortalProposal);
  const view = fixture.componentInstance;
  view.model.set({ proposalId: id, token: 'a'.repeat(64) }); fixture.detectChanges();
  const load = view.load();
  TestBed.inject(HttpTestingController).expectOne(`/api/v1/portal/proposals/${id}`).flush(proposal);
  await load; fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('12500.25 QAR');
  await view.accept(); TestBed.inject(HttpTestingController).expectNone(`/api/v1/portal/proposals/${id}/accept`);
  view.acknowledged.set(true); document.cookie = 'auditsphere_portal_csrf=csrf-fixture; Path=/';
  const acceptance = view.accept(); void view.accept();
  const request = TestBed.inject(HttpTestingController).expectOne(`/api/v1/portal/proposals/${id}/accept`);
  expect(request.request.headers.get('x-csrf-token')).toBe('csrf-fixture');
  expect(request.request.body).toMatchObject({ token: 'a'.repeat(64), expectedVersion: 3 });
  request.flush({ id, revision: 3, status: 'ACCEPTED' }); await acceptance; fixture.detectChanges();
  expect(view.model().token).toBe(''); expect(view.proposal()?.status).toBe('ACCEPTED');
  expect(fixture.nativeElement.textContent).toContain('Your acceptance has been recorded'); fixture.destroy();
});

it('does not show proposal terms or raw provider errors after an access denial', async () => {
  const fixture = TestBed.createComponent(PortalProposal); const view = fixture.componentInstance;
  view.model.set({ proposalId: id, token: '' }); fixture.detectChanges();
  const loading = view.load();
  TestBed.inject(HttpTestingController).expectOne(`/api/v1/portal/proposals/${id}`).flush({ message: 'private diagnostic' }, { status: 403, statusText: 'Forbidden' });
  await loading; fixture.detectChanges();
  expect(view.proposal()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('unavailable for your account');
  expect(fixture.nativeElement.textContent).not.toContain('private diagnostic'); fixture.destroy();
});
