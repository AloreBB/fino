import Database from 'better-sqlite3';
import type { Db } from '../../src/db/db';
import { migrate } from '../../src/db/migrations';
import { createRepository, type IdGenerator, type Repository } from '../../src/db/repository';

/** In-memory DB for tests: better-sqlite3 wrapped in the async Db facade. */
export function openTestDb(): Db {
  const native = new Database(':memory:');
  return {
    run: async (sql, params = []) => {
      const info = native.prepare(sql).run(...params);
      return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    },
    get: async <T>(sql: string, params: unknown[] = []) => {
      const row = native.prepare(sql).get(...params) as T | undefined;
      return row ?? null;
    },
    all: async <T>(sql: string, params: unknown[] = []) =>
      native.prepare(sql).all(...params) as T[],
    exec: async (sql) => {
      native.exec(sql);
    },
    transaction: async <T>(fn: () => Promise<T>) => {
      // better-sqlite3 transactions cannot wrap async work, so bracket the
      // async function with manual BEGIN/COMMIT. Tests run sequentially on one
      // connection, so no other statement can slip inside the window.
      native.exec('BEGIN');
      try {
        const result = await fn();
        native.exec('COMMIT');
        return result;
      } catch (e) {
        try {
          native.exec('ROLLBACK');
        } catch {
          /* already rolled back */
        }
        throw e;
      }
    },
  };
}

let n = 0;
export const testIds: IdGenerator = () => `test-${(n += 1)}`;

/** Fresh migrated DB with an isolated id generator. */
export async function testRepo(): Promise<Repository> {
  const db = openTestDb();
  await migrate(db);
  let k = 0;
  return createRepository(db, () => `test-${(k += 1)}`);
}
