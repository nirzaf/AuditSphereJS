import { TestBed } from '@angular/core/testing';
import { Workspace } from './workspace';
import { afterEach, it, expect, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
it('prevents paging away from unsaved mappings and discards explicitly', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'development' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await fixture.whenStable();
  const view = fixture.componentInstance;
  view.changes.set({ row: { rowId: 'row', expectedVersion: 1, fsli: 'Revenue' } });
  view.page(200);
  expect(view.offset).toBe(0);
  expect(view.message()).toContain('Save or discard');
  fixture.detectChanges();
  const button = [...fixture.nativeElement.querySelectorAll('button')].find((element: HTMLButtonElement) => element.textContent === 'Discard');
  button.click(); expect(view.dirty()).toBe(0);
  fixture.destroy();
});
it('hides development token entry when Microsoft identity is selected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'entra' }))));
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.identityProvider()).toBe('entra')); fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('#token')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Sign in with Microsoft');
  fixture.destroy();
});
