import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
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

export type StandbyState = "off" | "standby" | "activated" | "restarting";

/**
 * Hook de modo plantão: mantém o reconhecimento de voz em loop contínuo,
 * detectando a wake word "Alaju" e respondendo com voz.
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

  // Manter ref sincronizada com prop
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const stopStandby = useCallback(() => {
    isRunningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch { /* ignora */ }
    setStandbyState("off");
  }, []);

  const startListeningCycle = useCallback(async () => {
    if (!enabledRef.current || Platform.OS === "web") return;
    if (isRunningRef.current) return;

    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setStandbyState("off");
        return;
      }

      isRunningRef.current = true;
      finalTranscriptRef.current = "";
      setStandbyState("standby");

      ExpoSpeechRecognitionModule.start({
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
      // Tentar novamente após 3 segundos
      restartTimerRef.current = setTimeout(() => {
        if (enabledRef.current) startListeningCycle();
      }, 3000);
    }
  }, []);

  // Resultado do reconhecimento
  useSpeechRecognitionEvent("result", (event) => {
    if (!isRunningRef.current || standbyState === "off") return;
    const results = event.results;
    if (!results || results.length === 0) return;
    const last = results[results.length - 1];
    const text = last?.transcript ?? "";
    if (text) finalTranscriptRef.current = text;
  });

  // Fim do ciclo de reconhecimento
  useSpeechRecognitionEvent("end", () => {
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
          // Após responder, passar o comando (se houver) e reiniciar escuta
          if (command) {
            onWakeCommand?.(command);
          }
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
      // Sem wake word — reiniciar ciclo imediatamente
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (enabledRef.current) startListeningCycle();
        }, 500);
      } else {
        setStandbyState("off");
      }
    }
  });

  // Erro no reconhecimento — reiniciar após pausa
  useSpeechRecognitionEvent("error", (event) => {
    if (!isRunningRef.current && standbyState === "off") return;
    isRunningRef.current = false;

    const code = event.error;
    // "no-speech" é esperado — reiniciar normalmente
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

  // Iniciar/parar quando `enabled` muda
  useEffect(() => {
    if (Platform.OS === "web") return;

    if (enabled) {
      startListeningCycle();
    } else {
      stopStandby();
    }

    return () => {
      // Cleanup ao desmontar
      isRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignora */ }
    };
  }, [enabled, startListeningCycle, stopStandby]);

  return { standbyState, stopStandby };
}
