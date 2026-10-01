import { Component, computed, effect, input, signal } from '@angular/core';
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { calculateMaterialitySchema, createRiskSchema, raiseReviewNoteSchema, publishSchema, createAdjustmentJournalSchema, createTaxonomySchema } from '@auditsphere/contracts';
import { Practice } from './practice';
import { currentAccessToken } from './identity';
import { LineEditor, type EditorRow } from './line-editor';
import { moduleScreens, type ModuleScreen, type ScreenField } from './module-catalog';

type RecordValue = Record<string, unknown>;
type DraftValues = Record<string, string>;
// Stable input identities: the repeating line editors rebuild only on scope change, so these
// definitions must not be recreated per change-detection pass.
const adjustmentLineFields: readonly ScreenField[] = [
  { key: 'accountCode', label: 'Account code', required: true },
  { key: 'fsli', label: 'Financial statement line item', required: false },
  { key: 'debit', label: 'Debit · QAR', type: 'decimal', required: true },
  { key: 'credit', label: 'Credit · QAR', type: 'decimal', required: true },
];
const taxonomyLineFields: readonly ScreenField[] = [
  { key: 'code', label: 'Taxonomy line code', required: true },
  { key: 'label', label: 'Statement label', required: true },
  { key: 'statementSection', label: 'Statement section', type: 'select', options: ['INCOME', 'EXPENSE', 'ASSETS', 'LIABILITIES', 'EQUITY'], required: true },
  { key: 'sortOrder', label: 'Sort order', type: 'integer', required: true },
];
// Presentation drafts only. No localStorage, tokens, approval or business state.
const sessionDrafts = new Map<string, DraftValues>();
let sessionIdentity = ''; // Memory only; clear drafts when the authenticated session changes.
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

