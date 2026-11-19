import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Canonical item catalog. Units are optional: an item may carry no dimension
 * at all, in which case price history is kept but not compared per-unit.
 */
export const item = sqliteTable(
  'item',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Other'),
    /** weight | volume | count | unspecified */
    dimension: text('dimension').notNull().default('unspecified'),
    /** g | mL | pc | null */
    baseUnit: text('base_unit'),
    /** purely presentational, e.g. kg */
    displayUnit: text('display_unit'),
    notes: text('notes'),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    nameIdx: index('idx_item_name').on(t.name),
  }),
);

export const itemUnit = sqliteTable(
  'item_unit',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => item.id, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    qtyInBase: integer('qty_in_base'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    itemIdx: index('idx_unit_item').on(t.itemId),
  }),
);

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    occurredOn: text('occurred_on').notNull(),
    budgetCentavos: integer('budget_centavos').notNull().default(0),
    /** draft | active | closed */
    status: text('status').notNull().default('active'),
    duplicatedFrom: text('duplicated_from'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    dateIdx: index('idx_session_date').on(t.occurredOn),
  }),
);

export const sessionItem = sqliteTable(
  'session_item',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => item.id, { onDelete: 'restrict' }),
    plannedQty: integer('planned_qty'),
    plannedUnitId: text('planned_unit_id'),
    /** to_buy | bought | skipped */
    state: text('state').notNull().default('to_buy'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_sessionitem_sess').on(t.sessionId, t.sortOrder),
    uniquePair: uniqueIndex('idx_sessionitem_pair').on(t.sessionId, t.itemId),
  }),
);

export const priceEntry = sqliteTable(
  'price_entry',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => item.id, { onDelete: 'restrict' }),
    sessionId: text('session_id'),
    sessionItemId: text('session_item_id'),
    itemUnitId: text('item_unit_id'),
    unitPriceCentavos: integer('unit_price_centavos'),
    qtyInBase: integer('qty_in_base'),
    /** the only mandatory money field */
    totalCentavos: integer('total_centavos').notNull(),
    /** purchased | planned */
    kind: text('kind').notNull().default('purchased'),
    purchasedAt: text('purchased_at').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    itemDateIdx: index('idx_price_item_date').on(t.itemId, t.purchasedAt),
    sessionIdx: index('idx_price_session').on(t.sessionId),
  }),
);
