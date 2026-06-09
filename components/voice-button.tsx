import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { VoiceState } from "@/hooks/use-voice-assistant";

interface VoiceButtonProps {
  voiceState: VoiceState;
  onPress: () => void;
  size?: number;
}

export function VoiceButton({ voiceState, onPress, size = 64 }: VoiceButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isListening = voiceState === "listening";
  const isProcessing = voiceState === "processing";
  const isSpeaking = voiceState === "speaking";
  const isActive = isListening || isProcessing || isSpeaking;

  useEffect(() => {
    if (isListening) {
      // Pulso rápido ao escutar
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      pulseOpacity.setValue(0.4);
      pulse.start();
      return () => pulse.stop();
    } else if (isSpeaking) {
      // Pulso lento ao falar
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0);
      scaleAnim.setValue(1);
    }
  }, [isListening, isSpeaking]);

  const getButtonColor = () => {
    if (isListening) return "#EF4444"; // vermelho ao escutar
    if (isProcessing) return "#F59E0B"; // amarelo ao processar
    if (isSpeaking) return "#22D3EE"; // ciano ao falar
    return "#1A3A5C"; // azul escuro em repouso
  };

  const getIcon = () => {
    if (isProcessing) return "ellipsis" as const;
    if (isSpeaking) return "speaker.wave.2.fill" as const;
    if (isListening) return "mic.fill" as const;
    return "mic.fill" as const;
  };

  const getLabel = () => {
    if (isListening) return "Ouvindo...";
    if (isProcessing) return "Processando...";
    if (isSpeaking) return "Falando...";
    return "Falar";
  };

  return (
    <View style={styles.container}>
      {/* Anel de pulso */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: size + 24,
            height: size + 24,
            borderRadius: (size + 24) / 2,
            borderColor: getButtonColor(),
            transform: [{ scale: pulseAnim }],
            opacity: pulseOpacity,
          },
        ]}
      />

      {/* Botão principal */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: getButtonColor(),
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={onPress}
        >
          <IconSymbol name={getIcon()} size={size * 0.38} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* Label */}
      <Text style={[styles.label, { color: isActive ? getButtonColor() : "#94A3B8" }]}>
        {getLabel()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 2,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
});
