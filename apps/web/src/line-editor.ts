import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormArray, FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ScreenField } from './module-catalog';
export type EditorRow = Record<string, string>;
const decimalPattern = /^-?\d{1,22}(\.\d{1,6})?$/;
/**
 * Repeating structured-line editor for the session-only workspaces (adjustment journals and
 * taxonomy lines). It owns presentation state only: values stay in memory, every field is
 * validated locally before the parent submission gate, and the server stays the authority for
 * balance, approval and persistence. Rows are tracked by control identity so an add or remove
 * never recreates the whole collection.
 */
@Component({selector:'line-editor',imports:[ReactiveFormsModule],template:`
<section class="line-editor" aria-label="Structured lines"><div class="panel-top"><div><h3>{{title()}}</h3><p>At least {{minimum()}} line{{minimum() === 1 ? '' : 's'}}. Values are reviewed by the server.</p></div><button type="button" (click)="add()" [disabled]="view().length >= maximum()">Add line</button></div>
@for(entry of view(); track entry.group; let index=$index) {
<div class="line-entry" [formGroup]="entry.group"><div class="line-number">Line {{index+1}}<button type="button" (click)="remove(index)" [disabled]="view().length <= minimum()" [attr.aria-label]="'Remove line ' + (index+1)">Remove</button></div><div class="form-grid">
@for(field of fields();track field.key) { <label class="form-field">{{field.label}}{{field.required === false ? '' : ' *'}}
@if(field.type==='select') { <select [formControlName]="field.key" [attr.name]="scopeKey() + '-' + index + '-' + field.key" autocomplete="off" [attr.aria-label]="field.label + ' line ' + (index+1)" [attr.aria-invalid]="invalid(entry.group, field.key) ? 'true' : null" [attr.aria-describedby]="invalid(entry.group, field.key) ? scopeKey() + '-' + index + '-' + field.key : null"><option value="" disabled>Select a value</option>@for(option of field.options;track option) { <option [value]="option">{{option}}</option> }</select> }
@else { <input [formControlName]="field.key" [attr.name]="scopeKey() + '-' + index + '-' + field.key" [type]="field.type==='email'?'email':field.type==='integer'?'number':'text'" [attr.autocomplete]="field.type==='email'?'email':'off'" [attr.maxlength]="field.type==='integer'?null:500" [attr.min]="field.type==='integer'?'0':null" [attr.step]="field.type==='integer'?'1':null" [attr.inputmode]="field.type==='decimal'?'decimal':field.type==='integer'?'numeric':null" [spellcheck]="field.type!=='email'" [attr.aria-label]="field.label + ' line ' + (index+1)" [attr.aria-invalid]="invalid(entry.group, field.key) ? 'true' : null" [attr.aria-describedby]="invalid(entry.group, field.key) ? scopeKey() + '-' + index + '-' + field.key : null"> }
@if(invalid(entry.group, field.key)) { <span class="field-error" [id]="scopeKey() + '-' + index + '-' + field.key">Enter a valid {{field.label.toLowerCase()}}.</span> }</label> }
</div></div> }</section>`})
export class LineEditor {
  readonly fields = input.required<readonly ScreenField[]>(); readonly scopeKey = input.required<string>(); readonly initialValues = input<readonly EditorRow[]>([]);
  readonly minimum = input(2); readonly maximum = input(500); readonly title = input('Journal lines'); readonly submitted = input(false);
  readonly changed = output<{ rows: EditorRow[]; valid: boolean }>();
  private readonly rows = new FormArray<FormRecord<FormControl<string>>>([]);
  private readonly revision = signal(0);
  readonly view = computed(() => { this.revision(); return this.rows.controls.map((group, index) => ({ id: index, group })); });
  constructor() {
    effect(cleanup => {
      // Rebuild only when the engagement/screen scope changes. Field definitions are read
      // untracked so a new array identity from the parent cannot restart the editor.
      this.scopeKey();
      const fields = untracked(this.fields); const initial = untracked(this.initialValues); const minimum = untracked(this.minimum);
      this.rows.clear();
      const seeds = initial.length ? initial : Array.from({ length: minimum }, () => ({} as EditorRow));
      for (const seed of seeds) this.rows.push(this.create(fields, seed));
      const subscription = this.rows.valueChanges.subscribe(() => { this.revision.update(value => value + 1); this.emit(); });
      cleanup(() => subscription.unsubscribe());
      this.revision.update(value=>value+1); this.emit();
    });
    effect(() => { if (this.submitted()) { this.rows.markAllAsTouched(); this.revision.update(value => value + 1); } });
  }
  invalid(group: FormRecord<FormControl<string>>, key: string) { const control = group.controls[key]; return Boolean(control?.invalid && control.touched); }
  private create(fields: readonly ScreenField[], values: EditorRow = {}) {
    const controls: Record<string, FormControl<string>> = {};
    for (const field of fields) controls[field.key] = new FormControl(values[field.key] ?? (field.type === 'decimal' ? '0' : ''), { nonNullable: true, validators: [Validators.maxLength(500), ...(field.required === false ? [] : [Validators.required]), ...(field.type === 'decimal' ? [Validators.pattern(decimalPattern)] : []),...(field.type==='email'?[Validators.email]:[]),...(field.type==='integer'?[Validators.pattern(/^\d{1,5}$/)]:[])] });
    return new FormRecord(controls);
  }
  private emit() { this.changed.emit({ rows: this.rows.getRawValue(), valid: this.rows.valid }); }
  add() { if (this.rows.length >= this.maximum()) return; this.rows.push(this.create(this.fields())); this.revision.update(value => value + 1); }
  remove(index: number) { if (this.rows.length <= this.minimum()) return; this.rows.removeAt(index); this.revision.update(value => value + 1); }
}
