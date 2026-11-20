import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "./seed";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  instagram TEXT,
  website TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_area TEXT NOT NULL,
  shop_address TEXT NOT NULL,
  teaser TEXT NOT NULL,
  story TEXT NOT NULL,
  target_object TEXT NOT NULL,
  target_object_hint TEXT NOT NULL,
  reward_amount INTEGER NOT NULL DEFAULT 100,
  coupon_item TEXT NOT NULL,
  coupon_min_spend INTEGER NOT NULL DEFAULT 0,
  coupon_valid_days INTEGER NOT NULL DEFAULT 14,
  coupon_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
  operator_note TEXT,
  last_rejection_note TEXT,
  last_rejection_at TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_merchant_idx ON campaigns (merchant_id);

CREATE TABLE IF NOT EXISTS clues (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('online', 'instore')),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT
);

CREATE INDEX IF NOT EXISTS clues_campaign_idx ON clues (campaign_id, kind, position);
`;

type GlobalWithDb = typeof globalThis & { __argMerchantDb?: DatabaseSync };

const globalForDb = globalThis as GlobalWithDb;

/**
 * Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
 * EXISTS", so check PRAGMA first — an existing demo database keeps its rows.
 */
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: "campaigns",
    column: "last_rejection_note",
    ddl: "ALTER TABLE campaigns ADD COLUMN last_rejection_note TEXT",
  },
  {
    table: "campaigns",
    column: "last_rejection_at",
    ddl: "ALTER TABLE campaigns ADD COLUMN last_rejection_at TEXT",
  },
];

function migrate(db: DatabaseSync) {
  db.exec(SCHEMA_SQL);
  for (const migration of COLUMN_MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as unknown as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === migration.column)) {
      db.exec(migration.ddl);
    }
  }
}

export function getDb(): DatabaseSync {
  if (globalForDb.__argMerchantDb) return globalForDb.__argMerchantDb;

  const file = process.env.ARG_DB_PATH ?? path.join(process.cwd(), ".data", "arg.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seedDatabase(db);

  globalForDb.__argMerchantDb = db;
  return db;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
