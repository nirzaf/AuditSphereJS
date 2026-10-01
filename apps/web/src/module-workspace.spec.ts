import { TestBed } from '@angular/core/testing';
import { ModuleWorkspace } from './module-workspace';
import { afterEach, it, expect, vi } from 'vitest';
const create = async (screen: string, token = 'test-session') => {
  const fixture = TestBed.createComponent(ModuleWorkspace);
  fixture.componentRef.setInput('screenId', screen); fixture.componentRef.setInput('engagementId','engagement-a'); fixture.componentRef.setInput('token',token);
  fixture.detectChanges(); await fixture.whenStable(); return fixture;
};
afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
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

it('reuses the reviewed command key after transport failure and invalidates review when input changes', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}',{status:500})); vi.stubGlobal('fetch',request);
  const fixture = await create('materiality'); const view = fixture.componentInstance;
  view.form.patchValue({benchmarkKind:'REVENUE',ratePercent:'1',performancePercent:'75',trivialPercent:'5'});
  view.prepare(); view.save(); await vi.waitFor(() => expect(view.busy()).toBe(false));
  view.save(); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(request.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(request.mock.calls[1][1].body).idempotencyKey);
  view.form.controls['ratePercent'].setValue('2'); expect(view.confirm()).toBe(false); fixture.destroy();
});
