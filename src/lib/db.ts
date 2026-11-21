import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase, upgradeSeedStory } from "./seed";

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
  updated_at TEXT NOT NULL,
  answer_question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  hint_1 TEXT NOT NULL DEFAULT '',
  hint_2 TEXT NOT NULL DEFAULT '',
  ext_social_clue TEXT NOT NULL DEFAULT '',
  ext_web_clue TEXT NOT NULL DEFAULT '',
  ext_instore_clue TEXT NOT NULL DEFAULT '',
  ext_answer TEXT NOT NULL DEFAULT '',
  ext_hint TEXT NOT NULL DEFAULT '',
  ext_question TEXT NOT NULL DEFAULT ''
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

-- P0.2: one anonymous player (cookie) may run one session per campaign.
CREATE TABLE IF NOT EXISTS quest_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  online_read INTEGER NOT NULL DEFAULT 0,
  instore_read INTEGER NOT NULL DEFAULT 0,
  hint1_at TEXT,
  hint2_at TEXT,
  answer_attempts INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  completed_at TEXT,
  extended_step INTEGER NOT NULL DEFAULT 0,
  extended_attempts INTEGER NOT NULL DEFAULT 0,
  extended_solved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (player_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS quest_sessions_campaign_idx ON quest_sessions (campaign_id);

-- P0.2: real submitted evidence. Every row starts pending and needs a person
-- to review it; nothing here is auto-verified.
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES quest_sessions(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('camera', 'upload', 'simulation')),
  photo_path TEXT,
  photo_mime TEXT,
  location_lat REAL,
  location_lng REAL,
  location_accuracy REAL,
  location_at TEXT,
  captured_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS evidence_status_idx ON evidence (status, created_at);
CREATE INDEX IF NOT EXISTS evidence_session_idx ON evidence (session_id);

-- P0.2: the completion record P0.3 (payout) and P0.4 (coupon) consume.
CREATE TABLE IF NOT EXISTS quest_completions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES quest_sessions(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  coupon_eligible INTEGER NOT NULL DEFAULT 0,
  extended_solved INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  payout_wallet TEXT,
  payout_mint TEXT,
  payout_amount_base_units INTEGER,
  payout_signature TEXT,
  payout_error TEXT,
  payout_recipient_before INTEGER,
  payout_recipient_after INTEGER,
  payout_recipient_token_account TEXT,
  payout_claimed_at TEXT,
  payout_confirmed_at TEXT,
  chain_status TEXT,
  chain_counter_account TEXT,
  chain_program_id TEXT,
  chain_create_signature TEXT,
  chain_delegate_signature TEXT,
  chain_increment_signature TEXT,
  chain_commit_signature TEXT,
  chain_counter_value INTEGER,
  chain_committed_value INTEGER,
  chain_er_endpoint TEXT,
  chain_updated_at TEXT,
  chain_error TEXT,
  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS quest_completions_campaign_idx ON quest_completions (campaign_id);

-- P0.4: one demo coupon per verified completion that also solved the optional
-- extended mystery. The terms are copied from the campaign at issue time so a
-- later campaign edit cannot rewrite an already-issued entitlement.
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  completion_id TEXT NOT NULL UNIQUE REFERENCES quest_completions(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_area TEXT NOT NULL,
  shop_address TEXT NOT NULL,
  coupon_item TEXT NOT NULL,
  coupon_min_spend INTEGER NOT NULL DEFAULT 0,
  coupon_valid_days INTEGER NOT NULL DEFAULT 14,
  coupon_notes TEXT NOT NULL DEFAULT '',
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'redeemed')) DEFAULT 'issued',
  redeemed_at TEXT,
  redeemed_by TEXT,
  redemption_note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS coupons_campaign_idx ON coupons (campaign_id);
CREATE INDEX IF NOT EXISTS coupons_player_idx ON coupons (player_id, issued_at);
CREATE INDEX IF NOT EXISTS coupons_status_idx ON coupons (status, expires_at);

-- P1: the optional product-clue mystery. One claim per verified completion that
-- solved the pre-order deduction. Staff confirm the fictional product handoff,
-- which unlocks the final clue. No payment is processed or recorded here.
CREATE TABLE IF NOT EXISTS product_claims (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  completion_id TEXT NOT NULL UNIQUE REFERENCES quest_completions(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('requested', 'handed_off')) DEFAULT 'requested',
  requested_at TEXT NOT NULL,
  handed_off_at TEXT,
  handed_off_by TEXT,
  handoff_note TEXT,
  chain_status TEXT,
  chain_counter_account TEXT,
  chain_program_id TEXT,
  chain_create_signature TEXT,
  chain_delegate_signature TEXT,
  chain_increment_signature TEXT,
  chain_commit_signature TEXT,
  chain_counter_value INTEGER,
  chain_committed_value INTEGER,
  chain_er_endpoint TEXT,
  chain_updated_at TEXT,
  chain_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_claims_campaign_idx ON product_claims (campaign_id);
CREATE INDEX IF NOT EXISTS product_claims_status_idx ON product_claims (status, requested_at);

-- P1: the investigation companion keeps a short, per-session transcript so it
-- can remember revealed clues without putting conversations on-chain.
CREATE TABLE IF NOT EXISTS companion_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES quest_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'scripted',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS companion_messages_session_idx ON companion_messages (session_id, created_at);
`;

type GlobalWithDb = typeof globalThis & { __argMerchantDb?: DatabaseSync };

const globalForDb = globalThis as GlobalWithDb;

export function dataDir(): string {
  return process.env.ARG_DATA_DIR ?? path.join(process.cwd(), ".data");
}

export function evidenceDir(): string {
  const dir = path.join(dataDir(), "evidence");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
  // P0.2 — player-visible clues stay in `clues`; these columns hold the answer
  // the player must discover and the private verification details.
  {
    table: "campaigns",
    column: "answer_question",
    ddl: "ALTER TABLE campaigns ADD COLUMN answer_question TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "answer",
    ddl: "ALTER TABLE campaigns ADD COLUMN answer TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "hint_1",
    ddl: "ALTER TABLE campaigns ADD COLUMN hint_1 TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "hint_2",
    ddl: "ALTER TABLE campaigns ADD COLUMN hint_2 TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ext_social_clue",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_social_clue TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ext_web_clue",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_web_clue TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ext_instore_clue",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_instore_clue TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ext_answer",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_answer TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ext_hint",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_hint TEXT NOT NULL DEFAULT ''",
  },
  // P0.3 — the shared completion-counter account for this campaign, plus the
  // extended-mystery question (previously hard-coded in the player view).
  {
    table: "campaigns",
    column: "ext_question",
    ddl: "ALTER TABLE campaigns ADD COLUMN ext_question TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "chain_counter_account",
    ddl: "ALTER TABLE campaigns ADD COLUMN chain_counter_account TEXT",
  },
  // P1 — optional product-clue mystery. Campaigns default to the legacy coupon
  // mode so P0.4 records keep their original meaning.
  {
    table: "campaigns",
    column: "optional_mode",
    ddl: "ALTER TABLE campaigns ADD COLUMN optional_mode TEXT NOT NULL DEFAULT 'coupon'",
  },
  {
    table: "campaigns",
    column: "product_name",
    ddl: "ALTER TABLE campaigns ADD COLUMN product_name TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "product_price_label",
    ddl: "ALTER TABLE campaigns ADD COLUMN product_price_label TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "product_prop",
    ddl: "ALTER TABLE campaigns ADD COLUMN product_prop TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "product_clue",
    ddl: "ALTER TABLE campaigns ADD COLUMN product_clue TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "final_question",
    ddl: "ALTER TABLE campaigns ADD COLUMN final_question TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "final_answer",
    ddl: "ALTER TABLE campaigns ADD COLUMN final_answer TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "final_hint",
    ddl: "ALTER TABLE campaigns ADD COLUMN final_hint TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ending_title",
    ddl: "ALTER TABLE campaigns ADD COLUMN ending_title TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "ending_body",
    ddl: "ALTER TABLE campaigns ADD COLUMN ending_body TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "achievement_title",
    ddl: "ALTER TABLE campaigns ADD COLUMN achievement_title TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "campaigns",
    column: "achievement_body",
    ddl: "ALTER TABLE campaigns ADD COLUMN achievement_body TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "quest_completions",
    column: "final_answer_attempts",
    ddl: "ALTER TABLE quest_completions ADD COLUMN final_answer_attempts INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "quest_completions",
    column: "final_solved_at",
    ddl: "ALTER TABLE quest_completions ADD COLUMN final_solved_at TEXT",
  },
  // P0.3 — real Devnet payout and MagicBlock execution evidence.
  ...[
    ["payout_wallet", "TEXT"],
    ["payout_mint", "TEXT"],
    ["payout_amount_base_units", "INTEGER"],
    ["payout_signature", "TEXT"],
    ["payout_error", "TEXT"],
    ["payout_recipient_before", "INTEGER"],
    ["payout_recipient_after", "INTEGER"],
    ["payout_recipient_token_account", "TEXT"],
    ["payout_claimed_at", "TEXT"],
    ["payout_confirmed_at", "TEXT"],
    ["chain_status", "TEXT"],
    ["chain_counter_account", "TEXT"],
    ["chain_program_id", "TEXT"],
    ["chain_create_signature", "TEXT"],
    ["chain_delegate_signature", "TEXT"],
    ["chain_increment_signature", "TEXT"],
    ["chain_commit_signature", "TEXT"],
    ["chain_counter_value", "INTEGER"],
    ["chain_committed_value", "INTEGER"],
    ["chain_er_endpoint", "TEXT"],
    ["chain_updated_at", "TEXT"],
    ["chain_error", "TEXT"],
  ].map(([column, type]) => ({
    table: "quest_completions",
    column,
    ddl: `ALTER TABLE quest_completions ADD COLUMN ${column} ${type}`,
  })),
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

  const file = process.env.ARG_DB_PATH ?? path.join(dataDir(), "arg.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seedDatabase(db);
  upgradeSeedStory(db);

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
