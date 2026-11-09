import { router } from 'expo-router';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { Button, Text, View } from 'react-native';
import {
  ConversationProvider,
  useConversation,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from '@elevenlabs/react-native';
import { createVoiceTools } from '../voice/tools';
import { useRepo } from './repo';

function transcriptLine(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;
  if (e['type'] !== 'user_transcript' && e['type'] !== 'agent_response') return null;
  const who = e['type'] === 'user_transcript' ? 'Tú' : 'Fino';
  const text = Object.entries(e).find(([k, v]) => k !== 'type' && typeof v === 'string');
  return text ? `${who}: ${text[1]}` : null;
}

function VoiceSession({ agentId }: { agentId: string }) {
  const { status } = useConversationStatus();
  const { mode, isSpeaking } = useConversationMode();
  const { startSession, endSession } = useConversationControls();
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useConversation({
    onMessage: (event) => {
      const text = transcriptLine(event);
      if (text) setLine(text);
    },
    onError: (error) => console.error('voice session failed', error),
  });

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setLine('Sin permiso de micrófono. Actívalo en los ajustes del teléfono.');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      await startSession({ agentId, dynamicVariables: { today } });
    } catch (e) {
      console.error('voice start failed', e);
      setLine('No se pudo conectar. Revisa tu internet: sin conexión la voz no funciona, pero los botones sí.');
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'connected' && status !== 'connecting') {
    return (
      <View style={{ gap: 4 }}>
        <Button title="Hablar" onPress={start} disabled={busy} />
        {line ? <Text style={{ color: '#666' }}>{line}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 4, padding: 12, backgroundColor: '#e7f3ff', borderRadius: 8 }}>
      <Text style={{ fontWeight: '700' }}>
        {status === 'connecting' ? 'Conectando…' : isSpeaking || mode === 'speaking' ? 'Hablando…' : 'Escuchando…'}
      </Text>
      {line ? <Text>{line}</Text> : null}
      <Button title="Terminar" onPress={() => endSession()} />
    </View>
  );
}

/** Mic button for the main screen. Needs an agent ID; without one voice stays off. */
export function VoiceButton() {
  const repo = useRepo();
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) return;
    repo.getVoiceAgentId().then(setAgentId, (e) => console.error('voice agent id load failed', e));
  }, [repo]);

  const clientTools = useMemo(() => {
    if (!repo) return undefined;
    const tools = createVoiceTools({ repo }, () => new Date());
    return {
      buscar_movimientos: (p: { texto?: string; mes?: string; quincena?: number }) => tools.buscar_movimientos(p),
      agregar_movimiento: (p: { tipo: string; monto: number; descripcion: string; bolsillo?: string; parte?: string; pagado?: boolean; mes?: string; quincena?: number }) => tools.agregar_movimiento(p),
      editar_movimiento: (p: { id: string; monto?: number; descripcion?: string; bolsillo?: string; parte?: string; pagado?: boolean }) => tools.editar_movimiento(p),
      marcar_pagado: (p: { id: string; pagado: boolean }) => tools.marcar_pagado(p),
      eliminar_movimiento: (p: { id: string; confirmado: boolean }) => tools.eliminar_movimiento(p),
      consultar_totales: (p: { mes?: string; quincena?: number }) => tools.consultar_totales(p),
    };
  }, [repo]);

  if (!repo) return null;
  if (!agentId) {
    return (
      <View style={{ padding: 8, gap: 4 }}>
        <Text style={{ color: '#666' }}>La voz es opcional.</Text>
        <Button title="Configurar voz" onPress={() => router.push('/settings')} />
      </View>
    );
  }
  return (
    <ConversationProvider clientTools={clientTools}>
      <VoiceSession agentId={agentId} />
    </ConversationProvider>
  );
}
