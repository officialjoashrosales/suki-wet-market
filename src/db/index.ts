import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const sqlite = openDatabaseSync('suki.db', { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });

/**
 * Versioned migrations. Append to this array; never edit an entry that has
 * shipped. PRAGMA user_version tracks progress.
 */
const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS item (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Other',
        dimension TEXT NOT NULL DEFAULT 'unspecified',
        base_unit TEXT,
        display_unit TEXT,
        notes TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_item_name ON item(name COLLATE NOCASE)`,
      `CREATE TABLE IF NOT EXISTS item_unit (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL REFERENCES item(id) ON DELETE RESTRICT,
        label TEXT NOT NULL,
        qty_in_base INTEGER,
        verified INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_unit_item ON item_unit(item_id)`,
      `CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        occurred_on TEXT NOT NULL,
        budget_centavos INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        duplicated_from TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_session_date ON session(occurred_on)`,
      `CREATE TABLE IF NOT EXISTS session_item (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL REFERENCES item(id) ON DELETE RESTRICT,
        planned_qty INTEGER,
        planned_unit_id TEXT,
        state TEXT NOT NULL DEFAULT 'to_buy',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessionitem_pair ON session_item(session_id, item_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessionitem_sess ON session_item(session_id, sort_order)`,
      `CREATE TABLE IF NOT EXISTS price_entry (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL REFERENCES item(id) ON DELETE RESTRICT,
        session_id TEXT,
        session_item_id TEXT,
        item_unit_id TEXT,
        unit_price_centavos INTEGER,
        qty_in_base INTEGER,
        total_centavos INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'purchased',
        purchased_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_price_item_date ON price_entry(item_id, purchased_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_price_session ON price_entry(session_id)`,
    ],
  },
];

let migrated = false;

export async function migrate(): Promise<void> {
  if (migrated) return;
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  await sqlite.execAsync('PRAGMA foreign_keys = ON;');
  const row = await sqlite.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await sqlite.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await sqlite.execAsync(statement);
      }
      await sqlite.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  migrated = true;
}

/** Test/debug helper: removes every row but keeps the schema. */
export async function resetData(): Promise<void> {
  await sqlite.execAsync(
    'DELETE FROM price_entry; DELETE FROM session_item; DELETE FROM session; DELETE FROM item_unit; DELETE FROM item;',
  );
}
