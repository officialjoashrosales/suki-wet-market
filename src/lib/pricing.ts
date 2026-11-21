/**
 * Pure pricing math. No React, no DB, no locale APIs.
 * Money is always integer centavos. Weight/volume is always integer base units
 * (grams, millilitres) or whole pieces.
 */

export type ComparisonState = 'comparable' | 'partial' | 'none';

export interface PricePoint {
  unitPriceCentavos: number | null;
  qtyInBase: number | null;
  verified: boolean;
}

export interface Comparison {
  state: ComparisonState;
  deltaCentavos: number;
  deltaPct: number;
}

export interface BudgetStatus {
  state: 'under' | 'near' | 'over';
  remainingCentavos: number;
  overageCentavos: number;
  usedPct: number;
}

/** "1,240.50" | "1240.5" | "1240" -> centavos. Returns null when unparseable. */
export function parseMoneyInput(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₱,\s]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function parseDecimalInput(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function formatMoney(centavos: number): string {
  const negative = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const pesos = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${negative ? '-' : ''}\u20B1${groupDigits(pesos)}.${String(cents).padStart(2, '0')}`;
}

/** Peso values always use 2 decimals; kept as an alias for existing call sites. */
export function formatMoneyCompact(centavos: number): string {
  return formatMoney(centavos);
}

function groupDigits(value: number): string {
  const s = String(Math.floor(value));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatNumber(value: number, maxDecimals = 2): string {
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  const [whole, frac] = String(rounded).split('.');
  const grouped = groupDigits(Number(whole));
  return frac ? `${grouped}.${frac}` : grouped;
}

/** centavos per single base unit (per gram / per mL / per piece). */
export function pricePerBase(unitPriceCentavos: number, qtyInBase: number): number | null {
  if (!Number.isFinite(unitPriceCentavos) || !Number.isFinite(qtyInBase)) return null;
  if (unitPriceCentavos <= 0 || qtyInBase <= 0) return null;
  return unitPriceCentavos / qtyInBase;
}

/** base qty you should receive for a spend amount. */
export function weightForBudget(
  budgetCentavos: number,
  unitPriceCentavos: number,
  qtyInBase: number,
): number | null {
  if (!Number.isFinite(budgetCentavos) || !Number.isFinite(unitPriceCentavos) || !Number.isFinite(qtyInBase)) {
    return null;
  }
  if (budgetCentavos < 0 || unitPriceCentavos <= 0 || qtyInBase <= 0) return null;
  return Math.round((budgetCentavos / unitPriceCentavos) * qtyInBase);
}

/** amount to pay for a base qty. */
export function costForWeight(
  unitPriceCentavos: number,
  qtyInBase: number,
  unitQtyInBase: number,
): number | null {
  if (!Number.isFinite(unitPriceCentavos) || !Number.isFinite(qtyInBase) || !Number.isFinite(unitQtyInBase)) {
    return null;
  }
  if (unitPriceCentavos < 0 || qtyInBase < 0 || unitQtyInBase <= 0) return null;
  return Math.round((qtyInBase / unitQtyInBase) * unitPriceCentavos);
}

export function budgetStatus(budgetCentavos: number, spentCentavos: number): BudgetStatus {
  const remaining = budgetCentavos - spentCentavos;
  const usedPct = budgetCentavos > 0 ? Math.min(999, (spentCentavos / budgetCentavos) * 100) : 0;
  if (spentCentavos > budgetCentavos) {
    return {
      state: 'over',
      remainingCentavos: remaining,
      overageCentavos: spentCentavos - budgetCentavos,
      usedPct,
    };
  }
  const near = budgetCentavos > 0 && remaining <= budgetCentavos * 0.1;
  return {
    state: near ? 'near' : 'under',
    remainingCentavos: remaining,
    overageCentavos: 0,
    usedPct,
  };
}

/**
 * Compare two price points on a per-base-unit basis.
 * - comparable: both sides have price + quantity and verified conversions
 * - partial: comparable math but one side's conversion is unverified
 * - none: missing price or quantity on either side
 */
export function comparePrice(current: PricePoint, previous: PricePoint): Comparison {
  const currentUnit = perBase(current);
  const previousUnit = perBase(previous);
  if (currentUnit === null || previousUnit === null) {
    return { state: 'none', deltaCentavos: 0, deltaPct: 0 };
  }
  const deltaPct = ((currentUnit - previousUnit) / previousUnit) * 100;
  return {
    state: current.verified && previous.verified ? 'comparable' : 'partial',
    deltaCentavos: currentUnit - previousUnit,
    deltaPct,
  };
}

/** per-base price rounded to whole centavos per base unit for display comparisons. */
function perBase(point: PricePoint): number | null {
  if (point.unitPriceCentavos === null || point.qtyInBase === null) return null;
  const per = pricePerBase(point.unitPriceCentavos, point.qtyInBase);
  if (per === null) return null;
  return per * 100; // centavos per 100 base units keeps comparisons stable
}

/** Human price for a base-unit price, e.g. per gram -> per kg. */
export function formatPerBase(
  pricePerBaseUnit: number,
  baseUnit: 'g' | 'mL' | 'pc',
): string {
  if (!Number.isFinite(pricePerBaseUnit) || pricePerBaseUnit <= 0) return '—';
  if (baseUnit === 'pc') return `${formatMoneyCompact(Math.round(pricePerBaseUnit))}/pc`;
  const perKilo = pricePerBaseUnit * 1000;
  if (perKilo >= 100) {
    return `${formatMoneyCompact(Math.round(perKilo))}/${baseUnit === 'g' ? 'kg' : 'L'}`;
  }
  return `${formatMoney(pricePerBaseUnit)}/${baseUnit}`;
}

export function formatWeight(baseQty: number, baseUnit: 'g' | 'mL' | 'pc'): string {
  if (baseUnit === 'pc') return `${formatNumber(baseQty)} ${baseQty === 1 ? 'pc' : 'pcs'}`;
  if (baseUnit === 'g' && baseQty >= 1000) {
    return `${formatNumber(baseQty / 1000, 3)} kg`;
  }
  if (baseUnit === 'mL' && baseQty >= 1000) {
    return `${formatNumber(baseQty / 1000, 3)} L`;
  }
  return `${formatNumber(baseQty)} ${baseUnit}`;
}

const COMMON_FRACTIONS: [number, number, string][] = [
  [1, 8, '1/8'],
  [1, 6, '1/6'],
  [1, 5, '1/5'],
  [1, 4, '1/4'],
  [1, 3, '1/3'],
  [3, 8, '3/8'],
  [2, 5, '2/5'],
  [1, 2, '1/2'],
  [3, 5, '3/5'],
  [5, 8, '5/8'],
  [2, 3, '2/3'],
  [3, 4, '3/4'],
  [4, 5, '4/5'],
  [5, 6, '5/6'],
  [7, 8, '7/8'],
];

/** "500 g of 1 kg" -> "1/2 kg" when a clean fraction exists. */
export function fractionLabel(baseQty: number, unitQtyInBase: number, unitLabel: string): string | null {
  if (unitQtyInBase <= 0) return null;
  const ratio = baseQty / unitQtyInBase;
  if (ratio <= 0) return null;
  const whole = Math.floor(ratio);
  const remainder = ratio - whole;
  if (remainder < 0.02) {
    return whole === 1 ? `1 ${unitLabel}` : `${whole} ${unitLabel}`;
  }
  let best: { diff: number; text: string } | null = null;
  for (const [n, d, label] of COMMON_FRACTIONS) {
    const diff = Math.abs(remainder - n / d);
    if (diff < 0.015 && (best === null || diff < best.diff)) {
      best = { diff, text: label };
    }
  }
  if (!best) return null;
  return whole > 0 ? `${whole} ${best.text} ${unitLabel}` : `${best.text} ${unitLabel}`;
}
