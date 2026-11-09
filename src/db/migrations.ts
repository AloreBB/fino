import type { Db } from './db';

// Bump when the schema changes; migrate() applies every step above the stored version.
export const CURRENT_VERSION = 1;

const V1 = `
CREATE TABLE months (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NULL,
  monthNumber INTEGER NULL,
  isTemplate INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE quincenas (
  id TEXT PRIMARY KEY,
  monthId TEXT NOT NULL REFERENCES months(id),
  number INTEGER NOT NULL,
  date TEXT NULL,
  note TEXT NULL
);
CREATE INDEX idx_quincenas_month ON quincenas(monthId, number);
CREATE TABLE movements (
  id TEXT PRIMARY KEY,
  quincenaId TEXT NOT NULL REFERENCES quincenas(id),
  kind TEXT NOT NULL,
  amountCents INTEGER NOT NULL,
  amountExpr TEXT NULL,
  description TEXT NOT NULL DEFAULT '',
  pocket TEXT NULL,
  parte TEXT NULL,
  transactionDate TEXT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_movements_quincena ON movements(quincenaId, position);
CREATE TABLE pockets (
  name TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Applies pending migrations based on PRAGMA user_version. Idempotent. */
export async function migrate(db: Db): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  if (from < 1) {
    await db.exec(V1);
  }
  if (from < CURRENT_VERSION) {
    await db.exec(`PRAGMA user_version = ${CURRENT_VERSION}`);
  }
}
