import { TestBed } from '@angular/core/testing';
import { LineEditor } from './line-editor';
import type { ScreenField } from './module-catalog';
import { afterEach, it, expect } from 'vitest';
const adjustmentFields: readonly ScreenField[] = [
  { key: 'accountCode', label: 'Account code', required: true },
  { key: 'debit', label: 'Debit', type: 'decimal', required: true },
  { key: 'credit', label: 'Credit', type: 'decimal', required: true },
];
const create = async (scopeKey = 'engagement-a:adjustments', fields: readonly ScreenField[] = adjustmentFields, minimum = 2) => {
  const fixture = TestBed.createComponent(LineEditor);
  fixture.componentRef.setInput('fields', fields); fixture.componentRef.setInput('scopeKey', scopeKey); fixture.componentRef.setInput('minimum', minimum);
  fixture.detectChanges(); await fixture.whenStable(); return fixture;
};
afterEach(() => TestBed.resetTestingModule());
it('starts at the minimum line count and reports validity to the owning workspace', async () => {
  const fixture = await create(); const view = fixture.componentInstance;
  const emissions: Array<{ rows: Record<string, string>[]; valid: boolean }> = [];
  view.changed.subscribe(event => emissions.push(event));
  expect(view.view().length).toBe(2);
  view.add(); expect(view.view().length).toBe(3);
  expect(emissions.at(-1)?.rows.length).toBe(3);
  // Two defaulted lines (debit 0, empty credit) plus one blank line are not yet submittable.
  expect(emissions.at(-1)?.valid).toBe(false);
  fixture.destroy();
});
it('never reduces below the minimum and never exceeds the maximum', async () => {
  const fixture = await create(); const view = fixture.componentInstance;
  view.remove(0); expect(view.view().length).toBe(2);
  for (let index = 0; index < 4; index++) view.add();
  expect(view.view().length).toBe(6);
  fixture.componentRef.setInput('maximum', 3); fixture.detectChanges(); await fixture.whenStable();
  view.add(); expect(view.view().length).toBe(6);
  fixture.destroy();
});
it('rejects malformed money locally without sending a business mutation', async () => {
  const fixture = await create(); const view = fixture.componentInstance;
  view.view()[0].group.controls['accountCode'].setValue('1000');
  view.view()[0].group.controls['debit'].setValue('1.000000'); view.view()[0].group.controls['credit'].setValue('0');
  view.view()[1].group.controls['accountCode'].setValue('2000');
  view.view()[1].group.controls['debit'].setValue('00.0000000'); view.view()[1].group.controls['credit'].setValue('0');
  expect(view.invalid(view.view()[1].group, 'debit')).toBe(false);
  view.view()[1].group.markAllAsTouched();
  expect(view.invalid(view.view()[1].group, 'debit')).toBe(true);
  fixture.destroy();
});
it('rebuilds a clean line set when the engagement or screen scope changes', async () => {
  const fixture = await create(); const view = fixture.componentInstance;
  view.view()[0].group.controls['accountCode'].setValue('1000');
  fixture.componentRef.setInput('scopeKey', 'engagement-b:adjustments'); fixture.detectChanges(); await fixture.whenStable();
  expect(view.view()[0].group.controls['accountCode'].value).toBe('');
  expect(view.view().length).toBe(2);
  fixture.destroy();
});
it('supports a single-line minimum for taxonomy workspaces and reveals errors only when submitted', async () => {
  const fixture = await create('engagement-a:taxonomies', [{ key: 'code', label: 'Line code', required: true }], 1);
  const view = fixture.componentInstance;
  expect(view.view().length).toBe(1);
  view.remove(0); expect(view.view().length).toBe(1);
  expect(view.invalid(view.view()[0].group, 'code')).toBe(false);
  fixture.componentRef.setInput('submitted', true); fixture.detectChanges(); await fixture.whenStable();
  expect(view.invalid(view.view()[0].group, 'code')).toBe(true);
  fixture.destroy();
});it('replaces rendered control identities and initial values on a scope reset', async()=>{
  const fixture=await create();const view=fixture.componentInstance;const before=view.view()[0].group;
  fixture.componentRef.setInput('initialValues',[{accountCode:'NEW',debit:'0',credit:'0'},{accountCode:'OTHER',debit:'0',credit:'0'}]);fixture.componentRef.setInput('scopeKey','new-scope');fixture.detectChanges();await fixture.whenStable();
  expect(view.view()[0].group).not.toBe(before);expect(view.view()[0].group.controls['accountCode'].value).toBe('NEW');fixture.destroy();
});
