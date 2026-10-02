import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { Practice } from './practice';

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

it('requires an audit reason and binds period close and reopen to the loaded version', async () => {
  const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ periods: [], accounts: [], journals: [], balances: [] })));
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(Practice);
  fixture.componentRef.setInput('token', 'practice-session');
  fixture.componentRef.setInput('engagementId', 'engagement-a');
  fixture.detectChanges();
  const view = fixture.componentInstance;
  view.ledger.set({ periods: [], accounts: [], journals: [], balances: [] });

  view.preparePeriodAction({ id: 'period-a', version: 4 }, 'close');
  view.submitPeriodAction();
  expect(request).not.toHaveBeenCalled();
  expect(view.periodReason.touched).toBe(true);

  view.periodReason.setValue('Reviewed month-end account balances.');
  view.submitPeriodAction();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/practice/periods/period-a/close');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ expectedVersion: 4, reason: 'Reviewed month-end account balances.' });
  expect(view.periodAction()).toBeNull();

  view.preparePeriodAction({ id: 'period-a', version: 5 }, 'reopen');
  view.periodReason.setValue('Approved correction requires a controlled reopen.');
  view.submitPeriodAction();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[2][0]).toBe('/api/v1/engagements/engagement-a/practice/periods/period-a/reopen');
  expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({ expectedVersion: 5, reason: 'Approved correction requires a controlled reopen.' });
  expect(view.message()).toContain('privileged authorization');
  fixture.destroy();
});
