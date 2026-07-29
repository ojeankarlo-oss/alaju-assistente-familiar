import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, NativeModules } from "react-native";
import { speakNatural } from "@/lib/voice-utils";

// ── Wake word detection ──────────────────────────────────────────────────────
// Variações fonéticas e de transcrição da palavra "Alaju"
// O reconhecedor de voz pode transcrever de formas diferentes
const WAKE_WORD_PATTERNS = [
  // Exatas
  "alaju",
  "oi alaju",
  "olá alaju",
  "ola alaju",
  "hey alaju",
  "ei alaju",
  "e alaju",
  // Variações fonéticas comuns do reconhecedor
  "a laju",
  "ah laju",
  "alajú",
  "alajou",
  "alaiu",
  "alajoo",
  "a la ju",
  "ala ju",
  "alaju assistente",
  "alaju ajuda",
  // Inglês (o reconhecedor pode transcrever em inglês)
  "a la you",
  "a la ju",
  "alayou",
];

// Padrões fonéticos aproximados (distância de edição)
const WAKE_WORD_FUZZY = ["alaj", "laju", "alaiu", "alahu", "alayo"];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9 ]/g, " ")     // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

function containsWakeWord(text: string): boolean {
  const normalized = normalizeText(text);

  // Verificar padrões exatos
  for (const pattern of WAKE_WORD_PATTERNS) {
    const normalizedPattern = normalizeText(pattern);
    if (normalized.includes(normalizedPattern)) return true;
  }

  // Verificar padrões fuzzy (substrings fonéticas)
  for (const fuzzy of WAKE_WORD_FUZZY) {
    if (normalized.includes(fuzzy)) return true;
  }

  return false;
}

function extractCommand(text: string): string {
  const normalized = normalizeText(text);

  // Remover a wake word e retornar o comando restante
  let command = normalized;
  for (const pattern of WAKE_WORD_PATTERNS) {
    const normalizedPattern = normalizeText(pattern);
    command = command.replace(normalizedPattern, "").trim();
  }
  for (const fuzzy of WAKE_WORD_FUZZY) {
    command = command.replace(fuzzy, "").trim();
  }

  // Remover prefixos comuns
  command = command
    .replace(/^(oi|ola|olá|hey|ei|e|ah|a)\s+/i, "")
    .trim();

  return command;
}

const WAKE_RESPONSES = [
  "Olá! No que posso ajudar hoje?",
  "Oi! Do que você precisa?",
  "Estou aqui! Como posso te ajudar?",
  "Pois não! O que você precisa?",
  "Oi! Em que posso ser útil?",
  "Pode falar! Estou ouvindo.",
];

function getWakeResponse(): string {
  return WAKE_RESPONSES[Math.floor(Math.random() * WAKE_RESPONSES.length)];
}

/** Verifica se o módulo nativo expo-speech-recognition está disponível neste APK */
function isSpeechRecognitionAvailable(): boolean {
  if (Platform.OS === "web") return false;
  try {
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
 * detectando a wake word "Alaju" (com variações fonéticas) e respondendo com voz.
 *
 * Como funciona:
 * 1. Inicia o reconhecimento de voz continuamente
 * 2. Ao detectar "Alaju" (ou variações) no texto transcrito, ativa a assistente
 * 3. Fala uma resposta de boas-vindas
 * 4. Envia o comando (texto após a wake word) para processamento
 * 5. Reinicia o ciclo de escuta
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
  const onWakeCommandRef = useRef(onWakeCommand);

  // Manter refs sincronizadas
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onWakeCommandRef.current = onWakeCommand;
  }, [onWakeCommand]);

  /** Carrega o módulo dinamicamente apenas uma vez */
  const loadModule = useCallback(async (): Promise<boolean> => {
    if (moduleAvailableRef.current !== null) return moduleAvailableRef.current;

    if (!isSpeechRecognitionAvailable()) {
      console.warn(
        "[Standby] expo-speech-recognition não disponível. " +
        "Compile um novo APK para usar o modo plantão."
      );
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
    listenersRef.current.forEach((l) => {
      try { l?.remove?.(); } catch { /* ignora */ }
    });
    listenersRef.current = [];
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

      // Remover listeners antigos
      listenersRef.current.forEach((l) => {
        try { l?.remove?.(); } catch { /* ignora */ }
      });
      listenersRef.current = [];

      // Listener de resultado — acumula transcrições parciais
      const resultListener = SpeechModule.addListener("result", (event: any) => {
        if (!isRunningRef.current) return;
        const results = event.results;
        if (!results || results.length === 0) return;
        const last = results[results.length - 1];
        const text = last?.transcript ?? "";
        if (text) {
          finalTranscriptRef.current = text;

          // Detecção em tempo real: se já detectou a wake word nos resultados parciais,
          // pode parar o reconhecimento e ativar imediatamente
          if (containsWakeWord(text) && isRunningRef.current) {
            console.log("[Standby] Wake word detectada (parcial):", text);
            // Não para aqui — deixa o 'end' tratar para ter o texto completo
          }
        }
      });

      // Listener de fim do ciclo
      const endListener = SpeechModule.addListener("end", () => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;

        const text = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";

        console.log("[Standby] Texto transcrito:", JSON.stringify(text));

        if (text && containsWakeWord(text)) {
          console.log("[Standby] Wake word 'Alaju' detectada! Ativando assistente...");
          setStandbyState("activated");
          const command = extractCommand(text);
          const response = getWakeResponse();

          speakNatural(response, {
            onDone: () => {
              if (command && command.length > 2) {
                onWakeCommandRef.current?.(command);
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
          // Sem wake word — reiniciar ciclo rapidamente
          if (enabledRef.current) {
            restartTimerRef.current = setTimeout(() => {
              if (enabledRef.current) startListeningCycle();
            }, 300);
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
        console.log("[Standby] Erro de reconhecimento:", code);

        // "no-speech" é normal — reiniciar rapidamente
        const delay = code === "no-speech" ? 300 : 3000;

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
        interimResults: true,  // Resultados parciais para detecção mais rápida
        maxAlternatives: 3,    // Mais alternativas aumenta chances de detectar
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
  }, [loadModule]);

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
      listenersRef.current.forEach((l) => {
        try { l?.remove?.(); } catch { /* ignora */ }
      });
      listenersRef.current = [];
      try { moduleRef.current?.stop?.(); } catch { /* ignora */ }
    };
  }, [enabled, startListeningCycle, stopStandby]);

  return { standbyState, stopStandby };
}