@Component({ selector: 'module-workspace', imports: [ReactiveFormsModule, Practice, LineEditor], templateUrl: './module-workspace.html' })
export class ModuleWorkspace {
  readonly screenId = input.required<string>(); readonly engagementId = input.required<string>();
  readonly token = input(''); readonly entra = input(false);
  readonly screen = computed(() => moduleScreens.find(item => item.id === this.screenId()) ?? moduleScreens[0]);
  readonly rows = signal<RecordValue[]>([]); readonly state = signal<RecordValue>({});
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly loaded = signal(false);
  readonly search = signal(''); readonly selected = signal<RecordValue | null>(null); readonly confirm = signal(false);
  readonly lines = signal<EditorRow[]>([]); readonly linesValid = signal(false);
  readonly action = signal<'resolve' | 'assess' | 'clear' | 'approve' | 'transition' | 'post' | 'reverse' | 'owner' | null>(null);
  readonly actionFields = signal<ScreenField[]>([]);
  form = new FormRecord<FormControl<string>>({}); actionForm = new FormRecord<FormControl<string>>({});
  private generation = 0;
  private commandKey = crypto.randomUUID();
  readonly visibleRows = computed(() => this.rows().filter(row => this.screen().columns.some(column => this.display(row, column.key).toLowerCase().includes(this.search().toLowerCase()))));
  readonly commands = computed(() => Array.isArray(this.state()['permittedCommands']) ? (this.state()['permittedCommands'] as unknown[]).filter((v): v is string => typeof v === 'string') : []);
  readonly journalLines = computed(() => { const lines = this.selected()?.['lines']; return Array.isArray(lines) ? lines.map(record) : []; });
  readonly currentState = computed(() => typeof this.state()['state'] === 'string' ? String(this.state()['state']).replaceAll('_',' ') : 'Not loaded');
  constructor() {
    effect(onCleanup => {
      const screen = this.screen(); const draftKey = `${this.engagementId()}:${screen.id}`;
      const identity = this.token(); this.entra();
      if (sessionIdentity !== identity) { sessionDrafts.clear(); sessionIdentity = identity; }
      this.commandKey = crypto.randomUUID(); this.generation++; this.rows.set([]); this.state.set({}); this.loaded.set(false); this.error.set(''); this.message.set(''); this.busy.set(false); this.search.set(''); this.selected.set(null); this.action.set(null); this.confirm.set(false);
      this.lines.set([]); this.linesValid.set(false);
      this.form = this.controls(screen.fields, sessionDrafts.get(draftKey));
      const subscription = this.form.valueChanges.subscribe(() => { this.confirm.set(false); this.commandKey = crypto.randomUUID(); sessionDrafts.set(draftKey, this.form.getRawValue()); });
      onCleanup(() => { subscription.unsubscribe(); this.generation++; });
    });
  }
  private controls(fields: readonly ScreenField[], values: DraftValues = {}) {
    const controls: Record<string, FormControl<string>> = {};
    for (const field of fields) controls[field.key] = new FormControl(values[field.key] ?? '', { nonNullable: true, validators: [Validators.maxLength(field.type === 'textarea' ? 4000 : 500), ...(field.required ? [Validators.required] : []), ...(field.type === 'integer' ? [Validators.pattern(/^[1-9]\d{0,8}$/)] : []), ...(field.type === 'email' ? [Validators.email] : []), ...(field.type === 'decimal' ? [Validators.pattern(/^-?\d{1,22}(\.\d{1,6})?$/)] : [])] });
    return new FormRecord(controls);
  }
  display(row: RecordValue, key: string): string {
    const value = row[key];
    if (value === true) return 'Yes'; if (value === false) return 'No';
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
  }
  changeSearch(event: Event) { this.search.set((event.target as HTMLInputElement).value); }
  invalid(field: ScreenField, form = this.form) { const control = form.controls[field.key]; return control?.invalid && control.touched; }
  private async request(path: string, method = 'GET', body?: unknown) {
    const engagementId = this.engagementId();
    const token = this.entra() ? await currentAccessToken() : this.token();
    if (!token) throw new Error('Connect to your engagement before loading or saving records.');
    const response = await fetch(`/api/v1/engagements/${encodeURIComponent(engagementId)}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
    const value: unknown = await response.json();
    if (!response.ok) {
      const detail = record(record(value)['error'])['message']; const nested = record(detail)['message'];
      throw new Error(response.status === 403 ? 'Your current engagement role does not allow this action.' : response.status === 401 ? 'Sign in or connect again to access this engagement.' : typeof detail === 'string' ? detail : typeof nested === 'string' ? nested : 'The operation could not be completed. Check your inputs and reload the current record.');
    }
    return value;
  }
  private async run(work: (generation: number) => Promise<void>) {
    if (this.busy()) return;
    const generation = this.generation; this.busy.set(true); this.error.set('');
    try { await work(generation); } catch (error) { if (generation === this.generation) this.error.set(error instanceof Error ? error.message : 'Request failed.'); }
    finally { if (generation === this.generation) this.busy.set(false); }
  }
  private async read(generation: number) {
    const screen = this.screen(); if (!screen.endpoint) return;
    const value = await this.request(screen.endpoint);
    if (generation !== this.generation) return;
    this.state.set(record(value));
    const list = screen.collection ? record(value)[screen.collection] : value;
    this.rows.set(Array.isArray(list) ? list.map(record) : list ? [record(list)] : []); this.loaded.set(true);
  }
  refresh() { void this.run(generation => this.read(generation)); }
  onLineChanges(event: { rows: EditorRow[]; valid: boolean }) { this.lines.set(event.rows); this.linesValid.set(event.valid); this.error.set(''); }
  lineFields(screen: ModuleScreen): readonly ScreenField[] { return screen.lineKind === 'taxonomy' ? taxonomyLineFields : adjustmentLineFields; }
  lineMinimum(screen: ModuleScreen): number { return screen.lineKind === 'taxonomy' ? 1 : 2; }
  lineTitle(screen: ModuleScreen): string { return screen.lineKind === 'taxonomy' ? 'Taxonomy lines' : 'Journal lines'; }
  prepare() {
    this.form.markAllAsTouched(); if (this.form.invalid) return;
    if (this.screen().lineKind && !this.linesValid()) { this.error.set('Review the structured lines before confirming.'); return; }
    if (this.screen().action) { this.confirm.set(true); return; }
    sessionDrafts.set(`${this.engagementId()}:${this.screenId()}`, this.form.getRawValue());
    this.message.set('Draft kept in this session. It has not been submitted or approved. Closing or reloading the application clears session drafts.');
  }
  discard() { sessionDrafts.delete(`${this.engagementId()}:${this.screenId()}`); this.form.reset(Object.fromEntries(Object.keys(this.form.controls).map(key => [key,'']))); this.lines.set([]); this.linesValid.set(false); this.message.set('Draft cleared.'); this.confirm.set(false); this.error.set(''); }
  save() {
    if (this.form.invalid || !this.screen().action || !this.confirm()) return;
    const screen = this.screen(); const body: RecordValue = { ...this.form.getRawValue() };
    if (screen.id === 'materiality') { body['idempotencyKey'] = this.commandKey; if (!body['destinationCode']) delete body['destinationCode']; }
    if (screen.id === 'publications') { body['expectedVersion'] = Number(body['expectedVersion']); body['idempotencyKey'] = this.commandKey; }
    if (screen.lineKind === 'adjustment') {
      if (!this.linesValid()) { this.error.set('Review two or more balanced journal lines before confirming.'); return; }
      body['lines'] = this.lines().map(row => ({ accountCode: row['accountCode'], ...(row['fsli'] ? { fsli: row['fsli'] } : {}), debit: row['debit'] ?? '0', credit: row['credit'] ?? '0' }));
    }
    if (screen.lineKind === 'taxonomy') {
      if (!this.linesValid()) { this.error.set('Review one or more taxonomy lines before confirming.'); return; }
      body['lines'] = this.lines().map((row, index) => ({ code: row['code'], label: row['label'], statementSection: row['statementSection'], sortOrder: Number(row['sortOrder'] ?? index) }));
    }
    // Session-only workspaces use one confirmation gate for the whole preparation; the
    // adjustments and taxonomy editors keep their own line lists outside that draft form.
    const schema = screen.id === 'materiality' ? calculateMaterialitySchema : screen.id === 'risks' ? createRiskSchema : screen.id === 'reviews' ? raiseReviewNoteSchema : screen.id === 'publications' ? publishSchema : screen.lineKind === 'taxonomy' ? createTaxonomySchema : createAdjustmentJournalSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) { this.error.set(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' � ')); return; }
    void this.run(async generation => {
      await this.request(screen.id === 'publications' ? '/publications' : screen.endpoint!, 'POST', parsed.data);
      if (generation !== this.generation) return;
      this.confirm.set(false); this.form.reset(Object.fromEntries(Object.keys(this.form.controls).map(key => [key,'']))); this.lines.set([]); this.linesValid.set(false); this.error.set(''); sessionDrafts.delete(`${this.engagementId()}:${screen.id}`);
      this.message.set('Saved to the engagement.'); await this.read(generation);
    });
  }
  openAction(row: RecordValue, action: 'resolve' | 'assess' | 'clear' | 'approve' | 'transition' | 'post' | 'reverse' | 'owner') {
    this.selected.set(row); this.action.set(action); this.error.set('');
    const fields: ScreenField[] = action === 'owner' ? [{key:'ownerUserId',label:'Assigned owner user ID',required:true},{key:'ownerStaffingLevel',label:'Owner staffing level',type:'select',options:['StaffAssociate','SeniorAuditor','AuditManager','EngagementPartner'],required:true}] : action === 'transition' ? [{key:'command',label:'Permitted workflow command',type:'select',options:this.commands(),required:true},{key:'reason',label:'Transition reason',type:'textarea',required:true}] : action === 'resolve' ? [{key:'resolution',label:'Reviewer resolution',type:'textarea',required:true}] : action === 'clear' ? [{key:'note',label:'Partner clearance rationale',type:'textarea',required:true}] : action === 'assess' ? [
      {key:'likelihood',label:'Likelihood',type:'select',options:['1','2','3'],required:true}, {key:'magnitude',label:'Magnitude',type:'select',options:['1','2','3'],required:true},
      {key:'significant',label:'Significant risk',type:'select',options:['No','Yes'],required:true}, {key:'fraudRisk',label:'Fraud risk',type:'select',options:['No','Yes'],required:true},
    ] : [];
    this.actionFields.set(fields); this.actionForm = this.controls(fields);
    if (action === 'post' || action === 'reverse') {
      this.action.set(null);
      void this.run(async generation => {
        const detail = record(await this.request(`/adjustments/${encodeURIComponent(String(row['id']))}`));
        if (generation !== this.generation) return;
        if (typeof detail['id'] !== 'string' || typeof detail['version'] !== 'number' || !Array.isArray(detail['lines'])) throw new Error('Journal details could not be reviewed. Reload records before proceeding.');
        this.selected.set(detail); this.action.set(action);
      });
    }
  }
  saveAction() {
    this.actionForm.markAllAsTouched(); if (this.actionForm.invalid) return;
    const row = this.selected(); const action = this.action(); if (!row || !action) return;
    const values = this.actionForm.getRawValue(); let body: RecordValue = values; let path: string;
    const id = String(row['id'] ?? row['riskId'] ?? ''); if (!id && action !== 'transition') return;
    if (action === 'owner') { path = `/risks/${encodeURIComponent(id)}/owner`; }
    else if (action === 'post' || action === 'reverse') { path = `/adjustments/${encodeURIComponent(id)}/${action}`; body = {expectedVersion:row['version']}; }
    else if (action === 'transition') { path = '/lifecycle'; body = {...values, expectedVersion:row['version'], idempotencyKey:crypto.randomUUID()}; }
    else if (action === 'resolve') path = `/review-notes/${encodeURIComponent(id)}/resolve`;
    else if (action === 'approve') { path = `/materiality/${encodeURIComponent(id)}/approve`; body = {idempotencyKey:crypto.randomUUID()}; }
    else if (action === 'clear') { path = `/risks/${encodeURIComponent(id)}/assessments/${encodeURIComponent(String(row['currentAssessmentId']))}/clearance`; }
    else { path = `/risks/${encodeURIComponent(id)}/assessments`; body = {...values,likelihood:Number(values['likelihood']),magnitude:Number(values['magnitude']),significant:values['significant']==='Yes',fraudRisk:values['fraudRisk']==='Yes'}; }
    void this.run(async generation => { await this.request(path,'POST',body); if (generation !== this.generation) return; this.action.set(null); this.selected.set(null); this.message.set('Decision recorded on the engagement.'); await this.read(generation); });
  }
}
