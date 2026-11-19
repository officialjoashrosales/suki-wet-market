import { and, asc, desc, eq, isNull, like } from 'drizzle-orm';

import { comparePrice, pricePerBase, type Comparison, type PricePoint } from '../lib/pricing';
import { nowIso, todayIso, uuidv7 } from '../lib/id';
import { db, sqlite } from './index';
import { item, itemUnit, session } from './schema';

export type Dimension = 'weight' | 'volume' | 'count' | 'unspecified';
export type BaseUnit = 'g' | 'mL' | 'pc';
export type UnitKind = 'none' | 'weight' | 'volume' | 'count';
export type SessionItemState = 'to_buy' | 'bought' | 'skipped';

export interface ItemRecord {
  id: string;
  name: string;
  category: string;
  dimension: Dimension;
  baseUnit: BaseUnit | null;
  displayUnit: string | null;
  notes: string | null;
  archivedAt: string | null;
}

export interface UnitRecord {
  id: string;
  itemId: string;
  label: string;
  qtyInBase: number | null;
  verified: boolean;
  isDefault: boolean;
}

export interface EntryPoint extends PricePoint {
  id: string;
  sessionItemId: string | null;
  totalCentavos: number;
  unitLabel: string | null;
  unitQtyInBase: number | null;
  purchasedAt: string;
}

export interface ItemSummary extends ItemRecord {
  units: UnitRecord[];
  lastEntry: EntryPoint | null;
  lowestPerBase: number | null;
  lowestVerified: boolean;
  purchaseCount: number;
  lastPurchasedAt: string | null;
}

export interface SessionRecord {
  id: string;
  name: string;
  occurredOn: string;
  budgetCentavos: number;
  status: 'draft' | 'active' | 'closed';
  duplicatedFrom: string | null;
  spentCentavos: number;
  itemCount: number;
}

export interface SessionItemView {
  id: string;
  itemId: string;
  name: string;
  category: string;
  state: SessionItemState;
  plannedQty: number | null;
  plannedUnitId: string | null;
  plannedUnitLabel: string | null;
  plannedUnitQty: number | null;
  dimension: Dimension;
  baseUnit: BaseUnit | null;
  displayUnit: string | null;
  entry: EntryPoint | null;
  previous: EntryPoint | null;
  comparison: Comparison | null;
  lowestPerBase: number | null;
  lowestVerified: boolean;
}

const UNITS_BY_KIND: Record<UnitKind, { dimension: Dimension; baseUnit: BaseUnit | null; displayUnit: string | null; label: string; qtyInBase: number | null }> = {
  none: { dimension: 'unspecified', baseUnit: null, displayUnit: null, label: '', qtyInBase: null },
  weight: { dimension: 'weight', baseUnit: 'g', displayUnit: 'kg', label: 'kg', qtyInBase: 1000 },
  volume: { dimension: 'volume', baseUnit: 'mL', displayUnit: 'L', label: 'L', qtyInBase: 1000 },
  count: { dimension: 'count', baseUnit: 'pc', displayUnit: 'pc', label: 'pc', qtyInBase: 1 },
};

function toItemRecord(row: typeof item.$inferSelect): ItemRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    dimension: row.dimension as Dimension,
    baseUnit: (row.baseUnit as BaseUnit | null) ?? null,
    displayUnit: row.displayUnit,
    notes: row.notes,
    archivedAt: row.archivedAt,
  };
}

function toUnitRecord(row: typeof itemUnit.$inferSelect): UnitRecord {
  return {
    id: row.id,
    itemId: row.itemId,
    label: row.label,
    qtyInBase: row.qtyInBase,
    verified: row.verified,
    isDefault: row.isDefault,
  };
}

export function unitKindFor(item: ItemRecord): UnitKind {
  if (item.dimension === 'weight') return 'weight';
  if (item.dimension === 'volume') return 'volume';
  if (item.dimension === 'count') return 'count';
  return 'none';
}

export const CATEGORIES = ['Pork', 'Beef', 'Chicken', 'Fish', 'Seafood', 'Vegetables', 'Fruit', 'Rice & Grains', 'Pantry', 'Other'];

// ---------------------------------------------------------------- items

