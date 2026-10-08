/**
 * CSV cells for exports a spreadsheet may open (DN-03, option A). A text cell that begins with a
 * character a spreadsheet would evaluate is prefixed with an apostrophe, so it is displayed as
 * text. Amount and count cells are never altered: a leading minus is a sign, not a formula.
 */
const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r'];

export function csvCell(value: string, kind: 'text' | 'amount' = 'text'): string {
  const safe = kind === 'text' && FORMULA_LEADERS.some(leader => value.startsWith(leader)) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** One CSV record. `amountColumns` names the zero-based columns that hold numbers and are never neutralized. */
export function csvLine(row: readonly string[], amountColumns: readonly number[]): string {
  return row.map((value, index) => csvCell(value, amountColumns.includes(index) ? 'amount' : 'text')).join(',');
}
