import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { trpc } from "@/lib/trpc";

// ─── Configuração de áudio ────────────────────────────────────────────────────

let audioModeConfigured = false;

async function ensureAudioMode() {
  if (audioModeConfigured || Platform.OS === "web") return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    audioModeConfigured = true;
  } catch {
    // ignora
  }
}

// ─── Cache de voz expo-speech (fallback) ─────────────────────────────────────

let cachedVoiceId: string | null | undefined = undefined;

const FEMALE_PT_BR_VOICE_KEYWORDS = [
  "ptf", "female", "feminina", "mulher",
  "pt-br-x-ptf", "pt-br-x-ptd",
  "heloisa", "luciana", "vitoria", "vitória", "ana", "camila",
];

export async function getBestFemaleVoice(): Promise<string | null> {
  if (cachedVoiceId !== undefined) return cachedVoiceId;
  if (Platform.OS === "web") { cachedVoiceId = null; return null; }

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const ptVoices = voices.filter(
      (v) =>
        v.language?.toLowerCase().startsWith("pt") ||
        v.identifier?.toLowerCase().includes("pt-br") ||
        v.identifier?.toLowerCase().includes("pt_br")
    );
    if (ptVoices.length === 0) { cachedVoiceId = null; return null; }

    for (const keyword of FEMALE_PT_BR_VOICE_KEYWORDS) {
      const match = ptVoices.find(
        (v) =>
          v.identifier?.toLowerCase().includes(keyword) ||
          v.name?.toLowerCase().includes(keyword)
      );
      if (match) { cachedVoiceId = match.identifier; return match.identifier; }
    }

    const enhanced = ptVoices.find((v) => v.quality === Speech.VoiceQuality?.Enhanced);
    if (enhanced) { cachedVoiceId = enhanced.identifier; return enhanced.identifier; }

    const ptBR = ptVoices.find(
      (v) =>
        v.language?.toLowerCase() === "pt-br" ||
        v.identifier?.toLowerCase().includes("pt-br")
    );
    if (ptBR) { cachedVoiceId = ptBR.identifier; return ptBR.identifier; }

    cachedVoiceId = ptVoices[0].identifier;
    return ptVoices[0].identifier;
  } catch {
    cachedVoiceId = null;
    return null;
  }
}

// ─── Fallback: expo-speech ────────────────────────────────────────────────────

async function speakWithExpoSpeech(
  text: string,
  options?: {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
    onStart?: () => void;
  }
): Promise<void> {
  await Speech.stop().catch(() => {});
  const voiceId = await getBestFemaleVoice();
  const speechOptions: Speech.SpeechOptions = {
    language: "pt-BR",
    rate: 0.9,
    pitch: 1.1,
    onDone: options?.onDone,
    onStopped: options?.onStopped,
    onError: options?.onError,
    onStart: options?.onStart,
  };
  if (voiceId) speechOptions.voice = voiceId;
  Speech.speak(text, speechOptions);
}

// ─── ElevenLabs: reproduzir base64 MP3 ───────────────────────────────────────

let currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;

async function speakWithElevenLabs(
  base64: string,
  options?: {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
    onStart?: () => void;
  }
): Promise<void> {
  await ensureAudioMode();

  // Parar player anterior
  if (currentPlayer) {
    try { currentPlayer.remove(); } catch { /* ignora */ }
    currentPlayer = null;
  }

  try {
    // Salvar MP3 em arquivo temporário
    const fileUri = FileSystem.cacheDirectory + `alaju_tts_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    options?.onStart?.();

    const player = createAudioPlayer({ uri: fileUri });
    currentPlayer = player;

    // Monitorar fim da reprodução
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        try { player.remove(); } catch { /* ignora */ }
        if (currentPlayer === player) currentPlayer = null;
        // Limpar arquivo temporário
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        options?.onDone?.();
      }
    });

    player.play();
  } catch (err) {
    console.warn("[ElevenLabs Player] Erro ao reproduzir:", err);
    options?.onError?.();
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Fala um texto usando ElevenLabs (voz ultra-natural) com fallback para expo-speech.
 * A chamada ao ElevenLabs é feita pelo servidor para proteger a API key.
 */
export async function speakNatural(
  text: string,
  options?: {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
    onStart?: () => void;
  }
): Promise<void> {
  if (Platform.OS === "web") {
    options?.onDone?.();
    return;
  }

  try {
    // Tentar ElevenLabs via servidor
    const { getApiBaseUrl } = await import("@/constants/oauth");
    const apiUrl = getApiBaseUrl();
    const res = await fetch(`${apiUrl}/api/trpc/tts.speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { text } }),
    });

    if (res.ok) {
      const data = await res.json() as { result?: { data?: { json?: { base64?: string; available?: boolean } } } };
      const result = data?.result?.data?.json;
      if (result?.available && result?.base64) {
        await speakWithElevenLabs(result.base64, options);
        return;
      }
    }
  } catch (err) {
    console.warn("[speakNatural] ElevenLabs indisponível, usando fallback:", err);
  }

  // Fallback para expo-speech
  await speakWithExpoSpeech(text, options);
}

/**
 * Para a fala atual (tanto ElevenLabs quanto expo-speech).
 */
export async function stopSpeaking(): Promise<void> {
  // Parar ElevenLabs
  if (currentPlayer) {
    try { currentPlayer.remove(); } catch { /* ignora */ }
    currentPlayer = null;
  }
  // Parar expo-speech (fallback)
  await Speech.stop().catch(() => {});
}

/**
 * Reseta o cache de voz (útil para forçar nova seleção).
 */
export function resetVoiceCache(): void {
  cachedVoiceId = undefined;
}
