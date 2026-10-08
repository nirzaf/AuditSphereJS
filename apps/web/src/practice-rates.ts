import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { createPracticeRateCardSchema, createPracticeStaffGradeAssignmentSchema, practiceJobGrades, practiceRateAdministrationSchema, practiceRateCardViewSchema, practiceStaffGradeAssignmentViewSchema, type PracticeRateAdministration } from '@auditsphere/contracts';
import type { PracticeJobGrade } from '@auditsphere/contracts';
import { ApiContractError, parseContractValue, requestAuthenticatedContractJson, requestContractJson } from './api-client';
import { currentAccessToken } from './identity';

@Component({
  selector: 'practice-rates',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="practice-rates">
    <section class="intro title-row">
      <div><div class="eyebrow">INTERNAL FIRM ACCOUNTING</div><h1>Rate-card administration</h1><p>Set effective-dated QAR charge-out rates and professional job grades.</p></div>
      <button type="button" (click)="refresh()" [disabled]="busy()">Refresh rates</button>
    </section>
    <p class="notice" role="status" aria-live="polite">{{ message() }}</p>
    @if (error()) { <p class="error-notice" role="alert">{{ error() }}</p> }
    @if (!loaded() && busy()) {
      <section class="panel" aria-live="polite"><h2>Loading rate administration</h2><p>Checking current Practice permission and effective-dated records…</p></section>
    } @else if (loaded()) {
      <section class="panel">
        <h2>Schedule a charge-out rate</h2>
        <p>QAR per hour. Start dates are inclusive and end dates are exclusive. A scheduled rate never recalculates saved time entries.</p>
        <form class="practice-rate-form" [formGroup]="rateForm" (ngSubmit)="scheduleRate()" novalidate>
          <label for="rate-grade">Professional job grade
            <select id="rate-grade" formControlName="grade" aria-describedby="rate-grade-help">
              @for (grade of jobGrades; track grade) { <option [value]="grade">{{ gradeLabel(grade) }}</option> }
            </select>
          </label>
          <label for="rate-hourly">Hourly rate · QAR
            <input id="rate-hourly" formControlName="hourlyRate" inputmode="decimal" autocomplete="off" aria-describedby="rate-hourly-help" [attr.aria-invalid]="rateForm.controls.hourlyRate.touched && rateForm.controls.hourlyRate.invalid ? 'true' : null">
          </label>
          <label for="rate-start">Effective from
            <input id="rate-start" type="date" formControlName="effectiveFrom" [attr.aria-invalid]="rateForm.controls.effectiveFrom.touched && rateForm.controls.effectiveFrom.invalid ? 'true' : null">
          </label>
          <label for="rate-end">Effective until <span class="field-optional">(optional)</span>
            <input id="rate-end" type="date" formControlName="effectiveTo" aria-describedby="rate-range-help">
          </label>
          <div class="form-hint" id="rate-grade-help">Job grade controls charge-out pricing; it does not change application permissions.</div>
          <div class="form-hint" id="rate-hourly-help">Enter a positive decimal with up to six places.</div>
          <div class="form-hint" id="rate-range-help">Blank means no scheduled end. When a later rate is added, the open rate closes on that start date.</div>
          <div class="form-submit"><button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Schedule rate' }}</button></div>
          @if (rateError()) { <p class="field-error" role="alert">{{ rateError() }}</p> }
        </form>
        <div class="ledger-scroll">
          <table>
            <caption>Historical and scheduled charge-out rates · QAR per hour</caption>
            <thead><tr><th scope="col">Job grade</th><th scope="col">Rate</th><th scope="col">Effective from</th><th scope="col">Effective until</th><th scope="col">Version</th></tr></thead>
            <tbody>
              @for (rate of data()?.rateCards ?? []; track rate.id) {
                <tr><td>{{ gradeLabel(rate.grade) }}</td><td>{{ rate.hourlyRate }}</td><td>{{ rate.effectiveFrom }}</td><td>{{ rate.effectiveTo ?? 'Open ended' }}</td><td>{{ rate.version }}</td></tr>
              } @empty { <tr><td colspan="5">No rate cards are configured for this firm.</td></tr> }
            </tbody>
          </table>
        </div>
        <p class="form-hint">This is the source-defined charge-out measure, not payroll cost, realized cash, or statutory profit.</p>
      </section>

      <section class="panel">
        <h2>Assign a staff job grade</h2>
        <p>Staff must already belong to an engagement in this firm. Access roles remain separate and are shown for identification only.</p>
        <form class="practice-rate-form" [formGroup]="gradeForm" (ngSubmit)="assignGrade()" novalidate>
          <label for="grade-staff">Staff member
            <select id="grade-staff" formControlName="userId" [attr.aria-invalid]="gradeForm.controls.userId.touched && gradeForm.controls.userId.invalid ? 'true' : null">
              <option value="">Select firm staff</option>
              @for (staff of activeStaff(); track staff.id) { <option [value]="staff.id">{{ staff.email }} · access role {{ staff.accessRole }}</option> }
            </select>
          </label>
          <label for="grade-job">Professional job grade
            <select id="grade-job" formControlName="grade">
              @for (grade of jobGrades; track grade) { <option [value]="grade">{{ gradeLabel(grade) }}</option> }
            </select>
          </label>
          <label for="grade-start">Effective from
            <input id="grade-start" type="date" formControlName="effectiveFrom" [attr.aria-invalid]="gradeForm.controls.effectiveFrom.touched && gradeForm.controls.effectiveFrom.invalid ? 'true' : null">
          </label>
          <label for="grade-end">Effective until <span class="field-optional">(optional)</span>
            <input id="grade-end" type="date" formControlName="effectiveTo">
          </label>
          <div class="form-hint">Access role is not a job grade and does not set the rate.</div>
          <div class="form-hint">Effective intervals cannot overlap for the same staff member.</div>
          <div class="form-submit"><button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Assign job grade' }}</button></div>
          @if (gradeError()) { <p class="field-error" role="alert">{{ gradeError() }}</p> }
        </form>
        <div class="ledger-scroll">
          <table>
            <caption>Staff job-grade history</caption>
            <thead><tr><th scope="col">Staff member</th><th scope="col">Access role</th><th scope="col">Job grade</th><th scope="col">Effective from</th><th scope="col">Effective until</th><th scope="col">Version</th></tr></thead>
            <tbody>
              @for (assignment of data()?.assignments ?? []; track assignment.id) {
                <tr><td>{{ assignment.email }}</td><td>{{ assignment.accessRole }}</td><td>{{ gradeLabel(assignment.grade) }}</td><td>{{ assignment.effectiveFrom }}</td><td>{{ assignment.effectiveTo ?? 'Open ended' }}</td><td>{{ assignment.version }}</td></tr>
              } @empty { <tr><td colspan="6">No staff job grades are assigned yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    }
    </div>
  `,
})
export class PracticeRates {
  readonly token = input('');
  readonly engagementId = input('');
  readonly entra = input(false);
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly message = signal('Load current firm rate cards and staff grades.');
  readonly error = signal('');
  readonly rateError = signal('');
  readonly gradeError = signal('');
  readonly data = signal<PracticeRateAdministration | null>(null);
  readonly jobGrades = practiceJobGrades;
  readonly activeStaff = computed(() => (this.data()?.staff ?? []).filter(staff => staff.active));
  readonly rateForm = new FormGroup({
    grade: new FormControl<PracticeJobGrade>('ENGAGEMENT_PARTNER', { nonNullable: true, validators: [Validators.required] }),
    hourlyRate: new FormControl('1000.000000', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{1,22}(\.\d{1,6})?$/)] }),
    effectiveFrom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    effectiveTo: new FormControl('', { nonNullable: true }),
  });
  readonly gradeForm = new FormGroup({
    userId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    grade: new FormControl<PracticeJobGrade>('AUDIT_ASSOCIATE', { nonNullable: true, validators: [Validators.required] }),
    effectiveFrom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    effectiveTo: new FormControl('', { nonNullable: true }),
  });
  private generation = 0;

  constructor() {
    effect(onCleanup => {
      const id = this.engagementId();
      this.token(); this.entra();
      const generation = ++this.generation;
      onCleanup(() => { this.generation++; });
      if (id) void this.load(generation);
    });
  }

  gradeLabel(grade: string) {
    return ({ ENGAGEMENT_PARTNER: 'Engagement Partner', AUDIT_MANAGER: 'Audit Manager', AUDIT_SUPERVISOR: 'Audit Supervisor', AUDIT_SENIOR: 'Audit Senior', AUDIT_ASSOCIATE: 'Audit Associate', AUDIT_JUNIOR: 'Audit Junior' } as Record<string, string>)[grade] ?? grade;
  }

  private async request<TSchema extends Parameters<typeof requestContractJson>[1]>(path: string, schema: TSchema, method = 'GET', body?: unknown, firm = false) {
    // D24 (DN-11): firm-level reads name no engagement; writes stay on the engagement path until their receipts are firm-anchored.
    const url = firm ? `/api/v1/firm/practice/${path}` : `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/practice/${path}`;
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${this.token()}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return this.entra()
      ? requestAuthenticatedContractJson(url, schema, init, currentAccessToken)
      : requestContractJson(url, schema, init);
  }

  private userMessage(error: unknown) {
    if (error instanceof ApiContractError) {
      if (error.status === 401) return 'Your staff sign-in could not be confirmed. Sign in again with the designated AuditSphere staff account.';
      if (error.status === 403) return 'Rate administration requires your engagement assignment and firm-wide Practice permission.';
      return error.message;
    }
    return error instanceof Error ? error.message : 'Practice rate administration could not be completed.';
  }

  private async load(generation = this.generation) {
    this.busy.set(true); this.error.set(''); this.message.set('Loading firm rate cards and staff assignments…');
    try {
      const data = await this.request('rate-cards', practiceRateAdministrationSchema, 'GET', undefined, true);
      if (generation !== this.generation) return;
      this.data.set(data); this.loaded.set(true); this.message.set('Rate cards and staff grades are current.');
    } catch (error) {
      if (generation === this.generation) { this.error.set(this.userMessage(error)); this.message.set('The server could not confirm rate-administration access.'); }
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }

  refresh() { void this.load(); }

  scheduleRate() {
    this.rateError.set(''); this.rateForm.markAllAsTouched();
    const value = this.rateForm.getRawValue();
    if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) { this.rateError.set('The end date must be after the start date.'); return; }
    if (this.rateForm.invalid) { this.rateError.set('Complete the required fields with a positive QAR rate.'); return; }
    const latest = (this.data()?.rateCards ?? []).filter(rate => rate.grade === value.grade).sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
    try {
      const body = parseContractValue(createPracticeRateCardSchema, {
        idempotencyKey: crypto.randomUUID(), grade: value.grade, hourlyRate: value.hourlyRate,
        effectiveFrom: value.effectiveFrom, effectiveTo: value.effectiveTo || null, expectedPreviousVersion: latest?.version ?? 0,
      }, 400);
      void this.saveRate(body);
    } catch (error) { this.rateError.set(this.userMessage(error)); }
  }

  private async saveRate(body: unknown) {
    this.busy.set(true); this.error.set(''); this.rateError.set('');
    try {
      await this.request('rate-cards', practiceRateCardViewSchema, 'POST', body);
      this.rateForm.controls.hourlyRate.setValue(''); this.rateForm.controls.effectiveFrom.setValue(''); this.rateForm.controls.effectiveTo.setValue('');
      await this.load();
      if (!this.error()) this.message.set('Rate revision scheduled and audit-recorded.');
    } catch (error) { this.rateError.set(this.userMessage(error)); }
    finally { this.busy.set(false); }
  }

  assignGrade() {
    this.gradeError.set(''); this.gradeForm.markAllAsTouched();
    const value = this.gradeForm.getRawValue();
    if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) { this.gradeError.set('The end date must be after the start date.'); return; }
    if (this.gradeForm.invalid) { this.gradeError.set('Choose a staff member, job grade, and effective start date.'); return; }
    const latest = (this.data()?.assignments ?? []).filter(item => item.userId === value.userId).sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
    try {
      const body = parseContractValue(createPracticeStaffGradeAssignmentSchema, {
        idempotencyKey: crypto.randomUUID(), userId: value.userId, grade: value.grade,
        effectiveFrom: value.effectiveFrom, effectiveTo: value.effectiveTo || null, expectedPreviousVersion: latest?.version ?? 0,
      }, 400);
      void this.saveGrade(body);
    } catch (error) { this.gradeError.set(this.userMessage(error)); }
  }

  private async saveGrade(body: unknown) {
    this.busy.set(true); this.error.set(''); this.gradeError.set('');
    try {
      await this.request('staff-grade-assignments', practiceStaffGradeAssignmentViewSchema, 'POST', body);
      this.gradeForm.controls.userId.setValue(''); this.gradeForm.controls.effectiveFrom.setValue(''); this.gradeForm.controls.effectiveTo.setValue('');
      await this.load();
      if (!this.error()) this.message.set('Staff job-grade assignment saved with an audit record.');
    } catch (error) { this.gradeError.set(this.userMessage(error)); }
    finally { this.busy.set(false); }
  }
}
