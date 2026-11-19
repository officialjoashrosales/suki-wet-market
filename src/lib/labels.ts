import { formatMoney, formatMoneyCompact, formatPerBase, formatWeight, pricePerBase } from './pricing';

export type DisplayBase = 'g' | 'mL' | 'pc';

export interface PriceLike {
  totalCentavos: number;
  unitPriceCentavos: number | null;
  qtyInBase: number | null;
  unitLabel?: string | null;
}

/** "₱100/kg" when the unit price is known, otherwise "₱120". */
export function unitPriceLabel(entry: PriceLike | null, baseUnit: DisplayBase | null): string | null {
  if (!entry) return null;
  if (entry.unitPriceCentavos === null || entry.qtyInBase === null || entry.qtyInBase <= 0) {
    return formatMoneyCompact(entry.totalCentavos);
  }
  if (!baseUnit) {
    return entry.unitLabel
      ? `${formatMoneyCompact(entry.unitPriceCentavos)}/${entry.unitLabel}`
      : formatMoneyCompact(entry.unitPriceCentavos);
  }
  const per = pricePerBase(entry.unitPriceCentavos, entry.qtyInBase);
  if (per === null) return formatMoneyCompact(entry.totalCentavos);
  return formatPerBase(per, baseUnit);
}

export function quantityLabel(entry: PriceLike | null, baseUnit: DisplayBase | null): string | null {
  if (!entry || entry.qtyInBase === null || entry.qtyInBase <= 0) return null;
  if (!baseUnit) {
    return entry.unitLabel
      ? `${formatCompactQty(entry.qtyInBase)} ${entry.unitLabel}`
      : `${entry.qtyInBase}`;
  }
  return formatWeight(entry.qtyInBase, baseUnit);
}

export function paidLabel(totalCentavos: number): string {
  return formatMoney(totalCentavos);
}

function formatCompactQty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function priceDeltaLabel(current: number, previous: number): string {
  const diff = current - previous;
  const pct = previous === 0 ? 0 : (diff / previous) * 100;
  const arrow = diff === 0 ? '=' : diff < 0 ? '↓' : '↑';
  return `${arrow} ${Math.abs(Math.round(pct))}%`;
}
