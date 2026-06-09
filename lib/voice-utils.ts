import * as Speech from "expo-speech";
import { Platform } from "react-native";

// Cache da voz selecionada para não buscar toda vez
let cachedVoiceId: string | null | undefined = undefined; // undefined = não inicializado

/**
 * Prioridades de voz feminina em português para Android.
 * O Android usa Google TTS — as vozes de alta qualidade têm "pt-BR" e nomes como
 * "pt-br-x-ptf#female", "pt-BR-language", "Google português do Brasil" etc.
 */
const FEMALE_PT_BR_VOICE_KEYWORDS = [
  // Google TTS alta qualidade
  "ptf",
  "female",
  "feminina",
  "mulher",
  // Nomes comuns de vozes femininas Google
  "pt-br-x-ptf",
  "pt-br-x-ptd",
  // Samsung/outros
  "heloisa",
  "luciana",
  "vitoria",
  "vitória",
  "ana",
  "camila",
];

/**
 * Seleciona a melhor voz feminina em português disponível no dispositivo.
 * Retorna null se não encontrar (usa a voz padrão do sistema).
 */
export async function getBestFemaleVoice(): Promise<string | null> {
  // Retornar cache se já inicializado
  if (cachedVoiceId !== undefined) return cachedVoiceId;

  if (Platform.OS === "web") {
    cachedVoiceId = null;
    return null;
  }

  try {
    const voices = await Speech.getAvailableVoicesAsync();

    // Filtrar vozes em português
    const ptVoices = voices.filter(
      (v) =>
        v.language?.toLowerCase().startsWith("pt") ||
        v.identifier?.toLowerCase().includes("pt-br") ||
        v.identifier?.toLowerCase().includes("pt_br")
    );

    if (ptVoices.length === 0) {
      cachedVoiceId = null;
      return null;
    }

    // Tentar encontrar voz feminina por palavras-chave no identifier ou name
    for (const keyword of FEMALE_PT_BR_VOICE_KEYWORDS) {
      const match = ptVoices.find(
        (v) =>
          v.identifier?.toLowerCase().includes(keyword) ||
          v.name?.toLowerCase().includes(keyword)
      );
      if (match) {
        cachedVoiceId = match.identifier;
        console.log("[Voice] Usando voz feminina:", match.name, match.identifier);
        return match.identifier;
      }
    }

    // Preferir vozes de qualidade "Enhanced" se disponível
    const enhanced = ptVoices.find((v) => v.quality === Speech.VoiceQuality?.Enhanced);
    if (enhanced) {
      cachedVoiceId = enhanced.identifier;
      console.log("[Voice] Usando voz enhanced:", enhanced.name, enhanced.identifier);
      return enhanced.identifier;
    }

    // Usar a primeira voz em pt-BR disponível
    const ptBR = ptVoices.find(
      (v) =>
        v.language?.toLowerCase() === "pt-br" ||
        v.identifier?.toLowerCase().includes("pt-br")
    );
    if (ptBR) {
      cachedVoiceId = ptBR.identifier;
      console.log("[Voice] Usando voz pt-BR:", ptBR.name, ptBR.identifier);
      return ptBR.identifier;
    }

    // Qualquer voz pt
    cachedVoiceId = ptVoices[0].identifier;
    console.log("[Voice] Usando primeira voz pt:", ptVoices[0].name, ptVoices[0].identifier);
    return ptVoices[0].identifier;
  } catch (err) {
    console.warn("[Voice] Erro ao buscar vozes:", err);
    cachedVoiceId = null;
    return null;
  }
}

/**
 * Fala um texto com a melhor voz feminina disponível.
 * Parâmetros otimizados para soar mais natural e menos robótico.
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
    await Speech.stop().catch(() => {});

    const voiceId = await getBestFemaleVoice();

    const speechOptions: Speech.SpeechOptions = {
      language: "pt-BR",
      // Taxa levemente mais lenta que o padrão para soar mais natural
      rate: 0.9,
      // Tom levemente mais alto para voz feminina
      pitch: 1.1,
      onDone: options?.onDone,
      onStopped: options?.onStopped,
      onError: options?.onError,
      onStart: options?.onStart,
    };

    // Adicionar voz específica se encontrada
    if (voiceId) {
      speechOptions.voice = voiceId;
    }

    Speech.speak(text, speechOptions);
  } catch (err) {
    console.warn("[Voice] Erro ao falar:", err);
    options?.onError?.();
  }
}

/**
 * Para a fala atual.
 */
export async function stopSpeaking(): Promise<void> {
  await Speech.stop().catch(() => {});
}

/**
 * Reseta o cache de voz (útil para forçar nova seleção).
 */
export function resetVoiceCache(): void {
  cachedVoiceId = undefined;
}
