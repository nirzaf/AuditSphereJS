import { z } from 'zod';
export const states = ['LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'] as const;
export const fslis = ['Cash and equivalents','Trade receivables','Property and equipment','Trade payables','Equity','Revenue','Operating expenses'] as const;
export const uploadSchema = z.object({ filename: z.string().regex(/^[^/\\]+\.csv$/i).max(200), csv: z.string().min(1).max(15_000_000) });
export const mappingSchema = z.object({ idempotencyKey: z.uuid(), changes: z.array(z.object({ rowId: z.uuid(), expectedVersion: z.number().int().positive(), fsli: z.enum(fslis) })).min(1).max(500) }).refine(v => new Set(v.changes.map(c => c.rowId)).size === v.changes.length, 'Duplicate row IDs');
export const finalizeSchema = z.object({ expectedVersion: z.number().int().positive() });
export const moneySchema = z.string().regex(/^-?\d{1,18}(\.\d{1,2})?$/);
export interface TrialBalanceRow { id: string; code: string; name: string; current: string; prior: string; fsli: string | null; version: number; }
export function nextState(current: string): string | undefined { const i = states.indexOf(current as typeof states[number]); return i < 0 ? undefined : states[i + 1]; }
