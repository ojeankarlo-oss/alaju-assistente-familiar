import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, NativeModules } from "react-native";
import { speakNatural } from "@/lib/voice-utils";

// Palavras-chave que ativam a assistente
const WAKE_WORDS = [
  "oi alaju",
  "olá alaju",
  "ola alaju",
  "hey alaju",
  "ei alaju",
  "alaju",
];

const WAKE_RESPONSES = [
  "Olá! No que posso ajudar hoje?",
  "Oi! Do que você precisa?",
  "Estou aqui! Como posso te ajudar?",
  "Pois não! O que você precisa?",
  "Oi! Em que posso ser útil?",
];

function getWakeResponse(): string {
  return WAKE_RESPONSES[Math.floor(Math.random() * WAKE_RESPONSES.length)];
}

function containsWakeWord(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WAKE_WORDS.some((w) => lower.includes(w));
}

function extractCommand(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(oi|olá|ola|hey|ei)\s+alaju\s*/i, "")
    .replace(/^alaju\s*/i, "")
    .trim();
}

/** Verifica se o módulo nativo expo-speech-recognition está disponível neste APK */
function isSpeechRecognitionAvailable(): boolean {
  if (Platform.OS === "web") return false;
  try {
    // Verifica se o módulo nativo existe no bundle atual
    return !!(
      NativeModules.ExpoSpeechRecognition ||
      NativeModules.RNExpoSpeechRecognition
    );
  } catch {
    return false;
  }
}

export type StandbyState = "off" | "standby" | "activated" | "restarting" | "unavailable";

/**
 * Hook de modo plantão: mantém o reconhecimento de voz em loop contínuo,
 * detectando a wake word "Alaju" e respondendo com voz.
 * Usa import dinâmico para ser compatível com APKs que não têm expo-speech-recognition.
 *
 * @param onWakeCommand - Callback chamado quando há um comando após a wake word
 * @param enabled - Se false, o modo plantão fica desativado
 */
export function useStandbyMode(
  onWakeCommand?: (command: string) => void,
  enabled: boolean = false
) {
  const [standbyState, setStandbyState] = useState<StandbyState>("off");
  const isRunningRef = useRef(false);
  const enabledRef = useRef(enabled);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef("");
  const moduleRef = useRef<any>(null);
  const listenersRef = useRef<any[]>([]);
  const moduleAvailableRef = useRef<boolean | null>(null);

  // Manter ref sincronizada com prop
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  /** Carrega o módulo dinamicamente apenas uma vez */
  const loadModule = useCallback(async (): Promise<boolean> => {
    if (moduleAvailableRef.current !== null) return moduleAvailableRef.current;

    if (!isSpeechRecognitionAvailable()) {
      console.warn("[Standby] expo-speech-recognition não disponível neste APK. Compile um novo APK para usar o modo plantão.");
      moduleAvailableRef.current = false;
      return false;
    }

    try {
      const mod = await import("expo-speech-recognition");
      moduleRef.current = mod.ExpoSpeechRecognitionModule;
      moduleAvailableRef.current = true;
      return true;
    } catch (err) {
      console.warn("[Standby] Falha ao carregar expo-speech-recognition:", err);
      moduleAvailableRef.current = false;
      return false;
    }
  }, []);

  const stopStandby = useCallback(async () => {
    isRunningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    // Remover listeners
    listenersRef.current.forEach((l) => { try { l?.remove?.(); } catch { /* ignora */ } });
    listenersRef.current = [];
    // Parar reconhecimento
    try { moduleRef.current?.stop?.(); } catch { /* ignora */ }
    setStandbyState("off");
  }, []);

  const startListeningCycle = useCallback(async () => {
    if (!enabledRef.current || Platform.OS === "web") return;
    if (isRunningRef.current) return;

    const available = await loadModule();
    if (!available) {
      setStandbyState("unavailable");
      return;
    }

    const SpeechModule = moduleRef.current;

    try {
      const perm = await SpeechModule.requestPermissionsAsync();
      if (!perm.granted) {
        setStandbyState("off");
        return;
      }

      isRunningRef.current = true;
      finalTranscriptRef.current = "";
      setStandbyState("standby");

      // Remover listeners antigos antes de adicionar novos
      listenersRef.current.forEach((l) => { try { l?.remove?.(); } catch { /* ignora */ } });
      listenersRef.current = [];

      // Listener de resultado
      const resultListener = SpeechModule.addListener("result", (event: any) => {
        if (!isRunningRef.current) return;
        const results = event.results;
        if (!results || results.length === 0) return;
        const last = results[results.length - 1];
        const text = last?.transcript ?? "";
        if (text) finalTranscriptRef.current = text;
      });

      // Listener de fim do ciclo
      const endListener = SpeechModule.addListener("end", () => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;

        const text = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";

        if (text && containsWakeWord(text)) {
          setStandbyState("activated");
          const command = extractCommand(text);
          const response = getWakeResponse();

          speakNatural(response, {
            onDone: () => {
              if (command) onWakeCommand?.(command);
              if (enabledRef.current) {
                setStandbyState("restarting");
                restartTimerRef.current = setTimeout(() => {
                  if (enabledRef.current) startListeningCycle();
                }, 1500);
              } else {
                setStandbyState("off");
              }
            },
            onError: () => {
              if (enabledRef.current) {
                restartTimerRef.current = setTimeout(() => {
                  if (enabledRef.current) startListeningCycle();
                }, 2000);
              }
            },
          });
        } else {
          if (enabledRef.current) {
            restartTimerRef.current = setTimeout(() => {
              if (enabledRef.current) startListeningCycle();
            }, 500);
          } else {
            setStandbyState("off");
          }
        }
      });

      // Listener de erro
      const errorListener = SpeechModule.addListener("error", (event: any) => {
        if (!isRunningRef.current && standbyState === "off") return;
        isRunningRef.current = false;

        const code = event.error;
        const delay = code === "no-speech" ? 500 : 3000;

        if (enabledRef.current) {
          setStandbyState("restarting");
          restartTimerRef.current = setTimeout(() => {
            if (enabledRef.current) startListeningCycle();
          }, delay);
        } else {
          setStandbyState("off");
        }
      });

      listenersRef.current = [resultListener, endListener, errorListener];

      SpeechModule.start({
        lang: "pt-BR",
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
      });
    } catch (err) {
      console.warn("[Standby] Erro ao iniciar:", err);
      isRunningRef.current = false;
      setStandbyState("restarting");
      restartTimerRef.current = setTimeout(() => {
        if (enabledRef.current) startListeningCycle();
      }, 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadModule, onWakeCommand]);

  // Iniciar/parar quando `enabled` muda
  useEffect(() => {
    if (Platform.OS === "web") return;

    if (enabled) {
      startListeningCycle();
    } else {
      stopStandby();
    }

    return () => {
      isRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      listenersRef.current.forEach((l) => { try { l?.remove?.(); } catch { /* ignora */ } });
      listenersRef.current = [];
      try { moduleRef.current?.stop?.(); } catch { /* ignora */ }
    };
  }, [enabled, startListeningCycle, stopStandby]);

  return { standbyState, stopStandby };
}
