import { TestBed } from '@angular/core/testing';
import { ModuleWorkspace } from './module-workspace';
import { moduleScreens } from './module-catalog';
import { afterEach, it, expect, vi } from 'vitest';
const create = async (screen: string, token = 'test-session') => {
  const fixture = TestBed.createComponent(ModuleWorkspace);
  fixture.componentRef.setInput('screenId', screen); fixture.componentRef.setInput('engagementId','engagement-a'); fixture.componentRef.setInput('token',token);
  fixture.detectChanges(); await fixture.whenStable(); return fixture;
};
afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
it('issues a partner-authorized client code without recording staff acceptance and clears it on scope change', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const membership = '22222222-2222-4222-8222-222222222222';
  const request = vi.fn().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === 'POST'
    ? { proposalId: id, token: 'a'.repeat(64), expiresAt: '2026-10-16T12:00:00.000Z', revision: 3 } : [])));
  vi.stubGlobal('fetch', request);
  const fixture = await create('proposals'); const view = fixture.componentInstance;
  view.rows.set([{ id, status: 'PRESENTED', revision: 3 }]); fixture.detectChanges();
  expect(fixture.nativeElement.textContent).not.toContain('Record client acceptance');
  view.openAction({ id, status: 'PRESENTED', revision: 3 }, 'issueAcceptance');
  view.actionForm.patchValue({ portalMembershipId: membership }); view.saveAction();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toContain(`/commercial/proposals/${id}/acceptance-credential`);
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ portalMembershipId: membership, expectedVersion: 3 });
  expect(view.acceptanceCredential()?.token).toBe('a'.repeat(64));
  fixture.componentRef.setInput('engagementId', 'engagement-b'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.acceptanceCredential()).toBeNull(); fixture.destroy();
});
it('mounts the real monthly firm statement through the Practice workspace catalog', async () => {
  const fixture = await create('profit-loss');
  expect(fixture.nativeElement.querySelector('practice-profit-loss')).not.toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Monthly Profit & Loss');
  expect(moduleScreens.find(item => item.id === 'profit-loss')?.module).toBe('Practice');
  fixture.destroy();
});
it('validates preparation drafts without sending a business mutation and isolates engagements', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch',request);
  const fixture = await create('leads'); const view = fixture.componentInstance;
  view.prepare(); expect(view.form.invalid).toBe(true); expect(request).not.toHaveBeenCalled();
  view.form.patchValue({legalName:'Draft entity',channel:'Email',contactName:'Liaison',email:'liaison@example.test',scope:'Annual audit'});
  view.prepare(); expect(view.message()).toContain('not been submitted');
  fixture.componentRef.setInput('engagementId','engagement-b'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.form.controls['legalName'].value).toBe('');
  fixture.componentRef.setInput('engagementId','engagement-a'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.form.controls['legalName'].value).toBe('Draft entity');
  fixture.componentRef.setInput('token','different-session'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.form.controls['legalName'].value).toBe(''); fixture.destroy();
});
it('requires review and sends decimal strings to the exact engagement scope', async () => {
  const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify([]))); vi.stubGlobal('fetch',request);
  const fixture = await create('materiality'); const view = fixture.componentInstance;
  view.form.patchValue({benchmarkKind:'REVENUE',ratePercent:'1.2500',performancePercent:'75',trivialPercent:'5'});
  view.prepare(); expect(view.confirm()).toBe(true); expect(request).not.toHaveBeenCalled();
  view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/materiality');
  const options = request.mock.calls[0][1]; expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toMatchObject({ratePercent:'1.2500',performancePercent:'75'}); fixture.destroy();
});
it('requires an invoice due date and never accepts an amount from the billing form', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([]))); vi.stubGlobal('fetch', request);
  const fixture = await create('advance'); const view = fixture.componentInstance;
  expect(view.form.controls['dueOn']).toBeDefined(); expect(view.form.controls['amount']).toBeUndefined();
  view.form.patchValue({ dueOn: '2026-12-31' }); view.prepare(); expect(view.confirm()).toBe(true);
  view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe('/api/v1/engagements/engagement-a/practice/invoices');
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ dueOn: '2026-12-31', kind: 'ADVANCE_50' });
  expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty('amount'); fixture.destroy();
});
it('allows a reasoned void only for an unpaid issued invoice', async () => {
  const request = vi.fn().mockResolvedValue(new Response('[]')); vi.stubGlobal('fetch', request);
  const fixture = await create('advance'); const view = fixture.componentInstance;
  const invoice = { id: 'invoice-a', number: 'INV-0001', kind: 'ADVANCE_50', status: 'ISSUED', amount: '600.00', dueOn: '2026-12-31', paidToDate: '0.00', receiptIssued: false };
  view.rows.set([invoice]); fixture.detectChanges();
  const buttons = [...fixture.nativeElement.querySelectorAll('button')].map((button: HTMLButtonElement) => button.textContent.trim());
  expect(buttons).toContain('Void unpaid invoice');
  view.openAction(invoice, 'invoiceVoid');
  expect(view.actionFields()).toEqual([{ key: 'reason', label: 'Reason for voiding this unpaid invoice', type: 'textarea', required: true }]);
  view.actionForm.patchValue({ reason: 'wrong' }); view.saveAction();
  expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  expect(view.error()).toContain('at least 10 characters');
  view.actionForm.patchValue({ reason: 'Duplicate invoice issued in error' }); view.saveAction();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe('/api/v1/engagements/engagement-a/practice/invoices/invoice-a/void');
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ reason: 'Duplicate invoice issued in error' });
  view.rows.set([{ ...invoice, status: 'PAID' }]); fixture.detectChanges();
  const paidButtons = [...fixture.nativeElement.querySelectorAll('button')].map((button: HTMLButtonElement) => button.textContent.trim());
  expect(paidButtons).toContain('Issue receipt'); expect(paidButtons).not.toContain('Void unpaid invoice');
  view.rows.set([{ ...invoice, status: 'VOID', voidReason: 'Duplicate invoice issued in error' }]); fixture.detectChanges();
  const voidButtons = [...fixture.nativeElement.querySelectorAll('button')].map((button: HTMLButtonElement) => button.textContent.trim());
  expect(voidButtons).not.toContain('Void unpaid invoice'); expect(voidButtons).not.toContain('Issue receipt');
  expect(fixture.nativeElement.textContent).toContain('Voided: Duplicate invoice issued in error');
  fixture.destroy();
});
it('does not present authorization rejection as a recorded decision', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  const fixture = await create('reviews'); const view = fixture.componentInstance;
  view.openAction({id:'note-a'},'resolve'); view.actionForm.patchValue({resolution:'Reviewed evidence'}); view.saveAction();
  await vi.waitFor(() => expect(view.error()).toContain('does not allow'));
  expect(view.action()).toBe('resolve'); expect(view.message()).toBe(''); fixture.destroy();
});
it('discards a late response after changing engagement scope', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch',vi.fn().mockImplementation(() => new Promise<Response>(resolve => {finish=resolve;})));
  const fixture = await create('risks'); const view = fixture.componentInstance; view.refresh();
  fixture.componentRef.setInput('engagementId','engagement-b'); fixture.detectChanges(); await fixture.whenStable();
  finish(new Response(JSON.stringify([{riskId:'old',title:'Old engagement'}]))); await Promise.resolve(); await Promise.resolve();
  expect(view.rows()).toEqual([]); expect(view.loaded()).toBe(false); fixture.destroy();
});

