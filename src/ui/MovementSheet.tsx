import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { parseAmount } from '../domain/money';
import { splitAcrossQuincenas } from '../domain/quincena';
import type { Movement, Parte } from '../domain/types';
import { useRepo } from './repo';
import { showToast } from './Toast';

interface Props {
  visible: boolean;
  quincenaId: string;
  quincenaNumber: 1 | 2;
  siblingQuincenaId: string | null;
  movement?: Movement | null;
  onClose: () => void;
}

const PARTES: Parte[] = ['Completo', '1ra', '2da'];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Bottom sheet to add or edit a movement. Invalid input shows an error and keeps what was typed. */
export function MovementSheet({ visible, quincenaId, quincenaNumber, siblingQuincenaId, movement, onClose }: Props) {
  const repo = useRepo();
  const [kind, setKind] = useState<'ingreso' | 'egreso'>('egreso');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [pocket, setPocket] = useState('');
  const [parte, setParte] = useState<Parte>('Completo');
  const [date, setDate] = useState(todayIso());
  const [dateError, setDateError] = useState<string | null>(null);
  const [paid, setPaid] = useState(true);
  const [pockets, setPockets] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<{ description: string; pocket: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(movement?.kind ?? 'egreso');
    setAmount(movement ? String(movement.amountCents / 100).replace('.', ',') : '');
    setAmountError(null);
    setDescription(movement?.description ?? '');
    setPocket(movement?.pocket ?? '');
    setParte(movement?.parte ?? 'Completo');
    setDate(movement?.transactionDate ?? todayIso());
    setDateError(null);
    setPaid(movement ? movement.paid : true);
    setSuggestions([]);
    setSaving(false);
    repo?.listPockets().then(
      (ps) => setPockets(ps.filter((p) => p.active).map((p) => p.name)),
      (e) => console.error('pockets load failed', e),
    );
  }, [visible, movement, repo, quincenaId]);

  useEffect(() => {
    const prefix = description.trim();
    if (!repo || prefix.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    repo.recentDescriptions(prefix).then(
      (rows) => {
        if (alive) setSuggestions(rows.filter((r) => r.description !== prefix).slice(0, 5));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [description, repo]);

  async function save() {
    if (!repo || saving) return;
    const parsed = parseAmount(amount);
    if (!parsed) {
      setAmountError('Monto inválido. Ejemplos: 38.000, 12345,5 o 100000/2.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setDateError('Fecha inválida. Usa el formato AAAA-MM-DD.');
      return;
    }
    setSaving(true);
    const desc = description.trim();
    try {
      if (movement) {
        await repo.updateMovement(movement.id, {
          kind, amountCents: parsed.cents, amountExpr: parsed.expr, description: desc,
          pocket: kind === 'egreso' ? pocket.trim() || null : null,
          parte: kind === 'egreso' ? parte : null,
          transactionDate: kind === 'egreso' ? date : null,
          paid: kind === 'egreso' ? paid : false,
        });
        showToast('Movimiento actualizado');
      } else {
        await repo.addMovement({
          quincenaId, kind, amountCents: parsed.cents, amountExpr: parsed.expr, description: desc,
          pocket: kind === 'egreso' ? pocket.trim() || null : null,
          parte: kind === 'egreso' ? parte : null,
          transactionDate: kind === 'egreso' ? date : null,
          paid: kind === 'egreso' ? paid : false,
        });
        showToast('Movimiento agregado');
      }
      onClose();
    } catch (e) {
      console.error('movement save failed', e);
      setAmountError('No se pudo guardar. Revisa e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function split() {
    if (!repo || !movement || !siblingQuincenaId) return;
    const [first, second] = splitAcrossQuincenas(movement.amountCents);
    try {
      const firstQ = quincenaNumber === 1 ? movement.quincenaId : siblingQuincenaId;
      const secondQ = quincenaNumber === 1 ? siblingQuincenaId : movement.quincenaId;
      await repo.addMovement({ ...movement, quincenaId: firstQ, amountCents: first, amountExpr: null, parte: '1ra' });
      await repo.addMovement({ ...movement, quincenaId: secondQ, amountCents: second, amountExpr: null, parte: '2da' });
      await repo.deleteMovement(movement.id);
      showToast('Dividido entre quincenas');
      onClose();
    } catch (e) {
      console.error('movement split failed', e);
      showToast('No se pudo dividir el movimiento');
    }
  }

  function confirmDelete() {
    if (!repo || !movement) return;
    Alert.alert('Eliminar movimiento', '¿Eliminar este movimiento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: () => {
          repo.deleteMovement(movement.id).then(
            () => {
              showToast('Movimiento eliminado');
              onClose();
            },
            (e) => {
              console.error('movement delete failed', e);
              showToast('No se pudo eliminar');
            },
          );
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', padding: 16, gap: 10, maxHeight: '88%' }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['ingreso', 'egreso'] as const).map((k) => (
              <Pressable
                key={k} onPress={() => setKind(k)}
                style={{ padding: 10, borderRadius: 8, backgroundColor: kind === k ? '#0b5cad' : '#e8edf1' }}
              >
                <Text style={{ color: kind === k ? '#fff' : '#000' }}>{k === 'ingreso' ? 'Ingreso' : 'Egreso'}</Text>
              </Pressable>
            ))}
          </View>

          <Text>Monto</Text>
          <TextInput
            value={amount} onChangeText={(t) => { setAmount(t); setAmountError(null); }}
            keyboardType="numbers-and-punctuation" placeholder="38.000 o 100000/2"
            style={{ borderWidth: 1, borderColor: amountError ? '#c00' : '#999', borderRadius: 8, padding: 10, fontSize: 20 }}
          />
          {amountError ? <Text style={{ color: '#c00' }}>{amountError}</Text> : null}

          <Text>Descripción</Text>
          <TextInput
            value={description} onChangeText={setDescription} placeholder="¿En qué fue?"
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, fontSize: 16 }}
          />
          {suggestions.length > 0 && (
            <View style={{ gap: 4 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.description}
                  onPress={() => { setDescription(s.description); if (s.pocket) setPocket(s.pocket); }}
                  style={{ padding: 8, backgroundColor: '#eef3f7', borderRadius: 6 }}
                >
                  <Text>{s.description}{s.pocket ? ` · ${s.pocket}` : ''}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {kind === 'egreso' && (
            <>
              <Text>Bolsillo (opcional)</Text>
              <TextInput
                value={pocket} onChangeText={setPocket} placeholder="Sin bolsillo"
                style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }}
              />
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {pockets.map((p) => (
                  <Pressable
                    key={p} onPress={() => setPocket(pocket === p ? '' : p)}
                    style={{ padding: 8, borderRadius: 16, backgroundColor: pocket === p ? '#0b5cad' : '#e8edf1' }}
                  >
                    <Text style={{ color: pocket === p ? '#fff' : '#000' }}>{p}</Text>
                  </Pressable>
                ))}
              </View>

              <Text>Parte</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PARTES.map((p) => (
                  <Pressable
                    key={p} onPress={() => setParte(p)}
                    style={{ padding: 8, borderRadius: 8, backgroundColor: parte === p ? '#0b5cad' : '#e8edf1' }}
                  >
                    <Text style={{ color: parte === p ? '#fff' : '#000' }}>{p}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={() => setPaid(!paid)} style={{ padding: 8 }}>
                <Text>{paid ? '✓ Pagado' : '○ Sin pagar'}</Text>
              </Pressable>
            </>
          )}

          <Text>Fecha (AAAA-MM-DD)</Text>
          <TextInput
            value={date} onChangeText={(t) => { setDate(t); setDateError(null); }}
            style={{ borderWidth: 1, borderColor: dateError ? '#c00' : '#999', borderRadius: 8, padding: 10 }}
          />
          {dateError ? <Text style={{ color: '#c00' }}>{dateError}</Text> : null}

          <View style={{ gap: 8, marginTop: 8 }}>
            <Button title={movement ? 'Guardar' : 'Agregar'} onPress={save} disabled={saving} />
            {movement?.kind === 'egreso' && siblingQuincenaId && (
              <Button title="Dividir entre quincenas" onPress={split} />
            )}
            {movement && <Button title="Eliminar" color="#c00" onPress={confirmDelete} />}
            <Button title="Cerrar" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
