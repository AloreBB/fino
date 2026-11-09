// Async database facade. The app opens expo-sqlite through openAppDb;
// tests inject a better-sqlite3 wrapper from tests/helpers/testDb.ts.

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Db {
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Opens the on-phone database. Never imported from tests (expo-sqlite has no Node build). */
export async function openAppDb(name = 'fino.db'): Promise<Db> {
  const SQLite = await import('expo-sqlite');
  const native = SQLite.openDatabaseSync(name);
  return {
    run: async (sql, params = []) => {
      const r = await native.runAsync(sql, params as never[]);
      return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowId) };
    },
    get: (sql, params = []) => native.getFirstAsync(sql, params as never[]),
    all: (sql, params = []) => native.getAllAsync(sql, params as never[]),
    exec: (sql) => native.execAsync(sql),
    transaction: async (fn) => {
      let result: unknown;
      await native.withTransactionAsync(async () => {
        result = await fn();
      });
      return result as Awaited<ReturnType<typeof fn>>;
    },
  };
}
