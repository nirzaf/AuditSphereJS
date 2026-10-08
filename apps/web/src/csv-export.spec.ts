import { describe, expect, it } from 'vitest';
import { csvCell, csvLine } from './csv-export';

describe('spreadsheet-safe CSV export (DN-03)', () => {
  it('neutralizes text cells that a spreadsheet would evaluate, with an apostrophe', () => {
    expect(csvCell('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvCell('+1+1')).toBe('"\'+1+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('-dash led name')).toBe('"\'-dash led name"');
    expect(csvCell('\tindented')).toBe('"\'\tindented"');
    expect(csvCell('\rcarriage')).toBe('"\'\rcarriage"');
  });

  it('never alters amount or count cells, including negative amounts', () => {
    expect(csvCell('-12.500000', 'amount')).toBe('"-12.500000"');
    expect(csvCell('=1+1', 'amount')).toBe('"=1+1"');
    expect(csvLine(['Revenue', '-200.000000'], [1])).toBe('"Revenue","-200.000000"');
  });

  it('keeps ordinary text unchanged and escapes embedded quotes', () => {
    expect(csvCell('Cash "on hand"')).toBe('"Cash ""on hand"""');
    expect(csvCell('Cash and equivalents')).toBe('"Cash and equivalents"');
  });
});
