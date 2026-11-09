import { useEffect, useState } from 'react';
import { Alert, Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Pocket } from '../src/domain/types';
import { ToastHost, showToast } from '../src/ui/Toast';
import { useRepo, useRepoVersion } from '../src/ui/repo';

export default function Pockets() {
  const repo = useRepo();
  const version = useRepoVersion(repo);
  const [pockets, setPockets] = useState<Pocket[]>([]);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');

  useEffect(() => {
    if (!repo) return;
    repo.listPockets().then(setPockets, (e) => console.error('pockets load failed', e));
  }, [repo, version]);

  async function add() {
    if (!repo) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Escribe un nombre primero');
      return;
    }
    try {
      await repo.addPocket(trimmed);
      setName('');
      showToast(`Bolsillo ${trimmed} agregado`);
    } catch (e) {
      console.error('pocket add failed', e);
      showToast('No se pudo agregar');
    }
  }

  async function rename(oldName: string) {
    if (!repo) return;
    const trimmed = renameTo.trim();
    if (!trimmed) {
      showToast('Escribe el nuevo nombre');
      return;
    }
    try {
      await repo.renamePocket(oldName, trimmed);
      setRenaming(null);
      setRenameTo('');
      showToast('Bolsillo actualizado en todo el historial');
    } catch (e) {
      console.error('pocket rename failed', e);
      showToast('No se pudo renombrar');
    }
  }

  function deactivate(p: Pocket) {
    if (!repo) return;
    Alert.alert('Desactivar bolsillo', `¿Desactivar ${p.name}? Los movimientos antiguos lo conservan.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar', style: 'destructive',
        onPress: () => {
          repo.deactivatePocket(p.name).then(
            () => showToast(`${p.name} desactivado`),
            (e) => {
              console.error('pocket deactivate failed', e);
              showToast('No se pudo desactivar');
            },
          );
        },
      },
    ]);
  }

  if (!repo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={name} onChangeText={setName} placeholder="Nuevo bolsillo"
            style={{ flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }}
          />
          <Button title="Agregar" onPress={add} />
        </View>
        {pockets.map((p) => (
          <View key={p.name} style={{ padding: 12, backgroundColor: p.active ? '#fff' : '#eee', borderRadius: 8, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>
                {p.name}{p.active ? '' : ' (inactivo)'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => { setRenaming(p.name); setRenameTo(p.name); }}>
                  <Text style={{ color: '#0b5cad' }}>Renombrar</Text>
                </Pressable>
                {p.active && (
                  <Pressable onPress={() => deactivate(p)}>
                    <Text style={{ color: '#c00' }}>Desactivar</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {renaming === p.name && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={renameTo} onChangeText={setRenameTo}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }}
                />
                <Button title="Guardar" onPress={() => rename(p.name)} />
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      <ToastHost />
    </View>
  );
}
