import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Speech from "expo-speech";
import { trpc } from "@/lib/trpc";

export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

// Frases de resposta ao ser acionada
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
  const [errorMsg, setErrorMsg] = useState("");
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const isRecordingRef = useRef(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const transcribeMutation = trpc.assistant.transcribe.useMutation();

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (Platform.OS === "web") {
      onDone?.();
      return;
    }
    Speech.stop();
    setVoiceState("speaking");
    Speech.speak(text, {
      language: "pt-BR",
      rate: 0.95,
      pitch: 1.05,
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

  const stopListening = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    try {
      setVoiceState("processing");
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri) {
        setVoiceState("idle");
        return;
      }

      // Transcrever o áudio via backend
      const result = await transcribeMutation.mutateAsync({ audioUrl: uri });
      const text = result.text?.trim() || "";
      setTranscript(text);

      if (!text) {
        setVoiceState("idle");
        return;
      }

      // Verificar se contém wake word
      if (containsWakeWord(text)) {
        setWakeWordDetected(true);
        const response = getWakeResponse();
        speak(response, () => {
          setWakeWordDetected(false);
        });
        // Notificar com o texto completo para o chat processar
        onTranscript?.(text);
      } else {
        // Comando direto sem wake word — passa direto para o chat
        onTranscript?.(text);
        setVoiceState("idle");
      }
    } catch (err) {
      console.error("Voice error:", err);
      setErrorMsg("Não consegui entender. Tente novamente.");
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2000);
    }
  }, [audioRecorder, transcribeMutation, speak, onTranscript]);

  const startListening = useCallback(async () => {
    if (isRecordingRef.current || voiceState === "speaking") return;

    try {
      // Solicitar permissão de microfone
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorMsg("Permissão de microfone negada.");
        setVoiceState("error");
        setTimeout(() => setVoiceState("idle"), 2000);
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      isRecordingRef.current = true;
      setVoiceState("listening");
      setTranscript("");
      setErrorMsg("");
      setWakeWordDetected(false);

      // Auto-parar após 8 segundos para evitar gravações infinitas
      setTimeout(() => {
        if (isRecordingRef.current) {
          stopListening();
        }
      }, 8000);
    } catch (err) {
      console.error("Start recording error:", err);
      setErrorMsg("Erro ao acessar o microfone.");
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2000);
    }
  }, [audioRecorder, voiceState, stopListening]);

  const toggleListening = useCallback(() => {
    if (voiceState === "listening") {
      stopListening();
    } else if (voiceState === "idle" || voiceState === "error") {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  return {
    voiceState,
    transcript,
    errorMsg,
    wakeWordDetected,
    isRecording: recorderState.isRecording,
    startListening,
    stopListening,
    toggleListening,
    speak,
  };
}
