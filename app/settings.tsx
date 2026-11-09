import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { ToastHost, showToast } from '../src/ui/Toast';
import { useRepo } from '../src/ui/repo';

/** Each user pastes their own ElevenLabs agent ID; the APK carries none. */
export default function Settings() {
  const repo = useRepo();
  const [agentId, setAgentId] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!repo) return;
    repo.getVoiceAgentId().then(
      (id) => {
        setAgentId(id ?? '');
        setLoaded(true);
      },
      (e) => console.error('voice agent id load failed', e),
    );
  }, [repo]);

  async function save() {
    if (!repo) return;
    try {
      await repo.setVoiceAgentId(agentId.trim() === '' ? null : agentId.trim());
      showToast(agentId.trim() === '' ? 'Voz desactivada' : 'Voz configurada');
    } catch (e) {
      console.error('voice agent id save failed', e);
      showToast('No se pudo guardar');
    }
  }

  if (!repo || !loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>Agente de voz (ElevenLabs)</Text>
        <Text style={{ color: '#666' }}>
          Pega el ID de tu propio agente para hablar con la app. Sin ID, la app funciona igual y la voz queda apagada.
        </Text>
        <TextInput
          value={agentId} onChangeText={setAgentId} placeholder="agent_..."
          autoCapitalize="none" autoCorrect={false}
          style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10 }}
        />
        <Button title="Guardar" onPress={save} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}
