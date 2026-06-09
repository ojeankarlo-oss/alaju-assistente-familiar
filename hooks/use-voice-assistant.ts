import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { speakNatural, stopSpeaking } from "@/lib/voice-utils";
import { trpc } from "@/lib/trpc";

export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

// Frases de resposta ao ser acionada pela wake word
const WAKE_RESPONSES = [
  "Olá! No que posso ajudar hoje?",
  "Oi! Do que você precisa?",
  "Estou aqui! Como posso te ajudar?",
  "Pois não! O que você precisa?",
  "Oi! Em que posso ser útil?",
];

// Palavras-chave que ativam a assistente
const WAKE_WORDS = [
  "oi alaju",
  "olá alaju",
  "ola alaju",
  "hey alaju",
  "ei alaju",
  "alaju",
];

function getWakeResponse(): string {
  return WAKE_RESPONSES[Math.floor(Math.random() * WAKE_RESPONSES.length)];
}

function containsWakeWord(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WAKE_WORDS.some((w) => lower.includes(w));
}

export function useVoiceAssistant(onTranscript?: (text: string) => void) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const isListeningRef = useRef(false);
  const finalTranscriptRef = useRef("");

  const chatMutation = trpc.assistant.chat.useMutation();

  // ── Eventos do reconhecimento de voz ──────────────────────────────────────

  // Resultado parcial (em tempo real enquanto fala)
  useSpeechRecognitionEvent("result", (event) => {
    const results = event.results;
    if (!results || results.length === 0) return;

    const last = results[results.length - 1];
    const text = last?.transcript ?? "";

    if (event.isFinal || last?.confidence > 0) {
      finalTranscriptRef.current = text;
      setTranscript(text);
      setInterimTranscript("");
    } else {
      setInterimTranscript(text);
    }
  });

  // Reconhecimento encerrado — processar resultado
  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;

    const text = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = "";
    setInterimTranscript("");

    if (!text) {
      setVoiceState("idle");
      return;
    }

    // Verificar wake word
    if (containsWakeWord(text)) {
      setWakeWordDetected(true);
      setVoiceState("speaking");

      // Responder com voz natural feminina
      const response = getWakeResponse();
      speakNatural(response, {
        onStart: () => setVoiceState("speaking"),
        onDone: () => {
          setWakeWordDetected(false);
          setVoiceState("idle");
        },
        onStopped: () => {
          setWakeWordDetected(false);
          setVoiceState("idle");
        },
        onError: () => {
          setWakeWordDetected(false);
          setVoiceState("idle");
        },
      });

      // Passa o texto para o chat processar contexto (sem a wake word)
      const commandText = text
        .toLowerCase()
        .replace(/^(oi|olá|ola|hey|ei)\s+alaju\s*/i, "")
        .trim();
      if (commandText) {
        onTranscript?.(commandText);
      }
    } else {
      // Comando direto — passa para o chat
      setVoiceState("processing");
      onTranscript?.(text);
      setVoiceState("idle");
    }
  });

  // Erros
  useSpeechRecognitionEvent("error", (event) => {
    isListeningRef.current = false;
    const code = event.error;

    if (code === "no-speech") {
      setErrorMsg("Não ouvi nada. Tente novamente.");
    } else if (code === "not-allowed") {
      setErrorMsg("Permissão de microfone negada.");
    } else if (code === "network") {
      setErrorMsg("Sem conexão. Verifique a internet.");
    } else {
      setErrorMsg("Não consegui entender. Tente novamente.");
    }

    setVoiceState("error");
    setTimeout(() => {
      setVoiceState("idle");
      setErrorMsg("");
    }, 3000);
  });

  // ── Síntese de voz ────────────────────────────────────────────────────────

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (Platform.OS === "web") {
      onDone?.();
      return;
    }
    setVoiceState("speaking");
    speakNatural(text, {
      onStart: () => setVoiceState("speaking"),
      onDone: () => {
        setVoiceState("idle");
        onDone?.();
      },
      onStopped: () => {
        setVoiceState("idle");
        onDone?.();
      },
      onError: () => {
        setVoiceState("idle");
        onDone?.();
      },
    });
  }, []);

  // ── Controles ─────────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (isListeningRef.current || voiceState === "speaking") return;

    if (Platform.OS === "web") {
      setErrorMsg("Reconhecimento de voz não disponível no navegador.");
      setVoiceState("error");
      setTimeout(() => { setVoiceState("idle"); setErrorMsg(""); }, 3000);
      return;
    }

    try {
      // Solicitar permissão
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setErrorMsg("Permissão de microfone negada.");
        setVoiceState("error");
        setTimeout(() => { setVoiceState("idle"); setErrorMsg(""); }, 3000);
        return;
      }

      finalTranscriptRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setErrorMsg("");
      setWakeWordDetected(false);
      isListeningRef.current = true;
      setVoiceState("listening");

      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
      });
    } catch (err) {
      console.error("Speech recognition start error:", err);
      isListeningRef.current = false;
      setErrorMsg("Erro ao iniciar reconhecimento de voz.");
      setVoiceState("error");
      setTimeout(() => { setVoiceState("idle"); setErrorMsg(""); }, 3000);
    }
  }, [voiceState]);

  const stopListening = useCallback(() => {
    if (!isListeningRef.current) return;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (voiceState === "listening") {
      stopListening();
    } else if (voiceState === "idle" || voiceState === "error") {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        ExpoSpeechRecognitionModule.stop();
      }
      stopSpeaking().catch(() => {});
    };
  }, []);

  return {
    voiceState,
    transcript,
    interimTranscript,
    errorMsg,
    wakeWordDetected,
    startListening,
    stopListening,
    toggleListening,
    speak,
  };
}