export async function listItems(search?: string, includeArchived = false): Promise<ItemSummary[]> {
  const conditions = [];
  if (!includeArchived) conditions.push(isNull(item.archivedAt));
  if (search && search.trim()) conditions.push(like(item.name, `%${search.trim()}%`));

  const itemRows = await db
    .select()
    .from(item)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(item.name));

  const unitRows = await db.select().from(itemUnit);
  const entryRows = await sqlite.getAllAsync<{
    id: string;
    item_id: string;
    total_centavos: number;
    unit_price_centavos: number | null;
    qty_in_base: number | null;
    purchased_at: string;
    label: string | null;
    unit_qty: number | null;
    verified: number | null;
  }>(
    `SELECT p.id, p.item_id, p.total_centavos, p.unit_price_centavos, p.qty_in_base,
            p.purchased_at, u.label, u.qty_in_base AS unit_qty, u.verified
     FROM price_entry p
     LEFT JOIN item_unit u ON u.id = p.item_unit_id
     WHERE p.kind = 'purchased'
     ORDER BY p.purchased_at DESC, p.created_at DESC`,
  );

  const entriesByItem = new Map<string, EntryPoint[]>();
  for (const row of entryRows) {
    const list = entriesByItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      sessionItemId: null,
      totalCentavos: row.total_centavos,
      unitPriceCentavos: row.unit_price_centavos,
      qtyInBase: row.qty_in_base,
      unitLabel: row.label,
      unitQtyInBase: row.unit_qty,
      verified: row.verified === null ? true : row.verified === 1,
      purchasedAt: row.purchased_at,
    });
    entriesByItem.set(row.item_id, list);
  }

  return itemRows.map((row) => {
    const record = toItemRecord(row);
    const entries = entriesByItem.get(record.id) ?? [];
    const lowest = lowestPrice(entries);
    return {
      ...record,
      units: unitRows.filter((u) => u.itemId === record.id).map(toUnitRecord),
      lastEntry: entries[0] ?? null,
      lowestPerBase: lowest?.perBase ?? null,
      lowestVerified: lowest?.verified ?? true,
      purchaseCount: entries.length,
      lastPurchasedAt: entries[0]?.purchasedAt ?? null,
    };
  });
}

function lowestPrice(entries: EntryPoint[]): { perBase: number; verified: boolean } | null {
  let best: { perBase: number; verified: boolean } | null = null;
  for (const entry of entries) {
    if (entry.unitPriceCentavos === null || entry.qtyInBase === null) continue;
    const per = pricePerBase(entry.unitPriceCentavos, entry.qtyInBase);
    if (per === null) continue;
    if (best === null || per < best.perBase - 1e-9) {
      best = { perBase: per, verified: entry.verified };
    } else if (Math.abs(per - best.perBase) < 1e-9 && entry.verified) {
      best.verified = true;
    }
  }
  return best;
}

export async function getItem(id: string): Promise<ItemRecord | null> {
  const rows = await db.select().from(item).where(eq(item.id, id)).limit(1);
  return rows[0] ? toItemRecord(rows[0]) : null;
}

export async function listUnits(itemId: string): Promise<UnitRecord[]> {
  const rows = await db.select().from(itemUnit).where(eq(itemUnit.itemId, itemId)).orderBy(desc(itemUnit.isDefault), asc(itemUnit.label));
  return rows.map(toUnitRecord);
}

