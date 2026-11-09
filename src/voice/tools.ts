import type { Movement, Quincena } from '../domain/types';
import type { Repository } from '../db/repository';
import { computeQuincenaTotals } from '../domain/totals';
import { currentQuincenaNumber } from '../domain/quincena';
import { formatCop } from '../domain/money';
import { showToast } from '../ui/Toast';
import { matchesQuery, normalize } from './normalize';

export interface VoiceDeps {
  repo: Repository;
}

type ScopeOk = { ok: true; label: string; quincenas: Quincena[] };
type ScopeFail = { ok: false; reason: 'mes_no_existe'; mes: string };
type Scope = ScopeOk | ScopeFail;

const pad = (n: number) => String(n).padStart(2, '0');

async function resolveScope(
  repo: Repository, now: Date, mes?: string, quincena?: number,
): Promise<Scope> {
  let year = now.getFullYear();
  let monthNumber = now.getMonth() + 1;
  if (mes !== undefined) {
    const full = /^(\d{4})-(\d{2})$/.exec(mes.trim());
    const short = /^(\d{1,2})$/.exec(mes.trim());
    if (full) {
      year = Number(full[1]);
      monthNumber = Number(full[2]);
    } else if (short) {
      monthNumber = Number(short[1]);
    } else {
      return { ok: false, reason: 'mes_no_existe', mes };
    }
    if (monthNumber < 1 || monthNumber > 12) return { ok: false, reason: 'mes_no_existe', mes };
  }
  const label = `${year}-${pad(monthNumber)}`;
  const months = await repo.listMonths();
  const month = months.find((m) => !m.isTemplate && m.year === year && m.monthNumber === monthNumber);
  if (!month) return { ok: false, reason: 'mes_no_existe', mes: label };
  const all = await repo.listQuincenas(month.id);
  const picked = quincena === undefined ? all : all.filter((q) => q.number === quincena);
  if (picked.length === 0) return { ok: false, reason: 'mes_no_existe', mes: label };
  return { ok: true, label, quincenas: picked };
}

const rowJson = (m: Movement) => ({
  id: m.id, description: m.description, amount: formatCop(m.amountCents),
});

interface Handlers {
  buscar_movimientos: (p: { texto?: string; mes?: string; quincena?: number }) => Promise<string>;
  agregar_movimiento: (p: {
    tipo: string; monto: number; descripcion: string; bolsillo?: string;
    parte?: string; pagado?: boolean; mes?: string; quincena?: number;
  }) => Promise<string>;
  editar_movimiento: (p: {
    id: string; monto?: number; descripcion?: string; bolsillo?: string;
    parte?: string; pagado?: boolean;
  }) => Promise<string>;
  marcar_pagado: (p: { id: string; pagado: boolean }) => Promise<string>;
  eliminar_movimiento: (p: { id: string; confirmado: boolean }) => Promise<string>;
  consultar_totales: (p: { mes?: string; quincena?: number }) => Promise<string>;
}

/**
 * The 6 client tools the ElevenLabs agent calls. Every handler returns a
 * JSON string, writes through the same repository as the buttons, and shows
 * a toast with an undo for each successful write.
 */
