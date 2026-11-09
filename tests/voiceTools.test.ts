import { showToast } from '../src/ui/Toast';
import { createVoiceTools } from '../src/voice/tools';
import { testRepo } from './helpers/testDb';

jest.mock('../src/ui/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
}));

const toast = showToast as jest.Mock;
const may10 = () => new Date(2026, 4, 10);

async function seed() {
  const repo = await testRepo();
  await repo.saveMonth({ id: 'm', name: 'Mayo', year: 2026, monthNumber: 5, isTemplate: false, position: 0 });
  await repo.saveQuincena({ id: 'q1', monthId: 'm', number: 1, date: '2026-05-15', note: null });
  await repo.saveQuincena({ id: 'q2', monthId: 'm', number: 2, date: '2026-05-31', note: null });
  await repo.addPocket('Reserva');
  return repo;
}

beforeEach(() => {
  toast.mockClear();
});

test('egreso defaults: current quincena, parte Completo, pagado', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  const res = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 30000, descripcion: 'Pizza' }));
  expect(res.ok).toBe(true);
  expect(res.resumen).toContain('$ 30.000');
  const [m] = await repo.listMovements('q1');
  expect(m).toMatchObject({ description: 'Pizza', amountCents: 3000000, parte: 'Completo', paid: true, transactionDate: '2026-05-10' });
  expect(toast).toHaveBeenCalledTimes(1);
  expect(typeof toast.mock.calls[0][1]).toBe('function');
});

test('ingreso has no paid state', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  await tools.agregar_movimiento({ tipo: 'ingreso', monto: 100000, descripcion: 'Sueldo' });
  const [m] = await repo.listMovements('q1');
  expect(m.paid).toBe(false);
});

test('monto in pesos becomes cents; monto <= 0 is rejected', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  expect(JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 0, descripcion: 'X' })))
    .toEqual({ ok: false, reason: 'monto_invalido' });
  expect(JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: -5, descripcion: 'X' })))
    .toEqual({ ok: false, reason: 'monto_invalido' });
  expect(await repo.listMovements('q1')).toEqual([]);
  expect(toast).not.toHaveBeenCalled();
});

test('money into a pocket creates a paid egreso with that pocket', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  const res = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 100000, descripcion: 'Aporte', bolsillo: 'Reserva' }));
  expect(res.ok).toBe(true);
  const [m] = await repo.listMovements('q1');
  expect(m).toMatchObject({ pocket: 'Reserva', paid: true });
});

test('an unknown pocket lists what exists and creates nothing', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  const res = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 1000, descripcion: 'X', bolsillo: 'Fantasmas' }));
  expect(res.reason).toBe('bolsillo_desconocido');
  expect(res.disponibles).toContain('Reserva');
  expect(await repo.listMovements('q1')).toEqual([]);
});

test('search ignores case and accents; near-misses return the full quincena', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  await tools.agregar_movimiento({ tipo: 'egreso', monto: 250000, descripcion: 'Renta' });
  await tools.agregar_movimiento({ tipo: 'egreso', monto: 5000, descripcion: 'Café' });

  const exact = JSON.parse(await tools.buscar_movimientos({ texto: 'RENTA' }));
  expect(exact.matches).toHaveLength(1);

  const accent = JSON.parse(await tools.buscar_movimientos({ texto: 'cafe' }));
  expect(accent.matches).toHaveLength(1);
  expect(accent.matches[0].description).toBe('Café');

  const near = JSON.parse(await tools.buscar_movimientos({ texto: 'arriendo' }));
  expect(near.matches).toEqual([]);
  expect(near.quincena).toHaveLength(2);
  expect(near.quincena[0]).toEqual(
    expect.objectContaining({ id: expect.any(String), description: 'Renta', amount: expect.any(String) }),
  );
});

test('a month that does not exist reports mes_no_existe', async () => {
  const repo = await testRepo();
  const tools = createVoiceTools({ repo }, may10);
  expect(JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 100, descripcion: 'X' })))
    .toEqual({ ok: false, reason: 'mes_no_existe', mes: '2026-05' });
  expect(JSON.parse(await tools.consultar_totales({})))
    .toEqual({ ok: false, reason: 'mes_no_existe', mes: '2026-05' });
});

test('delete needs confirmation and deletes nothing without it', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  const added = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 1000, descripcion: 'Borrame' }));
  expect(JSON.parse(await tools.eliminar_movimiento({ id: added.id, confirmado: false })))
    .toEqual({ ok: false, reason: 'requiere_confirmacion' });
  expect(await repo.findMovement(added.id)).not.toBeNull();
  expect(JSON.parse(await tools.eliminar_movimiento({ id: added.id, confirmado: true })).ok).toBe(true);
  expect(await repo.findMovement(added.id)).toBeNull();
});

test('undo restores the prior state', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  const added = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 50000, descripcion: 'Original' }));

  const undoAdd = toast.mock.calls[toast.mock.calls.length - 1][1];
  await undoAdd();
  expect(await repo.findMovement(added.id)).toBeNull();

  const added2 = JSON.parse(await tools.agregar_movimiento({ tipo: 'egreso', monto: 50000, descripcion: 'Original' }));
  await tools.editar_movimiento({ id: added2.id, monto: 60000, descripcion: 'Cambiado' });
  const undoEdit = toast.mock.calls[toast.mock.calls.length - 1][1];
  await undoEdit();
  expect(await repo.findMovement(added2.id)).toMatchObject({ amountCents: 5000000, description: 'Original' });

  await tools.marcar_pagado({ id: added2.id, pagado: false });
  const undoPaid = toast.mock.calls[toast.mock.calls.length - 1][1];
  await undoPaid();
  expect((await repo.findMovement(added2.id))?.paid).toBe(true);
});

test('totals use readable pesos', async () => {
  const repo = await seed();
  const tools = createVoiceTools({ repo }, may10);
  await tools.agregar_movimiento({ tipo: 'ingreso', monto: 100000, descripcion: 'Sueldo' });
  await tools.agregar_movimiento({ tipo: 'egreso', monto: 30000, descripcion: 'Pizza' });
  const res = JSON.parse(await tools.consultar_totales({}));
  expect(res.totales).toMatchObject({
    ingresos: '$ 100.000', egresos: '$ 30.000', pagado: '$ 30.000',
    saldoActual: '$ 70.000', meQuedo: '$ 70.000',
  });
});