export async function createItem(input: {
  name: string;
  category?: string;
  unitKind?: UnitKind;
  notes?: string | null;
}): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const kind = UNITS_BY_KIND[input.unitKind ?? 'none'];
  await db.insert(item).values({
    id,
    name: input.name.trim(),
    category: input.category ?? 'Other',
    dimension: kind.dimension,
    baseUnit: kind.baseUnit,
    displayUnit: kind.displayUnit,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  if (kind.label) {
    await db.insert(itemUnit).values({
      id: uuidv7(),
      itemId: id,
      label: kind.label,
      qtyInBase: kind.qtyInBase,
      verified: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return id;
}

export async function updateItem(
  id: string,
  patch: { name?: string; category?: string; notes?: string | null },
): Promise<void> {
  await db
    .update(item)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(item.id, id));
}

export async function addItemUnit(
  itemId: string,
  input: { label: string; qtyInBase: number | null },
): Promise<string> {
  const now = nowIso();
  const existing = await listUnits(itemId);
  const id = uuidv7();
  await db.insert(itemUnit).values({
    id,
    itemId,
    label: input.label.trim(),
    qtyInBase: input.qtyInBase,
    verified: input.qtyInBase !== null,
    isDefault: existing.length === 0,
    createdAt: now,
    updatedAt: now,
  });

  // Adding the first measured unit upgrades a unit-less item.
  if (existing.length === 0 && input.qtyInBase !== null) {
    const record = await getItem(itemId);
    if (record && record.baseUnit === null) {
      const baseUnit: BaseUnit = input.label.toLowerCase().includes('kg') ? 'g' : 'pc';
      await db
        .update(item)
        .set({
          dimension: baseUnit === 'g' ? 'weight' : 'count',
          baseUnit,
          displayUnit: baseUnit === 'g' ? 'kg' : 'pc',
          updatedAt: now,
        })
        .where(eq(item.id, itemId));
    }
  }
  return id;
}

export async function deleteItemUnit(unitId: string): Promise<void> {
  const used = await sqlite.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM price_entry WHERE item_unit_id = ?',
    [unitId],
  );
  if ((used?.n ?? 0) > 0) throw new Error('Unit is used by price history and cannot be deleted.');
  await db.delete(itemUnit).where(eq(itemUnit.id, unitId));
}

export async function setItemArchived(id: string, archived: boolean): Promise<void> {
  await db
    .update(item)
    .set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() })
    .where(eq(item.id, id));
}

export async function deleteItem(id: string): Promise<void> {
  const used = await sqlite.getFirstAsync<{ prices: number; list: number }>(
    `SELECT
       (SELECT COUNT(*) FROM price_entry WHERE item_id = ?) AS prices,
       (SELECT COUNT(*) FROM session_item WHERE item_id = ?) AS list`,
    [id, id],
  );
  if ((used?.prices ?? 0) > 0 || (used?.list ?? 0) > 0) {
    throw new Error('This item has history. Archive it instead so comparisons are kept.');
  }
  await db.delete(itemUnit).where(eq(itemUnit.itemId, id));
  await db.delete(item).where(eq(item.id, id));
}

export async function getItemHistory(itemId: string): Promise<EntryPoint[]> {
  const rows = await sqlite.getAllAsync<{
    id: string;
    total_centavos: number;
    unit_price_centavos: number | null;
    qty_in_base: number | null;
    purchased_at: string;
    label: string | null;
    unit_qty: number | null;
    verified: number | null;
  }>(
    `SELECT p.id, p.total_centavos, p.unit_price_centavos, p.qty_in_base, p.purchased_at,
            u.label, u.qty_in_base AS unit_qty, u.verified
     FROM price_entry p
     LEFT JOIN item_unit u ON u.id = p.item_unit_id
     WHERE p.item_id = ? AND p.kind = 'purchased'
     ORDER BY p.purchased_at DESC, p.created_at DESC`,
    [itemId],
  );
  return rows.map((row) => ({
    id: row.id,
    sessionItemId: null,
    totalCentavos: row.total_centavos,
    unitPriceCentavos: row.unit_price_centavos,
    qtyInBase: row.qty_in_base,
    unitLabel: row.label,
    unitQtyInBase: row.unit_qty,
    verified: row.verified === null ? true : row.verified === 1,
    purchasedAt: row.purchased_at,
  }));
}

// -------------------------------------------------------------- sessions

