import type { Db } from './db';
import type { BackupV1, Month, Movement, Pocket, Quincena, Scenario } from '../domain/types';

export interface AppState {
  backupReady: boolean;
  changeSeq: number;
  uploadedSeq: number;
  lastUploadAt: string | null;
  lastError: 'auth' | 'network' | 'other' | null;
}

export type IdGenerator = () => string;

export type MovementInput = Omit<Movement, 'id' | 'position'>;
export type MovementPatch = Partial<Omit<Movement, 'id'>>;

const DEFAULT_STATE: AppState = {
  backupReady: false,
  changeSeq: 0,
  uploadedSeq: 0,
  lastUploadAt: null,
  lastError: null,
};

let counter = 0;
const defaultId: IdGenerator = () =>
  `id-${Date.now().toString(36)}-${(counter += 1).toString(36)}${Math.floor(Math.random() * 2 ** 32).toString(36)}`;

interface MovementRow extends Record<string, unknown> {
  id: string; quincenaId: string; kind: string;
  amountCents: number; amountExpr: string | null; description: string;
  pocket: string | null; parte: string | null;
  transactionDate: string | null; paid: number; position: number;
}

const toMovement = (r: MovementRow): Movement => ({
  id: r.id, quincenaId: r.quincenaId, kind: r.kind as Movement['kind'],
  amountCents: r.amountCents, amountExpr: r.amountExpr, description: r.description,
  pocket: r.pocket, parte: r.parte as Movement['parte'],
  transactionDate: r.transactionDate, paid: r.paid === 1, position: r.position,
});

const MOVEMENT_COLS = 'id, quincenaId, kind, amountCents, amountExpr, description, pocket, parte, transactionDate, paid, position';

