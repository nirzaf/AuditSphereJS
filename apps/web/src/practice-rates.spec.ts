import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { practiceJobGrades } from '@auditsphere/contracts';
import { PracticeRates } from './practice-rates';

const engagementId = '00000000-0000-4000-8000-000000000010';
const activeStaffId = '00000000-0000-4000-8000-000000000011';
const rateId = '00000000-0000-4000-8000-000000000012';
const assignmentId = '00000000-0000-4000-8000-000000000013';

const rate = (overrides: Record<string, unknown> = {}) => ({
  id: rateId, grade: 'ENGAGEMENT_PARTNER', currency: 'QAR', hourlyRate: '1000.000000',
  effectiveFrom: '2000-01-01', effectiveTo: null, version: 1, createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const assignment = (overrides: Record<string, unknown> = {}) => ({
  id: assignmentId, userId: activeStaffId, email: 'preparer@example.test', accessRole: 'PREPARER',
  grade: 'AUDIT_ASSOCIATE', effectiveFrom: '2026-01-01', effectiveTo: null, version: 1,
  createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
});

const administration = (overrides: Record<string, unknown> = {}) => ({
  currency: 'QAR', jobGrades: [...practiceJobGrades], rateCards: [rate()],
  staff: [
    { id: activeStaffId, email: 'preparer@example.test', accessRole: 'PREPARER', active: true },
    { id: '00000000-0000-4000-8000-000000000014', email: 'inactive@example.test', accessRole: 'PREPARER', active: false },
  ], assignments: [], ...overrides,
});

function create(request: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(PracticeRates);
  fixture.componentRef.setInput('token', 'staff-session');
  fixture.componentRef.setInput('engagementId', engagementId);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

it('loads rate history and active staff while keeping access roles separate from professional grades', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(administration())));
  const fixture = create(request);
  const view = fixture.componentInstance;
  await vi.waitFor(() => expect(view.loaded()).toBe(true));
  fixture.detectChanges();

  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe('/api/v1/firm/practice/rate-cards');
  expect(view.activeStaff().map(person => person.email)).toEqual(['preparer@example.test']);
  expect(fixture.nativeElement.textContent).toContain('Rate-card administration');
  expect(fixture.nativeElement.textContent).toContain('Job grade controls charge-out pricing; it does not change application permissions.');
  expect(fixture.nativeElement.textContent).toContain('PREPARER');
  expect(fixture.nativeElement.textContent).toContain('1000.000000');
  fixture.destroy();
});

it('schedules a future decimal rate against the latest rate version and reloads confirmed history', async () => {
  const revised = rate({ hourlyRate: '1200.500000', effectiveFrom: '2027-01-01', version: 1 });
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(administration())))
    .mockResolvedValueOnce(new Response(JSON.stringify(revised), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(administration({ rateCards: [revised, rate({ version: 2, effectiveTo: '2027-01-01' })] }))));
  const fixture = create(request);
  const view = fixture.componentInstance;
  await vi.waitFor(() => expect(view.loaded()).toBe(true));
  view.rateForm.patchValue({ grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1200.500000', effectiveFrom: '2027-01-01' });
  view.scheduleRate();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(view.busy()).toBe(false));

  expect(request.mock.calls[1][0]).toBe(`/api/v1/engagements/${engagementId}/practice/rate-cards`);
  expect(request.mock.calls[1][1].method).toBe('POST');
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({
    grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1200.500000', effectiveFrom: '2027-01-01',
    effectiveTo: null, expectedPreviousVersion: 1,
  });
  expect(view.message()).toContain('Rate revision scheduled');
  expect(view.error()).toBe('');
  fixture.destroy();
});

it('sends job-grade assignment without changing the target access role', async () => {
  const createdAssignment = assignment({ grade: 'AUDIT_SENIOR', effectiveFrom: '2027-01-01' });
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(administration())))
    .mockResolvedValueOnce(new Response(JSON.stringify(createdAssignment), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(administration({ assignments: [createdAssignment] }))));
  const fixture = create(request);
  const view = fixture.componentInstance;
  await vi.waitFor(() => expect(view.loaded()).toBe(true));
  view.gradeForm.patchValue({ userId: activeStaffId, grade: 'AUDIT_SENIOR', effectiveFrom: '2027-01-01' });
  view.assignGrade();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(view.busy()).toBe(false));

  expect(request.mock.calls[1][0]).toBe(`/api/v1/engagements/${engagementId}/practice/staff-grade-assignments`);
  const body = JSON.parse(request.mock.calls[1][1].body);
  expect(body).toMatchObject({ userId: activeStaffId, grade: 'AUDIT_SENIOR', expectedPreviousVersion: 0 });
  expect(body).not.toHaveProperty('accessRole');
  expect(view.message()).toContain('Staff job-grade assignment saved');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('PREPARER');
  expect(fixture.nativeElement.textContent).toContain('Audit Senior');
  fixture.destroy();
});

it('blocks invalid intervals locally and reports a server-rejected overlap without replacing loaded data', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(administration())))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: {
      code: 'CONFLICT', status: 409, message: 'Effective practice rate-card ranges cannot overlap',
    } }), { status: 409 }));
  const fixture = create(request);
  const view = fixture.componentInstance;
  await vi.waitFor(() => expect(view.loaded()).toBe(true));

  view.rateForm.patchValue({ effectiveFrom: '2027-04-01', effectiveTo: '2027-03-01' });
  view.scheduleRate();
  expect(view.rateError()).toContain('end date must be after the start date');
  expect(request).toHaveBeenCalledTimes(1);

  view.rateForm.patchValue({ effectiveFrom: '2027-04-01', effectiveTo: '2027-06-01' });
  view.scheduleRate();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(view.rateError()).toContain('ranges cannot overlap');
  expect(view.data()?.rateCards).toEqual([rate()]);
  expect(view.error()).toBe('');
  fixture.destroy();
});