export async function listSessions(): Promise<SessionRecord[]> {
  const rows = await sqlite.getAllAsync<{
    id: string;
    name: string;
    occurred_on: string;
    budget_centavos: number;
    status: 'draft' | 'active' | 'closed';
    duplicated_from: string | null;
    spent: number | null;
    item_count: number | null;
  }>(
    `SELECT s.*,
            (SELECT COALESCE(SUM(p.total_centavos), 0) FROM price_entry p
              WHERE p.session_id = s.id AND p.kind = 'purchased') AS spent,
            (SELECT COUNT(*) FROM session_item si WHERE si.session_id = s.id) AS item_count
     FROM session s
     ORDER BY s.occurred_on DESC, s.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    occurredOn: r.occurred_on,
    budgetCentavos: r.budget_centavos,
    status: r.status,
    duplicatedFrom: r.duplicated_from,
    spentCentavos: r.spent ?? 0,
    itemCount: r.item_count ?? 0,
  }));
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const all = await listSessions();
  return all.find((s) => s.id === id) ?? null;
}

export async function getActiveSession(): Promise<SessionRecord | null> {
  const rows = await sqlite.getAllAsync<{ id: string }>(
    `SELECT id FROM session WHERE status != 'closed' ORDER BY created_at DESC LIMIT 1`,
  );
  if (!rows[0]) return null;
  return getSession(rows[0].id);
}

export async function createSession(input: {
  name: string;
  budgetCentavos: number;
  occurredOn?: string;
}): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await db.insert(session).values({
    id,
    name: input.name.trim() || 'Market run',
    occurredOn: input.occurredOn ?? todayIso(),
    budgetCentavos: input.budgetCentavos,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await sqlite.runAsync(`UPDATE session SET status = 'closed', updated_at = ? WHERE status = 'active' AND id != ?`, [
    now,
    id,
  ]);
  return id;
}

export async function updateSession(
  id: string,
  patch: { name?: string; budgetCentavos?: number; occurredOn?: string; status?: 'draft' | 'active' | 'closed' },
): Promise<void> {
  await db
    .update(session)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(session.id, id));
}

export async function closeSession(id: string): Promise<void> {
  await updateSession(id, { status: 'closed' });
}

export async function deleteSession(id: string): Promise<void> {
  await sqlite.withTransactionAsync(async () => {
    await sqlite.runAsync(`DELETE FROM price_entry WHERE session_id = ?`, [id]);
    await sqlite.runAsync(`DELETE FROM session WHERE id = ?`, [id]);
  });
}

export async function duplicateSession(
  sourceId: string,
  options: { includeBought: boolean; copyQty: boolean; budgetCentavos?: number; occurredOn?: string },
): Promise<string> {
  const source = await getSession(sourceId);
  if (!source) throw new Error('Session not found');

  const newId = uuidv7();
  const now = nowIso();
  const items = await sqlite.getAllAsync<{
    item_id: string;
    planned_qty: number | null;
    planned_unit_id: string | null;
    state: string;
    sort_order: number;
  }>('SELECT item_id, planned_qty, planned_unit_id, state, sort_order FROM session_item WHERE session_id = ? ORDER BY sort_order', [
    sourceId,
  ]);

  await sqlite.withTransactionAsync(async () => {
    await sqlite.runAsync(
      `INSERT INTO session (id, name, occurred_on, budget_centavos, status, duplicated_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        newId,
        `${source.name} (copy)`,
        options.occurredOn ?? todayIso(),
        options.budgetCentavos ?? source.budgetCentavos,
        sourceId,
        now,
        now,
      ],
    );
    await sqlite.runAsync(
      `UPDATE session SET status = 'closed', updated_at = ? WHERE status = 'active' AND id != ?`,
      [now, newId],
    );
    for (const row of items) {
      if (!options.includeBought && row.state === 'bought') continue;
      await sqlite.runAsync(
        `INSERT INTO session_item
          (id, session_id, item_id, planned_qty, planned_unit_id, state, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'to_buy', ?, ?, ?)`,
        [
          uuidv7(),
          newId,
          row.item_id,
          options.copyQty ? row.planned_qty : null,
          options.copyQty ? row.planned_unit_id : null,
          row.sort_order,
          now,
          now,
        ],
      );
    }
  });
  return newId;
}

// --------------------------------------------------------- session items

export async function addItemsToSession(sessionId: string, itemIds: string[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const now = nowIso();
  const maxRow = await sqlite.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sort_order) AS maxOrder FROM session_item WHERE session_id = ?',
    [sessionId],
  );
  let order = (maxRow?.maxOrder ?? -1) + 1;
  let added = 0;
  await sqlite.withTransactionAsync(async () => {
    for (const itemId of itemIds) {
      const result = await sqlite.runAsync(
        `INSERT OR IGNORE INTO session_item
          (id, session_id, item_id, planned_qty, planned_unit_id, state, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, 'to_buy', ?, ?, ?)`,
        [uuidv7(), sessionId, itemId, order, now, now],
      );
      if (result.changes > 0) {
        added += 1;
        order += 1;
      }
    }
    await sqlite.runAsync('UPDATE session SET updated_at = ? WHERE id = ?', [now, sessionId]);
  });
  return added;
}