export function createRepository(db: Db, generateId: IdGenerator = defaultId) {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) {
      try {
        l();
      } catch (e) {
        console.error('repository listener failed', e);
      }
    }
  };

  async function bumpSeq(): Promise<number> {
    const s = await getState();
    const next = s.changeSeq + 1;
    await db.run("INSERT INTO app_state(key, value) VALUES ('changeSeq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(next)]);
    return next;
  }

  /** Data writes bump changeSeq inside the same transaction; notify fires after commit. */
  async function mutate<T>(fn: () => Promise<T>): Promise<T> {
    const result = await db.transaction(async () => {
      const r = await fn();
      await bumpSeq();
      return r;
    });
    notify();
    return result;
  }

  async function listMonths(): Promise<Month[]> {
    const rows = await db.all<Omit<Month, 'isTemplate'> & { isTemplate: number }>(
      'SELECT id, name, year, monthNumber, isTemplate, position FROM months ORDER BY position, name',
    );
    return rows.map((m) => ({ ...m, isTemplate: m.isTemplate === 1 }));
  }

  async function getQuincena(id: string): Promise<Quincena | null> {
    return db.get<Quincena>('SELECT id, monthId, number, date, note FROM quincenas WHERE id = ?', [id]);
  }

  async function findQuincena(year: number, monthNumber: number, number: 1 | 2): Promise<Quincena | null> {
    return db.get<Quincena>(
      `SELECT q.id, q.monthId, q.number, q.date, q.note FROM quincenas q
       JOIN months m ON m.id = q.monthId
       WHERE m.year = ? AND m.monthNumber = ? AND q.number = ? AND m.isTemplate = 0`,
      [year, monthNumber, number],
    );
  }

  async function listQuincenas(monthId: string): Promise<Quincena[]> {
    return db.all<Quincena>('SELECT id, monthId, number, date, note FROM quincenas WHERE monthId = ? ORDER BY number', [monthId]);
  }

  async function saveMonth(m: Month): Promise<void> {
    await mutate(async () => {
      await db.run(
        'INSERT INTO months(id, name, year, monthNumber, isTemplate, position) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, year = excluded.year, monthNumber = excluded.monthNumber, isTemplate = excluded.isTemplate, position = excluded.position',
        [m.id, m.name, m.year, m.monthNumber, m.isTemplate ? 1 : 0, m.position],
      );
    });
  }

  async function saveQuincena(q: Quincena): Promise<void> {
    await mutate(async () => {
      await db.run(
        'INSERT INTO quincenas(id, monthId, number, date, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET monthId = excluded.monthId, number = excluded.number, date = excluded.date, note = excluded.note',
        [q.id, q.monthId, q.number, q.date, q.note],
      );
    });
  }

  async function listMovements(quincenaId: string): Promise<Movement[]> {
    const rows = await db.all<MovementRow>(`SELECT ${MOVEMENT_COLS} FROM movements WHERE quincenaId = ? ORDER BY position`, [quincenaId]);
    return rows.map(toMovement);
  }

  async function addMovement(input: MovementInput): Promise<Movement> {
    return mutate(async () => {
      const row = await db.get<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM movements WHERE quincenaId = ?', [input.quincenaId]);
      const m: Movement = { ...input, id: generateId(), position: row?.n ?? 0 };
      await db.run(
        'INSERT INTO movements(id, quincenaId, kind, amountCents, amountExpr, description, pocket, parte, transactionDate, paid, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [m.id, m.quincenaId, m.kind, m.amountCents, m.amountExpr, m.description, m.pocket, m.parte, m.transactionDate, m.paid ? 1 : 0, m.position],
      );
      return m;
    });
  }

  async function updateMovement(id: string, patch: MovementPatch): Promise<void> {
    await mutate(async () => {
      const keys: string[] = [];
      const vals: unknown[] = [];
      const p = patch as Record<string, unknown>;
      for (const k of ['quincenaId', 'kind', 'amountCents', 'amountExpr', 'description', 'pocket', 'parte', 'transactionDate', 'paid', 'position'] as const) {
        if (p[k] !== undefined) {
          keys.push(`${k} = ?`);
          vals.push(k === 'paid' ? (p[k] ? 1 : 0) : p[k]);
        }
      }
      if (keys.length === 0) return;
      await db.run(`UPDATE movements SET ${keys.join(', ')} WHERE id = ?`, [...vals, id]);
    });
  }

  async function deleteMovement(id: string): Promise<void> {
    await mutate(async () => {
      await db.run('DELETE FROM movements WHERE id = ?', [id]);
    });
  }

  async function setPaid(id: string, paid: boolean): Promise<void> {
    await mutate(async () => {
      await db.run('UPDATE movements SET paid = ? WHERE id = ?', [paid ? 1 : 0, id]);
    });
  }

  async function recentDescriptions(prefix: string): Promise<{ description: string; pocket: string | null }[]> {
    const rows = await db.all<{ description: string; pocket: string | null }>(
      'SELECT description, pocket FROM movements WHERE description LIKE ? ESCAPE ? ORDER BY rowid DESC LIMIT 60',
      [`${prefix.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, '\\'],
    );
    const seen = new Set<string>();
    const out: { description: string; pocket: string | null }[] = [];
    for (const r of rows) {
      const key = r.description.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 20) break;
    }
    return out;
  }

  async function listPockets(): Promise<Pocket[]> {
    const rows = await db.all<Omit<Pocket, 'active'> & { active: number }>(
      'SELECT name, active, position FROM pockets ORDER BY position',
    );
    return rows.map((p) => ({ ...p, active: p.active === 1 }));
  }

  async function addPocket(name: string): Promise<void> {
    await mutate(async () => {
      const row = await db.get<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM pockets');
      await db.run('INSERT OR IGNORE INTO pockets(name, active, position) VALUES (?, 1, ?)', [name, row?.n ?? 0]);
    });
  }

  async function renamePocket(oldName: string, nextName: string): Promise<void> {
    await mutate(async () => {
      const cur = await db.get<Pocket>('SELECT name, active, position FROM pockets WHERE name = ?', [oldName]);
      if (!cur) throw new Error(`unknown pocket ${oldName}`);
      await db.run('INSERT OR IGNORE INTO pockets(name, active, position) VALUES (?, 1, ?)', [nextName, cur.position]);
      await db.run('UPDATE movements SET pocket = ? WHERE pocket = ?', [nextName, oldName]);
      await db.run('DELETE FROM pockets WHERE name = ?', [oldName]);
    });
  }

  async function deactivatePocket(name: string): Promise<void> {
    await mutate(async () => {
      await db.run('UPDATE pockets SET active = 0 WHERE name = ?', [name]);
    });
  }

  async function listScenarios(): Promise<Scenario[]> {
    const rows = await db.all<{ id: string; name: string; position: number; data: string }>(
      'SELECT id, name, position, data FROM scenarios ORDER BY position',
    );
    return rows.map((r) => ({ id: r.id, name: r.name, position: r.position, data: JSON.parse(r.data) }));
  }

  async function saveScenario(s: Scenario): Promise<void> {
    await mutate(async () => {
      await db.run(
        'INSERT INTO scenarios(id, name, position, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position, data = excluded.data',
        [s.id, s.name, s.position, JSON.stringify(s.data)],
      );
    });
  }

  async function deleteScenario(id: string): Promise<void> {
    await mutate(async () => {
      await db.run('DELETE FROM scenarios WHERE id = ?', [id]);
    });
  }

  async function getState(): Promise<AppState> {
    const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM app_state');
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: 'changeSeq' | 'uploadedSeq') => {
      const v = Number(map.get(k));
      return Number.isInteger(v) && v >= 0 ? v : DEFAULT_STATE[k];
    };
    const lastError = map.get('lastError');
    return {
      backupReady: map.get('backupReady') === '1',
      changeSeq: num('changeSeq'),
      uploadedSeq: num('uploadedSeq'),
      lastUploadAt: map.get('lastUploadAt') ?? null,
      lastError: lastError === 'auth' || lastError === 'network' || lastError === 'other' ? lastError : null,
    };
  }

  async function setState(patch: Partial<AppState>): Promise<void> {
    const entries: [string, string][] = [];
    if (patch.backupReady !== undefined) entries.push(['backupReady', patch.backupReady ? '1' : '0']);
    if (patch.changeSeq !== undefined) entries.push(['changeSeq', String(patch.changeSeq)]);
    if (patch.uploadedSeq !== undefined) entries.push(['uploadedSeq', String(patch.uploadedSeq)]);
    if (patch.lastUploadAt !== undefined) entries.push(['lastUploadAt', patch.lastUploadAt ?? '']);
    if (patch.lastError !== undefined) entries.push(['lastError', patch.lastError ?? '']);
    await db.transaction(async () => {
      for (const [k, v] of entries) {
        await db.run('INSERT INTO app_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
      }
    });
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * The user's own ElevenLabs agent ID. It lives in app_state, which backups
   * never include, so it stays on the phone and out of Drive files.
   */
  async function getVoiceAgentId(): Promise<string | null> {
    const row = await db.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'voiceAgentId'");
    const v = row?.value.trim();
    return v ? v : null;
  }

  async function setVoiceAgentId(id: string | null): Promise<void> {
    const v = id?.trim() ?? '';
    if (!v) {
      await db.run("DELETE FROM app_state WHERE key = 'voiceAgentId'");
    } else {
      await db.run(
        "INSERT INTO app_state(key, value) VALUES ('voiceAgentId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [v],
      );
    }
    notify();
  }

  async function exportBackup(): Promise<BackupV1> {
    const [months, quincenas, pockets, scenarios] = await Promise.all([
      listMonths(),
      db.all<Quincena>('SELECT id, monthId, number, date, note FROM quincenas ORDER BY monthId, number'),
      listPockets(),
      listScenarios(),
    ]);
    const mrows = await db.all<MovementRow>(`SELECT ${MOVEMENT_COLS} FROM movements ORDER BY quincenaId, position`);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      months,
      quincenas,
      movements: mrows.map(toMovement),
      pockets,
      scenarios,
    };
  }

  /**
   * Replaces all user data with the backup, atomically: any failure rolls
   * back and the current data (and changeSeq) is untouched.
   */
  async function restoreBackup(b: BackupV1): Promise<void> {
    await db.transaction(async () => {
      await db.exec('DELETE FROM movements; DELETE FROM quincenas; DELETE FROM months; DELETE FROM pockets; DELETE FROM scenarios;');
      for (const m of b.months) {
        await db.run('INSERT INTO months(id, name, year, monthNumber, isTemplate, position) VALUES (?, ?, ?, ?, ?, ?)',
          [m.id, m.name, m.year, m.monthNumber, m.isTemplate ? 1 : 0, m.position]);
      }
      for (const q of b.quincenas) {
        await db.run('INSERT INTO quincenas(id, monthId, number, date, note) VALUES (?, ?, ?, ?, ?)',
          [q.id, q.monthId, q.number, q.date, q.note]);
      }
      for (const mv of b.movements) {
        await db.run(
          'INSERT INTO movements(id, quincenaId, kind, amountCents, amountExpr, description, pocket, parte, transactionDate, paid, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [mv.id, mv.quincenaId, mv.kind, mv.amountCents, mv.amountExpr, mv.description, mv.pocket, mv.parte, mv.transactionDate, mv.paid ? 1 : 0, mv.position],
        );
      }
      for (const p of b.pockets) {
        await db.run('INSERT INTO pockets(name, active, position) VALUES (?, ?, ?)', [p.name, p.active ? 1 : 0, p.position]);
      }
      for (const s of b.scenarios) {
        await db.run('INSERT INTO scenarios(id, name, position, data) VALUES (?, ?, ?, ?)',
          [s.id, s.name, s.position, JSON.stringify(s.data)]);
      }
      await bumpSeq();
    });
    notify();
  }

  async function hasUserData(): Promise<boolean> {
    const [m, q, mo] = await Promise.all([
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM movements'),
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quincenas'),
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM months WHERE isTemplate = 0'),
    ]);
    return (m?.n ?? 0) > 0 || (q?.n ?? 0) > 0 || (mo?.n ?? 0) > 0;
  }

  function newId(): string {
    return generateId();
  }

  async function findMovement(id: string): Promise<Movement | null> {
    const row = await db.get<MovementRow>(`SELECT ${MOVEMENT_COLS} FROM movements WHERE id = ?`, [id]);
    return row ? toMovement(row) : null;
  }

  return {
    newId, findMovement,
    getVoiceAgentId, setVoiceAgentId,
    listMonths, saveMonth, getQuincena, findQuincena, listQuincenas, saveQuincena, listMovements,
    addMovement, updateMovement, deleteMovement, setPaid,
    recentDescriptions, listPockets, addPocket, renamePocket, deactivatePocket,
    listScenarios, saveScenario, deleteScenario,
    getState, setState, subscribe,
    exportBackup, restoreBackup, hasUserData,
  };
}

export type Repository = ReturnType<typeof createRepository>;

// App singleton, wired once at startup (see app/_layout.tsx). Screens use repo()
// so they never touch SQL; tests use createRepository directly with an injected id generator.
let current: Repository | null = null;

export function initRepository(db: Db, generateId?: IdGenerator): Repository {
  current = createRepository(db, generateId);
  return current;
}

export function repo(): Repository {
  if (!current) throw new Error('repository is not initialized');
  return current;
}
