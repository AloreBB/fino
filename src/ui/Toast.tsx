import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export interface ToastData {
  message: string;
  undo?: () => void;
}

interface Item extends ToastData {
  id: number;
}

let nextId = 1;
// Default is a no-op so showToast is safe in tests and before the host mounts.
let emit: (t: Item) => void = () => {};

/** Shows a short message, optionally with an undo action. Never throws. */
export function showToast(message: string, undo?: () => void): void {
  try {
    emit({ id: nextId++, message, undo });
  } catch (e) {
    console.error('toast failed', e);
  }
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    emit = (t: Item) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== t.id));
      }, 5000);
    };
    return () => {
      emit = () => {};
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 24, gap: 8 }}>
      {items.map((t) => (
        <View
          key={t.id}
          style={{ backgroundColor: '#222', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Text style={{ color: '#fff', flex: 1 }}>{t.message}</Text>
          {t.undo && (
            <Pressable
              onPress={() => {
                t.undo?.();
                setItems((cur) => cur.filter((x) => x.id !== t.id));
              }}
            >
              <Text style={{ color: '#8ecbff', fontWeight: '600' }}>Deshacer</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