export async function removeSessionItem(sessionItemId: string): Promise<void> {
  await sqlite.withTransactionAsync(async () => {
    await sqlite.runAsync('DELETE FROM price_entry WHERE session_item_id = ?', [sessionItemId]);
    await sqlite.runAsync('DELETE FROM session_item WHERE id = ?', [sessionItemId]);
  });
}

export async function updateSessionItemQty(
  sessionItemId: string,
  plannedQty: number | null,
  plannedUnitId: string | null,
): Promise<void> {
  await sqlite.runAsync(
    'UPDATE session_item SET planned_qty = ?, planned_unit_id = ?, updated_at = ? WHERE id = ?',
    [plannedQty, plannedUnitId, nowIso(), sessionItemId],
  );
}

export async function setSessionItemState(sessionItemId: string, state: SessionItemState): Promise<void> {
  if (state !== 'bought') {
    await sqlite.runAsync('DELETE FROM price_entry WHERE session_item_id = ? AND kind = ?', [sessionItemId, 'purchased']);
  }
  await sqlite.runAsync('UPDATE session_item SET state = ?, updated_at = ? WHERE id = ?', [state, nowIso(), sessionItemId]);
}

export async function completeSessionItem(
  sessionItemId: string,
  input: {
    totalCentavos: number;
    unitPriceCentavos?: number | null;
    qtyInBase?: number | null;
    itemUnitId?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const row = await sqlite.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM session_item WHERE id = ?',
    [sessionItemId],
  );
  if (!row) throw new Error('Item not found in session');

  const now = nowIso();
  const unitPrice = input.unitPriceCentavos ?? null;

  await sqlite.withTransactionAsync(async () => {
    await sqlite.runAsync('DELETE FROM price_entry WHERE session_item_id = ?', [sessionItemId]);
    await sqlite.runAsync(
      `INSERT INTO price_entry
        (id, item_id, session_id, session_item_id, item_unit_id, unit_price_centavos, qty_in_base,
         total_centavos, kind, purchased_at, note, created_at, updated_at)
       SELECT ?, si.item_id, si.session_id, si.id, ?, ?, ?, ?, 'purchased', ?, ?, ?, ?
       FROM session_item si WHERE si.id = ?`,
      [
        uuidv7(),
        input.itemUnitId ?? null,
        unitPrice,
        input.qtyInBase ?? null,
        Math.round(input.totalCentavos),
        now,
        input.note ?? null,
        now,
        now,
        sessionItemId,
      ],
    );
    await sqlite.runAsync('UPDATE session_item SET state = ?, updated_at = ? WHERE id = ?', ['bought', now, sessionItemId]);
    await sqlite.runAsync('UPDATE session SET updated_at = ? WHERE id = ?', [now, row.session_id]);
  });
}

// --------------------------------------------------------------- backup