export function createVoiceTools(deps: VoiceDeps, now: () => Date): Handlers {
  const { repo } = deps;

  async function scopeOf(mes?: string, quincena?: number): Promise<Scope> {
    return resolveScope(repo, now(), mes, quincena);
  }

  return {
    async buscar_movimientos(p) {
      const scope = await scopeOf(p.mes, p.quincena);
      if (!scope.ok) return JSON.stringify(scope);
      const rows: Movement[] = [];
      for (const q of scope.quincenas) rows.push(...(await repo.listMovements(q.id)));
      const query = p.texto?.trim() ?? '';
      const matches = query === '' ? [] : rows.filter((m) => matchesQuery(m.description, query));
      return JSON.stringify({
        ok: true, mes: scope.label,
        matches: matches.map((m) => ({ ...rowJson(m), pocket: m.pocket, paid: m.paid })),
        quincena: rows.map(rowJson),
      });
    },

    async agregar_movimiento(p) {
      if (typeof p.monto !== 'number' || !Number.isFinite(p.monto) || p.monto <= 0) {
        return JSON.stringify({ ok: false, reason: 'monto_invalido' });
      }
      const scope = await scopeOf(p.mes, p.quincena);
      if (!scope.ok) return JSON.stringify(scope);
      const quincenaId = scope.quincenas[0].id;
      const kind = p.tipo === 'ingreso' ? 'ingreso' : 'egreso';
      let pocket: string | null = null;
      if (kind === 'egreso' && p.bolsillo?.trim()) {
        const names = (await repo.listPockets()).map((x) => x.name);
        const found = names.find((n) => normalize(n) === normalize(p.bolsillo!.trim()));
        if (!found) {
          return JSON.stringify({ ok: false, reason: 'bolsillo_desconocido', disponibles: names });
        }
        pocket = found;
      }
      const validPartes = ['1ra', '2da', 'Completo'];
      const created = await repo.addMovement({
        quincenaId, kind,
        amountCents: Math.round(p.monto * 100),
        amountExpr: null,
        description: p.descripcion?.trim() ?? '',
        pocket,
        parte: kind === 'egreso' && p.parte && validPartes.includes(p.parte) ? (p.parte as Movement['parte']) : kind === 'egreso' ? 'Completo' : null,
        transactionDate: kind === 'egreso' ? now().toISOString().slice(0, 10) : null,
        paid: kind === 'egreso' ? (p.pagado ?? true) : false,
      });
      const resumen = `${kind === 'ingreso' ? 'Ingreso agregado' : 'Egreso agregado'}: ${created.description || '(sin descripción)'} ${formatCop(created.amountCents)}${pocket ? ` en ${pocket}` : ''}${created.paid ? ' (pagado)' : ''}`;
      showToast(resumen, async () => {
        try {
          await repo.deleteMovement(created.id);
        } catch (e) {
          console.error('voice undo failed', e);
        }
      });
      return JSON.stringify({ ok: true, id: created.id, resumen });
    },

    async editar_movimiento(p) {
      const current = await repo.findMovement(p.id);
      if (!current) return JSON.stringify({ ok: false, reason: 'movimiento_no_encontrado' });
      const patch: Partial<Movement> = {};
      if (p.monto !== undefined) {
        if (typeof p.monto !== 'number' || !Number.isFinite(p.monto) || p.monto <= 0) {
          return JSON.stringify({ ok: false, reason: 'monto_invalido' });
        }
        patch.amountCents = Math.round(p.monto * 100);
        patch.amountExpr = null;
      }
      if (p.descripcion !== undefined) patch.description = p.descripcion.trim();
      if (p.bolsillo !== undefined) {
        const names = (await repo.listPockets()).map((x) => x.name);
        if (p.bolsillo.trim() === '') {
          patch.pocket = null;
        } else {
          const found = names.find((n) => normalize(n) === normalize(p.bolsillo!.trim()));
          if (!found) {
            return JSON.stringify({ ok: false, reason: 'bolsillo_desconocido', disponibles: names });
          }
          patch.pocket = found;
        }
      }
      if (p.parte !== undefined) {
        patch.parte = ['1ra', '2da', 'Completo'].includes(p.parte) ? (p.parte as Movement['parte']) : 'Completo';
      }
      if (p.pagado !== undefined && current.kind === 'egreso') patch.paid = p.pagado;
      const before = { ...current };
      await repo.updateMovement(current.id, patch);
      const updated = (await repo.findMovement(current.id))!;
      const resumen = `Movimiento actualizado: ${updated.description || '(sin descripción)'} ${formatCop(updated.amountCents)}`;
      showToast(resumen, async () => {
        try {
          await repo.updateMovement(before.id, {
            amountCents: before.amountCents, amountExpr: before.amountExpr,
            description: before.description, pocket: before.pocket, parte: before.parte,
            transactionDate: before.transactionDate, paid: before.paid,
          });
        } catch (e) {
          console.error('voice undo failed', e);
        }
      });
      return JSON.stringify({ ok: true, id: updated.id, resumen });
    },

    async marcar_pagado(p) {
      const current = await repo.findMovement(p.id);
      if (!current) return JSON.stringify({ ok: false, reason: 'movimiento_no_encontrado' });
      await repo.setPaid(current.id, p.pagado);
      showToast(p.pagado ? `Marcado como pagado: ${current.description}` : `Marcado sin pagar: ${current.description}`, async () => {
        try {
          await repo.setPaid(current.id, current.paid);
        } catch (e) {
          console.error('voice undo failed', e);
        }
      });
      return JSON.stringify({ ok: true, id: current.id, pagado: p.pagado });
    },

    async eliminar_movimiento(p) {
      if (!p.confirmado) {
        return JSON.stringify({ ok: false, reason: 'requiere_confirmacion' });
      }
      const current = await repo.findMovement(p.id);
      if (!current) return JSON.stringify({ ok: false, reason: 'movimiento_no_encontrado' });
      await repo.deleteMovement(current.id);
      showToast(`Movimiento eliminado: ${current.description}`, async () => {
        try {
          await repo.addMovement({
            quincenaId: current.quincenaId, kind: current.kind, amountCents: current.amountCents,
            amountExpr: current.amountExpr, description: current.description, pocket: current.pocket,
            parte: current.parte, transactionDate: current.transactionDate, paid: current.paid,
          });
        } catch (e) {
          console.error('voice undo failed', e);
        }
      });
      return JSON.stringify({ ok: true, id: current.id });
    },

    async consultar_totales(p) {
      const scope = await scopeOf(p.mes, p.quincena);
      if (!scope.ok) return JSON.stringify(scope);
      const rows: Movement[] = [];
      for (const q of scope.quincenas) rows.push(...(await repo.listMovements(q.id)));
      const t = computeQuincenaTotals(rows);
      return JSON.stringify({
        ok: true, mes: scope.label,
        totales: {
          ingresos: formatCop(t.ingresos), egresos: formatCop(t.egresos),
          pagado: formatCop(t.pagado), saldoActual: formatCop(t.saldoActual),
          meQuedo: formatCop(t.meQuedo),
        },
      });
    },
  };
}
