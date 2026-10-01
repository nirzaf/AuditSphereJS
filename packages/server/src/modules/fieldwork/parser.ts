import { parse } from 'csv-parse/sync';
import { moneySchema } from '@auditsphere/contracts';
export function parseTrialBalance(csv: string) {
  const records: Record<string, string>[] = parse(csv, { columns: true, skip_empty_lines: true, bom: true, max_record_size: 4096 });
  if (!records.length || records.length > 50_000) throw new Error('Import must contain 1â€“50,000 rows');
  const codes = new Set<string>();
  return records.map((r, position) => {
    if (!r.code?.trim() || !r.name?.trim() || r.code.length > 80 || r.name.length > 300 || codes.has(r.code.trim())) throw new Error(`Invalid or duplicate account at row ${position + 2}`);
    codes.add(r.code.trim());
    return { position, code: r.code.trim(), name: r.name.trim(), current: moneySchema.parse(r.current), prior: moneySchema.parse(r.prior) };
  });
}
