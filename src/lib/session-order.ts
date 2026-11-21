/**
 * Pure helpers for session-list reordering. No React or database imports so
 * the ordering rules can be tested in isolation and reused by the UI.
 */

export type SessionSection = 'to_buy' | 'bought' | 'skipped';

export interface OrderableSessionItem {
  id: string;
  state: SessionSection;
}

export interface RowLayout {
  y: number;
  height: number;
}

function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Ids of `section` after moving the row at `from` to `to`.
 * Invalid indices, duplicate ids and no-ops return the original section order.
 */
export function reorderWithinSection<T extends OrderableSessionItem>(
  items: readonly T[],
  section: SessionSection,
  from: number,
  to: number,
): string[] {
  const ids = items.filter((item) => item.state === section).map((item) => item.id);
  if (
    from === to ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= ids.length ||
    to >= ids.length ||
    hasDuplicates(ids)
  ) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Rebuilds the global id order by replacing only the slots occupied by
 * `section`. Other sections keep their ids, slots and relative order.
 */
export function buildOrderedIds<T extends OrderableSessionItem>(
  items: readonly T[],
  section: SessionSection,
  reorderedSectionIds: readonly string[],
): string[] {
  const original = items.map((item) => item.id);
  const slots: number[] = [];
  items.forEach((item, index) => {
    if (item.state === section) slots.push(index);
  });

  const existing = slots.map((index) => original[index]);
  if (
    slots.length === 0 ||
    slots.length !== reorderedSectionIds.length ||
    hasDuplicates(existing) ||
    hasDuplicates(reorderedSectionIds) ||
    reorderedSectionIds.some((id) => !existing.includes(id))
  ) {
    return original;
  }

  const next = [...original];
  slots.forEach((index, slot) => {
    next[index] = reorderedSectionIds[slot];
  });
  return next;
}

/**
 * TranslateY that lands a dragged row in `targetId`'s slot.
 *
 * Moving down, displaced rows shift up by the dragged row's height, so the
 * destination is `target.y + target.height - dragged.height`, not `target.y`.
 * Moving up, the dragged row simply takes the target's original slot.
 * Returns null when either row has not been measured yet.
 */
export function dropTranslateY(
  layouts: Readonly<Record<string, RowLayout>>,
  draggedId: string,
  targetId: string,
  movingDown: boolean,
): number | null {
  const dragged = layouts[draggedId];
  const target = layouts[targetId];
  if (!dragged || !target) return null;
  return movingDown
    ? target.y + target.height - dragged.height - dragged.y
    : target.y - dragged.y;
}