const BACKUP_TABLES: Record<string, string[]> = {
  item: ['id', 'name', 'category', 'dimension', 'base_unit', 'display_unit', 'notes', 'archived_at', 'created_at', 'updated_at'],
  item_unit: ['id', 'item_id', 'label', 'qty_in_base', 'verified', 'is_default', 'created_at', 'updated_at'],
  session: ['id', 'name', 'occurred_on', 'budget_centavos', 'status', 'duplicated_from', 'created_at', 'updated_at'],
  session_item: [
    'id',
    'session_id',
    'item_id',
    'planned_qty',
    'planned_unit_id',
    'state',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  price_entry: [
    'id',
    'item_id',
    'session_id',
    'session_item_id',
    'item_unit_id',
    'unit_price_centavos',
    'qty_in_base',
    'total_centavos',
    'kind',
    'purchased_at',
    'note',
    'created_at',
    'updated_at',
  ],
};

export interface BackupPayload {
  app: 'suki';
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportAll(): Promise<BackupPayload> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const name of Object.keys(BACKUP_TABLES)) {
    tables[name] = await sqlite.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${name}`);
  }
  return { app: 'suki', version: 1, exportedAt: nowIso(), tables };
}

export async function importAll(payload: unknown): Promise<{ imported: number }> {
  const data = payload as BackupPayload;
  if (!data || data.app !== 'suki' || !data.tables) throw new Error('Not a Suki backup file.');
  let imported = 0;

  await sqlite.withTransactionAsync(async () => {
    for (const name of Object.keys(BACKUP_TABLES)) {
      const rows = data.tables[name];
      if (!Array.isArray(rows)) continue;
      const columns = BACKUP_TABLES[name];
      for (const row of rows) {
        const values = columns.map((c) => (row[c] === undefined ? null : row[c]));
        const updates = columns
          .filter((c) => c !== 'id')
          .map((c) => `${c} = excluded.${c}`)
          .join(', ');
        await sqlite.runAsync(
          `INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})
           ON CONFLICT(id) DO UPDATE SET ${updates}`,
          values as never[],
        );
        imported += 1;
      }
    }
  });
  return { imported };
}

// --------------------------------------------------------- session items

export async function listSessionItems(sessionId: string): Promise<SessionItemView[]> {
  const rows = await sqlite.getAllAsync<{
    id: string;
    item_id: string;
    planned_qty: number | null;
    planned_unit_id: string | null;
    state: SessionItemState;
    name: string;
    category: string;
    dimension: Dimension;
    base_unit: BaseUnit | null;
    display_unit: string | null;
    planned_unit_label: string | null;
    planned_unit_qty: number | null;
  }>(
    `SELECT si.id, si.item_id, si.planned_qty, si.planned_unit_id, si.state,
            i.name, i.category, i.dimension, i.base_unit, i.display_unit,
            u.label AS planned_unit_label, u.qty_in_base AS planned_unit_qty
     FROM session_item si
     JOIN item i ON i.id = si.item_id
     LEFT JOIN item_unit u ON u.id = si.planned_unit_id
     WHERE si.session_id = ?
     ORDER BY si.sort_order, i.name`,
    [sessionId],
  );
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => '?').join(',');
  const entryRows = await sqlite.getAllAsync<{
    id: string;
    item_id: string;
    session_item_id: string | null;
    total_centavos: number;
    unit_price_centavos: number | null;
    qty_in_base: number | null;
    purchased_at: string;
    label: string | null;
    unit_qty: number | null;
    verified: number | null;
  }>(
    `SELECT p.id, p.item_id, p.session_item_id, p.total_centavos, p.unit_price_centavos,
            p.qty_in_base, p.purchased_at, u.label, u.qty_in_base AS unit_qty, u.verified
     FROM price_entry p
     LEFT JOIN item_unit u ON u.id = p.item_unit_id
     WHERE p.kind = 'purchased' AND p.item_id IN (${placeholders})
     ORDER BY p.purchased_at DESC, p.created_at DESC`,
    rows.map((r) => r.item_id),
  );

  const byItem = new Map<string, EntryPoint[]>();
  for (const row of entryRows) {
    const list = byItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      sessionItemId: row.session_item_id,
      totalCentavos: row.total_centavos,
      unitPriceCentavos: row.unit_price_centavos,
      qtyInBase: row.qty_in_base,
      unitLabel: row.label,
      unitQtyInBase: row.unit_qty,
      verified: row.verified === null ? true : row.verified === 1,
      purchasedAt: row.purchased_at,
    });
    byItem.set(row.item_id, list);
  }

  return rows.map((row) => {
    const entries = byItem.get(row.item_id) ?? [];
    const entry = entries.find((e) => e.sessionItemId === row.id) ?? null;
    const previous = entries.find((e) => e.id !== entry?.id) ?? null;
    const comparison = entry && previous ? comparePrice(entry, previous) : null;
    const lowest = lowestPrice(entries);
    return {
      id: row.id,
      itemId: row.item_id,
      name: row.name,
      category: row.category,
      state: row.state,
      plannedQty: row.planned_qty,
      plannedUnitId: row.planned_unit_id,
      plannedUnitLabel: row.planned_unit_label,
      plannedUnitQty: row.planned_unit_qty,
      dimension: row.dimension,
      baseUnit: row.base_unit,
      displayUnit: row.display_unit,
      entry,
      previous,
      comparison,
      lowestPerBase: lowest?.perBase ?? null,
      lowestVerified: lowest?.verified ?? true,
    };
  });
}
