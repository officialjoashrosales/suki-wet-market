import {
  budgetStatus,
  comparePrice,
  costForWeight,
  formatMoney,
  formatPerBase,
  formatWeight,
  fractionLabel,
  parseMoneyInput,
  pricePerBase,
  weightForBudget,
} from './pricing';

describe('parseMoneyInput', () => {
  it('parses plain and formatted pesos', () => {
    expect(parseMoneyInput('100')).toBe(10000);
    expect(parseMoneyInput('1,240.50')).toBe(124050);
    expect(parseMoneyInput('₱ 85.25')).toBe(8525);
    expect(parseMoneyInput('0.05')).toBe(5);
  });

  it('rejects garbage', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('.')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats centavos', () => {
    expect(formatMoney(124050)).toBe('₱1,240.50');
    expect(formatMoney(5)).toBe('₱0.05');
    expect(formatMoney(0)).toBe('₱0.00');
    expect(formatMoney(-1200)).toBe('-₱12.00');
  });
});

describe('pricePerBase', () => {
  it('computes per gram from per kilo', () => {
    expect(pricePerBase(10000, 1000)).toBe(10);
  });
  it('guards invalid inputs', () => {
    expect(pricePerBase(0, 1000)).toBeNull();
    expect(pricePerBase(100, 0)).toBeNull();
  });
});

describe('weightForBudget', () => {
  it('₱50 of ₱100/kg is half a kilo', () => {
    expect(weightForBudget(5000, 10000, 1000)).toBe(500);
    expect(fractionLabel(500, 1000, 'kg')).toBe('1/2 kg');
  });
  it('₱20 of ₱100/kg is one fifth', () => {
    expect(weightForBudget(2000, 10000, 1000)).toBe(200);
    expect(fractionLabel(200, 1000, 'kg')).toBe('1/5 kg');
  });
  it('₱75 of ₱100/kg is 750 g', () => {
    expect(weightForBudget(7500, 10000, 1000)).toBe(750);
    expect(fractionLabel(750, 1000, 'kg')).toBe('3/4 kg');
  });
  it('rejects zero price', () => {
    expect(weightForBudget(5000, 0, 1000)).toBeNull();
  });
});

describe('costForWeight', () => {
  it('round-trips with weightForBudget', () => {
    const weight = weightForBudget(5000, 10000, 1000);
    expect(weight).toBe(500);
    expect(costForWeight(10000, weight as number, 1000)).toBe(5000);
  });
  it('₱100/kg at 750 g costs ₱75', () => {
    expect(costForWeight(10000, 750, 1000)).toBe(7500);
  });
});

describe('budgetStatus', () => {
  it('under budget', () => {
    const s = budgetStatus(150000, 62000);
    expect(s.state).toBe('under');
    expect(s.remainingCentavos).toBe(88000);
  });
  it('near budget at 10 percent left', () => {
    expect(budgetStatus(100000, 92000).state).toBe('near');
  });
  it('over budget reports overage', () => {
    const s = budgetStatus(100000, 112000);
    expect(s.state).toBe('over');
    expect(s.overageCentavos).toBe(12000);
    expect(s.remainingCentavos).toBe(-12000);
  });
});

describe('comparePrice', () => {
  it('flags cheaper and pricier per base unit', () => {
    const current = { unitPriceCentavos: 10000, qtyInBase: 1000, verified: true };
    const previous = { unitPriceCentavos: 11000, qtyInBase: 1000, verified: true };
    const cheaper = comparePrice(current, previous);
    expect(cheaper.state).toBe('comparable');
    expect(cheaper.deltaCentavos).toBeLessThan(0);
    expect(comparePrice(previous, current).deltaCentavos).toBeGreaterThan(0);
  });

  it('compares across different purchased weights', () => {
    // ₱50 for 500 g vs ₱110 for 1 kg -> ₱100/kg vs ₱110/kg
    const current = { unitPriceCentavos: 5000, qtyInBase: 500, verified: true };
    const previous = { unitPriceCentavos: 11000, qtyInBase: 1000, verified: true };
    expect(comparePrice(current, previous).deltaPct).toBeCloseTo(-9.09, 1);
  });

  it('partial when conversion is unverified', () => {
    expect(
      comparePrice(
        { unitPriceCentavos: 10000, qtyInBase: 1000, verified: false },
        { unitPriceCentavos: 9000, qtyInBase: 1000, verified: true },
      ).state,
    ).toBe('partial');
  });

  it('none when either side lacks a unit quantity', () => {
    expect(
      comparePrice(
        { unitPriceCentavos: null, qtyInBase: null, verified: false },
        { unitPriceCentavos: 9000, qtyInBase: 1000, verified: true },
      ).state,
    ).toBe('none');
  });
});

describe('formatting', () => {
  it('shows prices per human unit', () => {
    expect(formatPerBase(10, 'g')).toBe('₱100/kg');
    expect(formatPerBase(0.15, 'g')).toBe('₱1.50/kg');
    expect(formatPerBase(0.5, 'g')).toBe('₱5/kg');
    expect(formatPerBase(2500, 'pc')).toBe('₱25/pc');
  });
  it('formats weights', () => {
    expect(formatWeight(500, 'g')).toBe('500 g');
    expect(formatWeight(1250, 'g')).toBe('1.25 kg');
    expect(formatWeight(3, 'pc')).toBe('3 pcs');
    expect(formatWeight(1, 'pc')).toBe('1 pc');
  });
  it('only produces clean fractions', () => {
    expect(fractionLabel(333, 1000, 'kg')).toBe('1/3 kg');
    expect(fractionLabel(2000, 1000, 'kg')).toBe('2 kg');
    expect(fractionLabel(417, 1000, 'kg')).toBeNull();
  });
});
