import {
  buildOrderedIds,
  dropTranslateY,
  reorderWithinSection,
  type OrderableSessionItem,
} from './session-order';

function row(id: string, state: OrderableSessionItem['state'] = 'to_buy'): OrderableSessionItem {
  return { id, state };
}

const mixed: OrderableSessionItem[] = [
  row('a'),
  row('skip-1', 'skipped'),
  row('b'),
  row('c'),
  row('done-1', 'bought'),
  row('d'),
  row('done-2', 'bought'),
];

describe('reorderWithinSection', () => {
  it('moves a row down within its section', () => {
    expect(reorderWithinSection(mixed, 'to_buy', 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a row up within its section', () => {
    expect(reorderWithinSection(mixed, 'to_buy', 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the original order for a no-op', () => {
    expect(reorderWithinSection(mixed, 'to_buy', 1, 1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never pulls ids from another section', () => {
    const reordered = reorderWithinSection(mixed, 'skipped', 0, 0);
    expect(reordered).toEqual(['skip-1']);
    expect(reordered).not.toContain('a');
  });

  it('handles an empty section', () => {
    expect(reorderWithinSection(mixed, 'bought', -1, -1)).toEqual(['done-1', 'done-2']);
  });

  it('ignores invalid indices and duplicate ids', () => {
    expect(reorderWithinSection(mixed, 'to_buy', -1, 2)).toEqual(['a', 'b', 'c', 'd']);
    expect(reorderWithinSection(mixed, 'to_buy', 0, 9)).toEqual(['a', 'b', 'c', 'd']);
    expect(reorderWithinSection(mixed, 'to_buy', 0.5, 2)).toEqual(['a', 'b', 'c', 'd']);
    expect(
      reorderWithinSection([row('x'), row('x'), row('y')], 'to_buy', 0, 2),
    ).toEqual(['x', 'x', 'y']);
  });
});

describe('buildOrderedIds', () => {
  it('applies a section permutation without moving other sections', () => {
    const reordered = reorderWithinSection(mixed, 'to_buy', 0, 2);
    expect(buildOrderedIds(mixed, 'to_buy', reordered)).toEqual([
      'b',
      'skip-1',
      'c',
      'a',
      'done-1',
      'd',
      'done-2',
    ]);
  });

  it('keeps every id and relative order outside the target section', () => {
    const reordered = reorderWithinSection(mixed, 'bought', 0, 1);
    const result = buildOrderedIds(mixed, 'bought', reordered);
    expect(result.filter((id) => !id.startsWith('done-'))).toEqual(
      mixed.filter((item) => item.state !== 'bought').map((item) => item.id),
    );
  });

  it('returns the original order for invalid input', () => {
    const original = mixed.map((item) => item.id);
    expect(buildOrderedIds(mixed, 'to_buy', [])).toEqual(original);
    expect(buildOrderedIds(mixed, 'to_buy', ['a', 'b'])).toEqual(original);
    expect(buildOrderedIds(mixed, 'to_buy', ['a', 'a', 'c', 'd'])).toEqual(original);
    expect(buildOrderedIds(mixed, 'to_buy', ['a', 'b', 'c', 'missing'])).toEqual(original);
  });
});

describe('dropTranslateY', () => {
  const layouts = {
    a: { y: 0, height: 100 },
    b: { y: 108, height: 50 },
    c: { y: 166, height: 80 },
  };

  it('uses the destination slot when moving up', () => {
    expect(dropTranslateY(layouts, 'c', 'b', false)).toBe(-58);
  });

  it('accounts for variable row heights when moving down', () => {
    // destination = b.y + b.height - a.height = 108 + 50 - 100 = 58
    expect(dropTranslateY(layouts, 'a', 'b', true)).toBe(58);
  });

  it('returns null when a row is not measured', () => {
    expect(dropTranslateY(layouts, 'a', 'missing', true)).toBeNull();
  });
});
