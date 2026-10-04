import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentTemplates } from './document-templates';

const ids = {
  engagement: '10000000-0000-4000-8000-000000000001',
  template: '10000000-0000-4000-8000-000000000002',
  version: '10000000-0000-4000-8000-000000000003',
};
const version = {
  id: ids.version, sequence: 1, contentSha256: 'a'.repeat(64),
  blocks: [{ id: 'title', kind: 'TITLE', text: 'Letter for {{clientLegalName}}' }],
  allowedVariables: ['clientLegalName'], status: 'DRAFT', createdAt: '2026-10-04T12:00:00.000Z',
};
const catalog = (canManage: boolean) => ({
  canManage,
  templates: [{ id: ids.template, kind: 'ENGAGEMENT_LETTER', engagementType: 'EXTERNAL_STATUTORY_AUDIT', name: 'Statutory letter', version: 1, activeVersionId: canManage ? null : ids.version, versions: [{ ...version, status: canManage ? 'DRAFT' : 'APPROVED' }] }],
  assets: [],
});
const create = async (canManage: boolean, request: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(DocumentTemplates);
  fixture.componentRef.setInput('engagementId', ids.engagement);
  fixture.componentRef.setInput('token', 'staff-session');
  fixture.detectChanges();
  await vi.waitFor(() => expect(request).toHaveBeenCalled());
  await vi.waitFor(() => expect(fixture.componentInstance.catalog()?.canManage).toBe(canManage));
  fixture.detectChanges();
  return fixture;
};

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

it('loads an active template for a reader, offers a controlled preview and hides all manager actions', async () => {
  const preview = { versionId: ids.version, contentSha256: 'a'.repeat(64), blocks: [{ id: 'title', kind: 'TITLE', text: 'Letter for Northwind WLL' }] };
  const request = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/preview')) return new Response(JSON.stringify(preview));
    return new Response(JSON.stringify(catalog(false)));
  });
  const fixture = await create(false, request);
  const view = fixture.componentInstance;
  expect(fixture.nativeElement.textContent).toContain('Statutory letter');
  expect(fixture.nativeElement.textContent).not.toContain('Version management');
  expect(fixture.nativeElement.textContent).not.toContain('Approve this version');
  view.setPreviewValue('clientLegalName', { target: { value: 'Northwind WLL' } } as unknown as Event);
  view.runPreview();
  await vi.waitFor(() => expect(view.preview()?.blocks[0]?.text).toBe('Letter for Northwind WLL'));
  expect(request.mock.calls[1]?.[0]).toBe(`/api/v1/engagements/${ids.engagement}/document-templates/${ids.template}/versions/${ids.version}/preview`);
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({ data: { clientLegalName: 'Northwind WLL' } });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Letter for Northwind WLL');
  fixture.destroy();
});

it('shows version controls only for managers and submits a reasoned approval to the exact version', async () => {
  const decision = { versionId: ids.version, status: 'APPROVED', decidedAt: '2026-10-04T12:00:00.000Z' };
  const request = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify(decision));
    return new Response(JSON.stringify(catalog(true)));
  });
  const fixture = await create(true, request);
  const view = fixture.componentInstance;
  expect(fixture.nativeElement.textContent).toContain('Version management');
  expect(fixture.nativeElement.textContent).toContain('Approved firm artwork and assets');
  expect(fixture.nativeElement.textContent).toContain('Approve this version');
  view.reason.set('Approved exact engagement-letter wording for use.');
  view.decideTemplate('APPROVED');
  await vi.waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
  const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe(`/api/v1/engagements/${ids.engagement}/document-templates/${ids.template}/versions/${ids.version}/decision`);
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ expectedVersion: 1, action: 'APPROVED', reason: 'Approved exact engagement-letter wording for use.' });
  fixture.destroy();
});

it('reports a failed catalog request without exposing a writable workspace', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}', { status: 403 })); vi.stubGlobal('fetch', request);
  const failed = TestBed.createComponent(DocumentTemplates);
  failed.componentRef.setInput('engagementId', ids.engagement); failed.componentRef.setInput('token', 'staff-session'); failed.detectChanges();
  await vi.waitFor(() => expect(failed.componentInstance.error()).toContain('HTTP 403'));
  expect(failed.componentInstance.catalog()).toBeNull();
  expect(failed.nativeElement.textContent).not.toContain('Version management');
  failed.destroy();
});

it('clears catalog and draft values immediately when the authorized engagement changes', async () => {
  const nextEngagement = '10000000-0000-4000-8000-000000000004';
  let finishNext!: (response: Response) => void;
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(catalog(false))))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishNext = resolve; }));
  const fixture = await create(false, request);
  const view = fixture.componentInstance;
  view.setPreviewValue('clientLegalName', { target: { value: 'Northwind WLL' } } as unknown as Event);
  fixture.componentRef.setInput('engagementId', nextEngagement); fixture.detectChanges();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(view.catalog()).toBeNull();
  expect(view.previewValues()).toEqual({});
  expect(request.mock.calls[1]?.[0]).toBe(`/api/v1/engagements/${nextEngagement}/document-templates`);
  finishNext(new Response(JSON.stringify({ canManage: false, templates: [], assets: [] })));
  await vi.waitFor(() => expect(view.catalog()?.templates).toEqual([]));
  fixture.destroy();
});