it('clears a restored draft instead of resetting to its original saved values', async () => {
  const fixture = await create('leads','clear-session'); const view = fixture.componentInstance;
  view.form.controls['legalName'].setValue('Prepared name');
  fixture.componentRef.setInput('screenId','entities'); fixture.detectChanges(); await fixture.whenStable();
  fixture.componentRef.setInput('screenId','leads'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.form.controls['legalName'].value).toBe('Prepared name'); view.discard();
  expect(view.form.controls['legalName'].value).toBe(''); fixture.destroy();
});
it('posts the exact loaded journal version and never overwrites its monetary lines', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'journal-a',version:3,lines:[{accountCode:'1000',debit:'10.000000',credit:'0.000000'}]}))).mockImplementation(async () => new Response('[]')); vi.stubGlobal('fetch',request);
  const fixture = await create('adjustments'); const view = fixture.componentInstance;
  view.openAction({id:'journal-a',version:3,status:'DRAFT'},'post');
  await vi.waitFor(() => expect(view.action()).toBe('post')); view.saveAction();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[1][0]).toBe('/api/v1/engagements/engagement-a/adjustments/journal-a/post');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({expectedVersion:3}); fixture.destroy();
});

it('does not offer journal posting when its protected line review fails', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}',{status:403})); vi.stubGlobal('fetch',request);
  const fixture = await create('adjustments'); const view = fixture.componentInstance;
  view.openAction({id:'journal-a',version:3},'post');
  await vi.waitFor(() => expect(view.error()).toContain('does not allow')); view.saveAction();
  expect(view.action()).toBeNull(); expect(request).toHaveBeenCalledTimes(1); fixture.destroy();
});

