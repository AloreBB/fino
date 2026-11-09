import type { BackupV1, Movement, Parte, Quincena } from './types';

/** A restore file that must never touch the current data. */
export class BackupInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupInvalidError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isParte = (v: unknown): v is Parte | null =>
  v === null || v === undefined || v === '1ra' || v === '2da' || v === 'Completo';

function checkMovement(m: unknown): asserts m is Movement {
  if (!isRecord(m)) throw new BackupInvalidError('movement is not an object');
  if (typeof m['id'] !== 'string' || typeof m['quincenaId'] !== 'string') {
    throw new BackupInvalidError('movement needs a string id and quincenaId');
  }
  if (m['kind'] !== 'ingreso' && m['kind'] !== 'egreso') {
    throw new BackupInvalidError(`movement ${m['id']} has an unknown kind`);
  }
  if (!Number.isInteger(m['amountCents'])) {
    throw new BackupInvalidError(`movement ${m['id']} needs an integer amountCents`);
  }
  if (typeof m['description'] !== 'string') {
    throw new BackupInvalidError(`movement ${m['id']} needs a string description`);
  }
  if (m['pocket'] !== null && m['pocket'] !== undefined && typeof m['pocket'] !== 'string') {
    throw new BackupInvalidError(`movement ${m['id']} has an invalid pocket`);
  }
  if (!isParte(m['parte'])) {
    throw new BackupInvalidError(`movement ${m['id']} has an invalid parte`);
  }
  if (m['transactionDate'] !== null && m['transactionDate'] !== undefined && typeof m['transactionDate'] !== 'string') {
    throw new BackupInvalidError(`movement ${m['id']} has an invalid transactionDate`);
  }
  if (typeof m['paid'] !== 'boolean') {
    throw new BackupInvalidError(`movement ${m['id']} needs a boolean paid flag`);
  }
  if (!Number.isInteger(m['position'])) {
    throw new BackupInvalidError(`movement ${m['id']} needs an integer position`);
  }
}

/**
 * Parses and validates a backup file. Throws BackupInvalidError on bad JSON,
 * a wrong version, or rows pointing at unknown parents. Never touches the DB.
 */
export function parseBackup(json: string): BackupV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupInvalidError('not valid JSON');
  }
  if (!isRecord(raw)) throw new BackupInvalidError('backup is not an object');
  if (raw['version'] !== 1) throw new BackupInvalidError('unsupported backup version');
  for (const key of ['months', 'quincenas', 'movements', 'pockets', 'scenarios'] as const) {
    if (!Array.isArray(raw[key])) throw new BackupInvalidError(`backup is missing ${key}`);
  }
  const months = raw['months'] as Record<string, unknown>[];
  const quincenas = raw['quincenas'] as Record<string, unknown>[];
  const monthIds = new Set(months.map((m) => m['id']));
  for (const q of quincenas) {
    if (typeof q['id'] !== 'string' || typeof q['monthId'] !== 'string') {
      throw new BackupInvalidError('quincena needs a string id and monthId');
    }
    if (q['number'] !== 1 && q['number'] !== 2) {
      throw new BackupInvalidError(`quincena ${q['id']} has an invalid number`);
    }
    if (!monthIds.has(q['monthId'])) {
      throw new BackupInvalidError(`quincena ${q['id']} points at unknown month ${q['monthId']}`);
    }
  }
  const quincenaIds = new Set(quincenas.map((q) => q['id']));
  const movements = raw['movements'] as unknown[];
  for (const m of movements) {
    checkMovement(m);
    if (!quincenaIds.has((m as Movement).quincenaId)) {
      throw new BackupInvalidError(
        `movement ${(m as Movement).id} points at unknown quincena ${(m as Movement).quincenaId}`,
      );
    }
  }
  return {
    version: 1,
    exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
    months: months as unknown as BackupV1['months'],
    quincenas: quincenas as unknown as Quincena[],
    movements: movements as Movement[],
    pockets: raw['pockets'] as BackupV1['pockets'],
    scenarios: raw['scenarios'] as BackupV1['scenarios'],
  };
}
