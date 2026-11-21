import {
  formatParsedLine,
  mergeParsedLines,
  parseChecklistLine,
  parseChecklistText,
} from './checklist-parse';

describe('parseChecklistLine', () => {
  it('parses Pakbet 1kl as a kilogram', () => {
    expect(parseChecklistLine('Pakbet 1kl')).toMatchObject({
      name: 'Pakbet',
      plannedQty: 1000,
      unitKind: 'weight',
      note: null,
    });
  });

  it('parses Sili P20 as a peso-worth note', () => {
    expect(parseChecklistLine('Sili P20')).toMatchObject({
      name: 'Sili',
      plannedQty: null,
      unitKind: 'none',
      note: '₱20.00 worth',
    });
  });

  it('parses a bare number as pesos, not pieces', () => {
    expect(parseChecklistLine('Sili 20')).toMatchObject({
      name: 'Sili',
      plannedQty: null,
      unitKind: 'none',
      note: '₱20.00 worth',
    });
  });

  it('parses Cabbage 2pcs only and ignores filler', () => {
    expect(parseChecklistLine('Cabbage 2pcs only')).toMatchObject({
      name: 'Cabbage',
      plannedQty: 2,
      unitKind: 'count',
      note: null,
    });
  });

  it('parses a name-only line', () => {
    expect(parseChecklistLine('Calamansi')).toMatchObject({
      name: 'Calamansi',
      plannedQty: null,
      unitKind: 'none',
      note: null,
    });
  });

  it('parses 500g vs 1kl', () => {
    expect(parseChecklistLine('Sitaw 500g')?.plannedQty).toBe(500);
    expect(parseChecklistLine('Sitaw 1kl')?.plannedQty).toBe(1000);
  });

  it('parses spaced units and peso spellings', () => {
    expect(parseChecklistLine('Cabbage 2 pcs')?.plannedQty).toBe(2);
    expect(parseChecklistLine('Sili 20 pesos')?.note).toBe('₱20.00 worth');
    expect(parseChecklistLine('Sili Php20')?.note).toBe('₱20.00 worth');
    expect(parseChecklistLine('Sili ₱20')?.note).toBe('₱20.00 worth');
    expect(parseChecklistLine('Sili Php 20')?.note).toBe('₱20.00 worth');
  });

  it('ignores lang filler', () => {
    expect(parseChecklistLine('Sili 1kg lang')).toMatchObject({
      name: 'Sili',
      plannedQty: 1000,
      unitKind: 'weight',
    });
  });

  it('returns null for empty lines', () => {
    expect(parseChecklistLine('')).toBeNull();
    expect(parseChecklistLine('   ')).toBeNull();
    expect(parseChecklistLine('only')).toBeNull();
  });
});

describe('parseChecklistText', () => {
  it('skips blanks and keeps the three sample formats', () => {
    const lines = parseChecklistText(`
Pakbet 1kl

Sili P20
Cabbage 2pcs only
Calamansi
`);
    expect(lines.map((l) => l.name)).toEqual(['Pakbet', 'Sili', 'Cabbage', 'Calamansi']);
    expect(formatParsedLine(lines[0])).toBe('1 kg');
    expect(formatParsedLine(lines[1])).toBe('₱20.00 worth');
    expect(formatParsedLine(lines[2])).toBe('2 pc');
    expect(formatParsedLine(lines[3])).toBe('name only');
  });
});

describe('mergeParsedLines', () => {
  it('combines qty when the dimension matches', () => {
    const merged = mergeParsedLines([
      parseChecklistLine('Pakbet 1kl')!,
      parseChecklistLine('Pakbet 500g')!,
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].plannedQty).toBe(1500);
  });

  it('lets the last non-empty qty win across dimensions', () => {
    const merged = mergeParsedLines([
      parseChecklistLine('Sili 1kl')!,
      parseChecklistLine('Sili 2pcs')!,
    ]);
    expect(merged[0].plannedQty).toBe(2);
    expect(merged[0].unitKind).toBe('count');
  });

  it('keeps a peso note alongside a later qty from another line', () => {
    const merged = mergeParsedLines([
      parseChecklistLine('Sili P20')!,
      parseChecklistLine('Sili 1kl')!,
    ]);
    expect(merged[0].note).toBe('₱20.00 worth');
    expect(merged[0].plannedQty).toBe(1000);
  });
});