it('submits every reviewed journal line instead of a fixed two-line shape', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([]))); vi.stubGlobal('fetch',request);
  const fixture = await create('adjustments'); const view = fixture.componentInstance;
  view.form.patchValue({reference:'ADJ-7',memo:'Accrue the audit fee'});
  view.onLineChanges({valid:true,rows:[
    {accountCode:'5000',fsli:'Operating expenses',debit:'200.000000',credit:'0'},
    {accountCode:'2000',fsli:'Trade payables',debit:'0',credit:'150.000000'},
    {accountCode:'2100',fsli:'Trade payables',debit:'0',credit:'50.000000'},
  ]});
  view.prepare(); expect(view.confirm()).toBe(true); expect(request).not.toHaveBeenCalled();
  view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/adjustments');
  const body = JSON.parse(request.mock.calls[0][1].body);
  expect(body.lines).toHaveLength(3);
  expect(body.lines[0]).toEqual({accountCode:'5000',fsli:'Operating expenses',debit:'200.000000',credit:'0'});
  expect(body.lines[2]).toEqual({accountCode:'2100',fsli:'Trade payables',debit:'0',credit:'50.000000'});
  fixture.destroy();
});
it('refuses to submit incomplete structured lines and reports why', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch',request);
  const fixture = await create('adjustments'); const view = fixture.componentInstance;
  view.form.patchValue({reference:'ADJ-8',memo:'Incomplete'});
  view.onLineChanges({valid:false,rows:[{accountCode:'5000',debit:'10.000000',credit:'0'},{accountCode:'',debit:'0',credit:''}]});
  view.prepare();
  expect(view.confirm()).toBe(false); expect(view.error()).toContain('structured lines');
  expect(request).not.toHaveBeenCalled(); fixture.destroy();
});
it('validates taxonomy lines against the versioned taxonomy contract', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([]))); vi.stubGlobal('fetch',request);
  const fixture = await create('taxonomies'); const view = fixture.componentInstance;
  view.form.patchValue({name:'STE statutory taxonomy'});
  view.onLineChanges({valid:true,rows:[
    {code:'REV',label:'Revenue',statementSection:'INVALID',sortOrder:'0'},
  ]});
  view.prepare(); view.save();
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request).not.toHaveBeenCalled();
  expect(view.error()).toContain('statementSection');
  view.onLineChanges({valid:true,rows:[
    {code:'REV',label:'Revenue',statementSection:'INCOME',sortOrder:'0'},
    {code:'EXP',label:'Operating expenses',statementSection:'EXPENSE',sortOrder:'1'},
  ]});
  view.prepare(); view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/taxonomies');
  const body = JSON.parse(request.mock.calls[0][1].body);
  expect(body.name).toBe('STE statutory taxonomy');
  expect(body.lines).toEqual([
    {code:'REV',label:'Revenue',statementSection:'INCOME',sortOrder:0},
    {code:'EXP',label:'Operating expenses',statementSection:'EXPENSE',sortOrder:1},
  ]);
  fixture.destroy();
});
it('reuses the reviewed command key after transport failure and invalidates review when input changes', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}',{status:500})); vi.stubGlobal('fetch',request);
  const fixture = await create('materiality'); const view = fixture.componentInstance;
  view.form.patchValue({benchmarkKind:'REVENUE',ratePercent:'1',performancePercent:'75',trivialPercent:'5'});
  view.prepare(); view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  view.save(); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(request.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(request.mock.calls[1][1].body).idempotencyKey);
  view.form.controls['ratePercent'].setValue('2'); expect(view.confirm()).toBe(false); fixture.destroy();
});
it('records taxonomy approval on the exact protected version route', async () => {
  const request=vi.fn().mockImplementation(async()=>new Response('[]'));vi.stubGlobal('fetch',request);
  const fixture=await create('taxonomies');const view=fixture.componentInstance;
  view.openAction({id:'taxonomy-a',version:2,status:'DRAFT'},'taxonomyApprove');view.saveAction();
  await vi.waitFor(()=>expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/taxonomies/taxonomy-a/approve');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({expectedVersion:2});fixture.destroy();
});
it('binds import mapping approval to the selected immutable taxonomy',async()=>{
  const request=vi.fn().mockImplementation(async(input,init)=>new Response(String(input).endsWith('/imports/00000000-0000-4000-8000-000000000004')?JSON.stringify({id:'00000000-0000-4000-8000-000000000004',version:7,status:'MAPPING_REQUIRED'}):init?.method==='POST'?'{}':'[]'));vi.stubGlobal('fetch',request);
  const fixture=await create('taxonomies');const view=fixture.componentInstance;const id='00000000-0000-4000-8000-000000000003';
  view.openAction({id,status:'APPROVED'},'mappingApprove');view.actionForm.patchValue({importId:'00000000-0000-4000-8000-000000000004'});view.saveAction();
  await vi.waitFor(()=>expect(view.busy()).toBe(false));
  expect(request.mock.calls[1][0]).toContain('/imports/00000000-0000-4000-8000-000000000004/mapping-approval');
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({taxonomyVersionId:id,expectedVersion:7});fixture.destroy();
});
it('reviews import mapping suggestions read-only and names their provenance',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({
    importId:'import-a',taxonomyVersionId:'tax-a',taxonomyVersion:2,suggested:1,alreadyMapped:1,unresolved:2,items:[
      {rowId:'r1',code:'1010',name:'Cash at bank',currentFsli:null,suggestedFsli:'CASH',reason:'MEMORY',provenance:{memoryEntryId:'m1',sourceApprovalId:'approval-9',timesApplied:2,lastApprovedAt:'2026-09-30T00:00:00.000Z'}},
      {rowId:'r2',code:'4000',name:'Revenue',currentFsli:'REVENUE',suggestedFsli:null,reason:'ALREADY_MAPPED',provenance:null},
      {rowId:'r3',code:'9999',name:'Unmapped account',currentFsli:null,suggestedFsli:null,reason:'NO_MEMORY',provenance:null},
      {rowId:'r4',code:'1020',name:'Retired account',currentFsli:null,suggestedFsli:null,reason:'MEMORY_NOT_IN_TAXONOMY',provenance:{sourceApprovalId:'approval-8',timesApplied:1,lastApprovedAt:'2026-08-01T00:00:00.000Z'}},
    ]})));vi.stubGlobal('fetch',request);
  const fixture=await create('taxonomies');const view=fixture.componentInstance;
  view.openAction({id:'tax-a',status:'APPROVED',name:'STE statutory taxonomy'},'suggestions');
  expect(view.action()).toBe('suggestions');expect(view.suggestionsLoaded()).toBe(false);
  view.actionForm.patchValue({importId:'import-a'});view.saveAction();
  await vi.waitFor(()=>expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][0]).toBe('/api/v1/engagements/engagement-a/imports/import-a/suggestions?taxonomyVersionId=tax-a');
  expect(request.mock.calls[0][1].method).toBe('GET');
  expect(view.suggestionsLoaded()).toBe(true);expect(view.suggestionRows()).toHaveLength(4);
  fixture.detectChanges();
  const text=fixture.nativeElement.textContent??'';
  expect(text).toContain('Approved taxonomy v2');
  expect(text).toContain('1 remembered · 1 already mapped · 2 unresolved');
  expect(text).toContain('Remembered from an approved mapping');
  expect(text).toContain('approval-9');
  expect(text).toContain('Remembered code is not in the approved taxonomy');
  expect(text).toContain('2026-08-01T00:00:00.000Z');
  fixture.destroy();
});
it('reports suggestion load failures without recording a decision or writing anything',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'No approved taxonomy version is configured for this firm'}}),{status:409}));vi.stubGlobal('fetch',request);
  const fixture=await create('taxonomies');const view=fixture.componentInstance;
  view.openAction({id:'tax-a',status:'APPROVED'},'suggestions');
  view.actionForm.patchValue({importId:'import-b'});view.saveAction();
  await vi.waitFor(()=>expect(view.busy()).toBe(false));
  expect(request.mock.calls[0][1].method).toBe('GET');
  expect(view.suggestionsLoaded()).toBe(false);expect(view.suggestionRows()).toEqual([]);
  expect(view.error()).toContain('No approved taxonomy');
  expect(view.action()).toBe('suggestions');expect(view.message()).toBe('');fixture.destroy();
});
it('preserves structured line drafts across workspace navigation and clears them explicitly',async()=>{
  const fixture=await create('adjustments','lines-session');const view=fixture.componentInstance;
  view.form.patchValue({reference:'Draft journal',memo:'Draft explanation'});
  view.onLineChanges({rows:[{accountCode:'1000',debit:'10.000000',credit:'0'},{accountCode:'2000',debit:'0',credit:'10.000000'}],valid:true});
  fixture.componentRef.setInput('screenId','risks');fixture.detectChanges();await fixture.whenStable();
  fixture.componentRef.setInput('screenId','adjustments');fixture.detectChanges();await fixture.whenStable();
  expect(view.lines()[0]['accountCode']).toBe('1000');expect(view.form.controls['reference'].value).toBe('Draft journal');
  view.discard();fixture.detectChanges();await fixture.whenStable();expect(view.lines()[0]['accountCode']).toBe('');fixture.destroy();
});
it('requires another review after editing structured lines',async()=>{
  const fixture=await create('adjustments','line-review-session');const view=fixture.componentInstance;
  view.form.patchValue({reference:'Reference',memo:'Explanation'});view.onLineChanges({rows:[{accountCode:'1000',debit:'10',credit:'0'},{accountCode:'2000',debit:'0',credit:'10'}],valid:true});view.prepare();expect(view.confirm()).toBe(true);
  view.onLineChanges({rows:[{accountCode:'1000',debit:'20',credit:'0'},{accountCode:'2000',debit:'0',credit:'20'}],valid:true});expect(view.confirm()).toBe(false);fixture.destroy();
});
it('keeps repeated workprogram preparation in session without calling a business API',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);const fixture=await create('workprogram','procedure-session');const view=fixture.componentInstance;
  view.form.patchValue({fsli:'Cash and equivalents',assertion:'Existence',assignee:'Synthetic preparer',procedure:'Verify bank reconciliation'});
  view.onLineChanges({valid:true,rows:[{instruction:'Inspect reconciliation',evidence:'Draft reference',finding:''},{instruction:'Prepare exception follow-up',evidence:'',finding:''}]});view.prepare();
  expect(view.message()).toContain('not been submitted');expect(request).not.toHaveBeenCalled();fixture.destroy();
});
it('focuses an announced error summary after invalid preparation',async()=>{
  const fixture=await create('leads','focus-session');const view=fixture.componentInstance;view.prepare();fixture.detectChanges();await fixture.whenStable();
  const summary=fixture.nativeElement.querySelector('[data-form-error]');expect(summary).not.toBeNull();expect(document.activeElement).toBe(summary);expect(summary.getAttribute('role')).toBe('alert');fixture.destroy();
});

it('renders every catalog workspace without issuing mutation requests on navigation',async()=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);
 for(const screen of moduleScreens.filter(value=>value.id!=='trial-balance')) {
  const fixture=await create(screen.id,'');
  expect(fixture.nativeElement.querySelector('h1')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('input[aria-invalid="true"]')).toBeNull();
  fixture.destroy();
 }
 expect(request.mock.calls.filter(([,init])=>init?.method && init.method !== 'GET')).toEqual([]);
});
