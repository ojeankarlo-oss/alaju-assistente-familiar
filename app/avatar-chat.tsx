import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  addChatMessage,
  getChatHistory,
  getFamily,
  getSettings,
} from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { ChatMessage, FamilyMember } from "@/shared/types";

const AVATAR_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030092336/Dg9rCS6mqHJnEdKLTNr2hB/alaju-avatar-cmDpNksKLQqCob9bJ3No9k.png";

// Pulsing ring animation for "listening" state
function PulseRing({ active }: { active: boolean }) {
  const scale1 = useRef(new Animated.Value(1)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      scale1.setValue(1);
      scale2.setValue(1);
      opacity1.setValue(0);
      opacity2.setValue(0);
      return;
    }
    const pulse1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale1, { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity1, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale1, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity1, { toValue: 0.35, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    const pulse2 = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.parallel([
          Animated.timing(scale2, { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity2, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale2, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity2, { toValue: 0.35, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    opacity1.setValue(0.35);
    opacity2.setValue(0.35);
    pulse1.start();
    pulse2.start();
    return () => {
      pulse1.stop();
      pulse2.stop();
    };
  }, [active]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[
          styles.pulseRing,
          { transform: [{ scale: scale1 }], opacity: opacity1, borderColor: "#22D3EE" },
        ]}
      />
      <Animated.View
        style={[
          styles.pulseRing,
          { transform: [{ scale: scale2 }], opacity: opacity2, borderColor: "#22D3EE" },
        ]}
      />
    </View>
  );
}

// Waveform animation for "speaking" state
function SpeakingWave({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1.0, 0.7, 0.4, 0.8, 0.5, 0.9, 0.6, 0.4];
  const anims = useRef(bars.map((h) => new Animated.Value(h))).current;

  useEffect(() => {
    if (!active) {
      anims.forEach((a, i) => a.setValue(bars[i]));
      return;
    }
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.8,
            duration: 200 + i * 40,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.8,
            duration: 200 + i * 40,
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [active]);

  return (
    <View style={styles.waveform}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              transform: [{ scaleY: anim }],
              backgroundColor: active ? "#22D3EE" : "#334155",
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function AvatarChatScreen() {
  const colors = useColors();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const chatMutation = trpc.assistant.chat.useMutation();

  useEffect(() => {
    (async () => {
      const family = await getFamily();
      const member = family?.members.find((m) => m.isActive) || family?.members[0] || null;
      setActiveMember(member);
      const settings = await getSettings();
      setVoiceEnabled(settings.voiceEnabled);
      const history = await getChatHistory();
      setMessages(history.slice(-20));
    })();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const speakResponse = useCallback(
    (text: string) => {
      if (!voiceEnabled || Platform.OS === "web") return;
      Speech.stop().catch(() => {});
      setIsSpeaking(true);
      Speech.speak(text, {
        language: "pt-BR",
        rate: 0.95,
        pitch: 1.05,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    },
    [voiceEnabled]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
        memberId: activeMember?.id,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      setIsLoading(true);
      scrollToBottom();

      await addChatMessage({
        role: "user",
        content: text.trim(),
        timestamp: userMsg.timestamp,
        memberId: activeMember?.id,
      });

      try {
        const result = await chatMutation.mutateAsync({
          message: text.trim(),
          memberName: activeMember?.name,
          memberRole: activeMember?.role,
        });

        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.text,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, botMsg]);
        await addChatMessage({
          role: "assistant",
          content: result.text,
          timestamp: botMsg.timestamp,
        });

        speakResponse(result.text);
        scrollToBottom();
      } catch {
        const errMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "Desculpe, não consegui processar sua mensagem. Tente novamente.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, activeMember, chatMutation, speakResponse, scrollToBottom]
  );

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => {
            Speech.stop().catch(() => {});
            router.back();
          }}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Alaju</Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => {
            setVoiceEnabled(!voiceEnabled);
            if (voiceEnabled) Speech.stop().catch(() => {});
          }}
        >
          <IconSymbol
            name={voiceEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill"}
            size={22}
            color={voiceEnabled ? "#22D3EE" : colors.muted}
          />
        </Pressable>
      </View>

      {/* Avatar section */}
      <View style={[styles.avatarSection, { backgroundColor: "#0A1628" }]}>
        <PulseRing active={isLoading} />
        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: AVATAR_URL }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
          {/* Green eyes glow overlay when speaking */}
          {isSpeaking && (
            <View style={styles.speakingOverlay}>
              <View style={styles.eyeGlow} />
            </View>
          )}
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isLoading ? "#F59E0B" : isSpeaking ? "#22D3EE" : "#22C55E" },
            ]}
          />
          <Text style={styles.statusText}>
            {isLoading ? "Pensando..." : isSpeaking ? "Falando..." : "Pronta para ajudar"}
          </Text>
        </View>

        <SpeakingWave active={isSpeaking || isLoading} />

        <Text style={styles.avatarGreeting}>
          {greeting()}{activeMember ? `, ${activeMember.name}` : ""}! Como posso ajudar?
        </Text>
      </View>

      {/* Chat messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.emptyHint}>
            <Text style={[styles.emptyHintText, { color: colors.muted }]}>
              Digite uma mensagem ou use os atalhos abaixo para começar
            </Text>
          </View>
        )}
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <View
              key={msg.id}
              style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}
            >
              <View
                style={[
                  styles.msgBubble,
                  isUser
                    ? { backgroundColor: "#1A3A5C" }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.msgText, { color: isUser ? "#fff" : colors.foreground }]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          );
        })}
        {isLoading && (
          <View style={[styles.msgRow, styles.msgRowBot]}>
            <View style={[styles.msgBubble, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.msgText, { color: colors.muted }]}>...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick suggestions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.suggestions, { borderTopColor: colors.border }]}
        contentContainerStyle={styles.suggestionsContent}
      >
        {[
          "Me lembre de algo",
          "Lista de compras",
          "Dica de saúde",
          "Chamar Uber",
          "Ajuda com lição",
        ].map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => sendMessage(s)}
          >
            <Text style={[styles.chipText, { color: colors.foreground }]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="Fale com a Alaju..."
          placeholderTextColor={colors.muted}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => sendMessage(inputText)}
          returnKeyType="send"
          editable={!isLoading}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: isLoading || !inputText.trim() ? colors.muted : "#22D3EE" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => sendMessage(inputText)}
          disabled={isLoading || !inputText.trim()}
        >
          <IconSymbol name="paperplane.fill" size={18} color="#fff" />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const AVATAR_SIZE = 140;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 10,
  },
  pulseContainer: {
    position: "absolute",
    top: 20,
    alignItems: "center",
    justifyContent: "center",
    width: AVATAR_SIZE + 60,
    height: AVATAR_SIZE + 60,
  },
  pulseRing: {
    position: "absolute",
    width: AVATAR_SIZE + 20,
    height: AVATAR_SIZE + 20,
    borderRadius: (AVATAR_SIZE + 20) / 2,
    borderWidth: 2,
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#22D3EE",
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  speakingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeGlow: {
    width: 60,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(34, 211, 238, 0.15)",
    marginTop: -10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 28,
  },
  waveBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  avatarGreeting: {
    color: "#CBD5E1",
    fontSize: 14,
    textAlign: "center",
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 8,
  },
  emptyHint: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyHintText: {
    fontSize: 13,
    textAlign: "center",
  },
  msgRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowBot: { justifyContent: "flex-start" },
  msgBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 22,
  },
  suggestions: {
    maxHeight: 48,
    borderTopWidth: 0.5,
  },
  suggestionsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13 },
  inputArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
