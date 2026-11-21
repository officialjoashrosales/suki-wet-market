export type UnitKind = 'none' | 'weight' | 'volume' | 'count';

export interface ParsedChecklistLine {
  raw: string;
  name: string;
  /** Quantity in base units: grams, millilitres, or pieces. */
  plannedQty: number | null;
  unitKind: UnitKind;
  note: string | null;
}

const FILLERS = new Set(['only', 'lang']);

const UNIT_ALIASES: Record<string, { kind: Exclude<UnitKind, 'none'>; factor: number }> = {
  kg: { kind: 'weight', factor: 1000 },
  kilo: { kind: 'weight', factor: 1000 },
  kilos: { kind: 'weight', factor: 1000 },
  kl: { kind: 'weight', factor: 1000 },
  g: { kind: 'weight', factor: 1 },
  gram: { kind: 'weight', factor: 1 },
  grams: { kind: 'weight', factor: 1 },
  l: { kind: 'volume', factor: 1000 },
  liter: { kind: 'volume', factor: 1000 },
  liters: { kind: 'volume', factor: 1000 },
  ml: { kind: 'volume', factor: 1 },
  pc: { kind: 'count', factor: 1 },
  pcs: { kind: 'count', factor: 1 },
  piece: { kind: 'count', factor: 1 },
  pieces: { kind: 'count', factor: 1 },
};

const UNIT_KEYS = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);
const NUMBER = '(\\d+(?:\\.\\d+)?)';
const GLUED_UNIT = new RegExp(`^${NUMBER}(${UNIT_KEYS.join('|')})$`, 'i');
const GLUED_PESO = new RegExp(`^(?:php|p|₱)${NUMBER}$`, 'i');
const BARE_NUMBER = new RegExp(`^${NUMBER}$`);

export function parseChecklistText(text: string): ParsedChecklistLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseChecklistLine(line))
    .filter((line): line is ParsedChecklistLine => line !== null);
}

export function parseChecklistLine(line: string): ParsedChecklistLine | null {
  const raw = line.trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/);
  while (tokens.length > 0 && FILLERS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  if (tokens.length === 0) return null;

  const suffix = takeSuffix(tokens);
  const name = tokens.join(' ').trim();
  if (!name) return null;

  return {
    raw,
    name,
    plannedQty: suffix.plannedQty,
    unitKind: suffix.unitKind,
    note: suffix.note,
  };
}

export function mergeParsedLines(lines: ParsedChecklistLine[]): ParsedChecklistLine[] {
  const byName = new Map<string, ParsedChecklistLine>();
  for (const line of lines) {
    const key = line.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...line });
      continue;
    }
    const next: ParsedChecklistLine = { ...prev, raw: `${prev.raw}\n${line.raw}` };
    if (line.plannedQty !== null && prev.plannedQty !== null && line.unitKind === prev.unitKind) {
      next.plannedQty = prev.plannedQty + line.plannedQty;
      next.unitKind = line.unitKind;
    } else if (line.plannedQty !== null) {
      next.plannedQty = line.plannedQty;
      next.unitKind = line.unitKind;
    }
    if (line.note) next.note = line.note;
    byName.set(key, next);
  }
  return Array.from(byName.values());
}

export function formatParsedLine(line: ParsedChecklistLine): string {
  const parts: string[] = [];
  const qty = formatPlannedQty(line);
  if (qty) parts.push(qty);
  if (line.note) parts.push(line.note);
  return parts.join(' · ') || 'name only';
}

export function formatPlannedQty(line: ParsedChecklistLine): string | null {
  if (line.plannedQty === null || line.unitKind === 'none') return null;
  const qty = line.plannedQty;
  if (line.unitKind === 'weight') {
    if (qty >= 1000) return `${trimNumber(qty / 1000)} kg`;
    return `${trimNumber(qty)} g`;
  }
  if (line.unitKind === 'volume') {
    if (qty >= 1000) return `${trimNumber(qty / 1000)} L`;
    return `${trimNumber(qty)} mL`;
  }
  return `${trimNumber(qty)} pc`;
}

function takeSuffix(tokens: string[]): {
  plannedQty: number | null;
  unitKind: UnitKind;
  note: string | null;
} {
  const last = tokens[tokens.length - 1];
  const prev = tokens.length > 1 ? tokens[tokens.length - 2] : null;

  const gluedPeso = last.match(GLUED_PESO);
  if (gluedPeso) {
    tokens.pop();
    return pesoResult(gluedPeso[1]);
  }

  const gluedQty = last.match(GLUED_UNIT);
  if (gluedQty) {
    tokens.pop();
    return qtyResult(gluedQty[1], gluedQty[2]);
  }

  if (prev && /^(?:pesos?)$/i.test(last) && BARE_NUMBER.test(prev)) {
    tokens.pop();
    tokens.pop();
    return pesoResult(prev);
  }

  if (prev && UNIT_ALIASES[last.toLowerCase()] && BARE_NUMBER.test(prev)) {
    tokens.pop();
    tokens.pop();
    return qtyResult(prev, last);
  }

  if (prev && /^(?:php|p|₱)$/i.test(prev) && BARE_NUMBER.test(last)) {
    tokens.pop();
    tokens.pop();
    return pesoResult(last);
  }

  if (BARE_NUMBER.test(last)) {
    tokens.pop();
    return pesoResult(last);
  }

  return { plannedQty: null, unitKind: 'none', note: null };
}

function qtyResult(amount: string, unitToken: string): {
  plannedQty: number | null;
  unitKind: UnitKind;
  note: string | null;
} {
  const alias = UNIT_ALIASES[unitToken.toLowerCase()];
  const n = Number(amount);
  if (!alias || !Number.isFinite(n) || n <= 0) {
    return { plannedQty: null, unitKind: 'none', note: null };
  }
  return {
    plannedQty: Math.round(n * alias.factor),
    unitKind: alias.kind,
    note: null,
  };
}

function pesoResult(amount: string): {
  plannedQty: number | null;
  unitKind: UnitKind;
  note: string | null;
} {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return { plannedQty: null, unitKind: 'none', note: null };
  }
  return { plannedQty: null, unitKind: 'none', note: pesoNote(n) };
}

function pesoNote(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `₱${rounded.toFixed(2)} worth`;
}

function trimNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
