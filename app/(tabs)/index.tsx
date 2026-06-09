import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { VoiceButton } from "@/components/voice-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useVoiceAssistant } from "@/hooks/use-voice-assistant";
import { useColors } from "@/hooks/use-colors";
import {
  addChatMessage,
  addReminder,
  addShoppingItem,
  createDefaultFamily,
  getActiveShoppingList,
  getChatHistory,
  getFamily,
  getSettings,
  getMemberMemoryContext,
  recordMemberInteraction,
} from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { ChatMessage, FamilyMember } from "@/shared/types";

const QUICK_ACTIONS = [
  { id: "reminder", icon: "bell.fill" as const, label: "Lembrete", color: "#F59E0B", tab: "/reminders" },
  { id: "shopping", icon: "cart.fill" as const, label: "Compras", color: "#22C55E", tab: "/shopping" },
  { id: "health", icon: "heart.fill" as const, label: "Saúde", color: "#EF4444", tab: "/health" },
  { id: "study", icon: "book.fill" as const, label: "Estudos", color: "#8B5CF6", tab: "/study" },
];

function ChatBubble({ msg, memberName }: { msg: ChatMessage; memberName?: string }) {
  const colors = useColors();
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
      {!isUser && (
        <Image
          source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310419663030092336/Dg9rCS6mqHJnEdKLTNr2hB/alaju-avatar-cmDpNksKLQqCob9bJ3No9k.png" }}
          style={styles.botAvatar}
        />
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: "#1A3A5C" }
            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
        ]}
      >
        {!isUser && (
          <Text style={[styles.bubbleName, { color: "#22D3EE" }]}>Alaju</Text>
        )}
        {isUser && memberName && (
          <Text style={[styles.bubbleName, { color: "rgba(255,255,255,0.7)" }]}>{memberName}</Text>
        )}
        <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.foreground }]}>
          {msg.content}
        </Text>
        <Text style={[styles.bubbleTime, { color: isUser ? "rgba(255,255,255,0.6)" : colors.muted }]}>
          {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const chatMutation = trpc.assistant.chat.useMutation();

  // Hook de assistente por voz — referência estável via ref
  const sendMessageRef = useRef<(text: string) => void>(null as any);
  const { voiceState, toggleListening } = useVoiceAssistant(
    useCallback((transcript: string) => {
      if (transcript.trim()) {
        sendMessageRef.current?.(transcript.trim());
      }
    }, [])
  );

  useEffect(() => {
    (async () => {
      // Initialize family if needed
      const family = (await getFamily()) || (await createDefaultFamily());
      const member = family.members.find((m: any) => m.isActive) || family.members[0];
      setActiveMember(member || null);

      const settings = await getSettings();
      setVoiceEnabled(settings.voiceEnabled);

      // Load recent chat history
      const history = await getChatHistory();
      setMessages(history.slice(-30));
    })();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const speakResponse = useCallback(
    (text: string) => {
      if (!voiceEnabled || Platform.OS === "web") return;
      Speech.stop();
      Speech.speak(text, {
        language: "pt-BR",
        rate: 0.95,
        pitch: 1.0,
      });
    },
    [voiceEnabled]
  );

  const handleAction = useCallback(
    async (action: string | null, actionData: Record<string, string>, responseText: string) => {
      if (!action) return;

      if (action === "open_ride_app") {
        const dest = actionData.destination || "";
        const uberUrl = dest
          ? `uber://?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(dest)}`
          : "uber://";
        const supported = await Linking.canOpenURL(uberUrl);
        if (supported) {
          await Linking.openURL(uberUrl);
        } else {
          // Fallback to 99 or web
          const fallback99 = "https://99app.com";
          await Linking.openURL(fallback99);
        }
      } else if (action === "create_reminder") {
        router.push("/(tabs)/reminders" as any);
      } else if (action === "add_shopping") {
        router.push("/(tabs)/shopping" as any);
      } else if (action === "health_log") {
        router.push("/(tabs)/health" as any);
      } else if (action === "study_help") {
        router.push("/(tabs)/study" as any);
      }
    },
    []
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

      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
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
        // Carregar contexto de memória do membro ativo
        const memoryContext = activeMember?.id
          ? await getMemberMemoryContext(activeMember.id)
          : "";

        const result = await chatMutation.mutateAsync({
          message: text.trim(),
          memberName: activeMember?.name,
          memberRole: activeMember?.role,
          context: memoryContext || undefined,
        });

        // Registrar interação para aprendizado
        if (activeMember?.id) {
          await recordMemberInteraction(activeMember.id);
        }

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
        await handleAction(result.action, result.actionData, result.text);
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
    [messages, isLoading, activeMember, chatMutation, speakResponse, handleAction, scrollToBottom]
  );

  const handleSend = useCallback(() => sendMessage(inputText), [sendMessage, inputText]);

  // Conectar ref ao sendMessage para o hook de voz usar
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310419663030092336/Dg9rCS6mqHJnEdKLTNr2hB/alaju-icon-eQ8gwiLL93J285qCdGsNhs.png" }}
            style={styles.famiLogo}
          />
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Alaju</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              {greeting()}{activeMember ? `, ${activeMember.name}` : ""}!
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/avatar-chat" as any)}
          >
            <Image
              source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310419663030092336/Dg9rCS6mqHJnEdKLTNr2hB/alaju-avatar-cmDpNksKLQqCob9bJ3No9k.png" }}
              style={styles.avatarThumb}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/settings" as any)}
          >
            <IconSymbol name="gear" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Quick actions */}
      <View style={[styles.quickActions, { borderBottomColor: colors.border }]}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.id}
            style={({ pressed }) => [
              styles.quickBtn,
              { backgroundColor: action.color + "18", borderColor: action.color + "44" },
              pressed && { opacity: 0.75 },
            ]}
            onPress={() => router.push(action.tab as any)}
          >
            <IconSymbol name={action.icon} size={20} color={action.color} />
            <Text style={[styles.quickLabel, { color: action.color }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Chat area */}
      {messages.length === 0 ? (
        <View style={styles.emptyChat}>
          <Pressable
            style={[styles.emptyAvatarBtn]}
            onPress={() => router.push("/avatar-chat" as any)}
          >
            <Image
              source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310419663030092336/Dg9rCS6mqHJnEdKLTNr2hB/alaju-avatar-cmDpNksKLQqCob9bJ3No9k.png" }}
              style={styles.emptyAvatar}
            />
            <View style={styles.avatarBadge}>
              <IconSymbol name="mic.fill" size={14} color="#fff" />
            </View>
          </Pressable>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Olá! Sou a Alaju 👋
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.muted }]}>
            Sua assistente familiar. Toque no avatar para conversar com voz e imagem, ou escreva abaixo.
          </Text>
          <View style={styles.suggestions}>
            {[
              "Me lembre de tomar remédio às 8h",
              "Adicionar leite na lista de compras",
              "Me dê uma dica de saúde",
              "Chamar um Uber",
            ].map((s) => (
              <Pressable
                key={s}
                style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => sendMessage(s)}
              >
                <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble msg={item} memberName={activeMember?.name} />
          )}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        />
      )}

      {/* Input area */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {isLoading && (
          <View style={styles.typingIndicator}>
            <Text style={[styles.typingText, { color: colors.muted }]}>Alaju está pensando...</Text>
          </View>
        )}
        {/* Botão de voz centralizado acima do input */}
        <View style={styles.voiceBtnRow}>
          <VoiceButton voiceState={voiceState} onPress={toggleListening} size={56} />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            placeholder="Ou escreva aqui..."
            placeholderTextColor={colors.muted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isLoading}
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: isLoading || !inputText.trim() ? colors.muted : "#1A3A5C" },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleSend}
            disabled={isLoading || !inputText.trim()}
          >
            <IconSymbol name="paperplane.fill" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  famiLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarThumb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#22D3EE",
  },
  emptyAvatarBtn: {
    position: "relative",
    marginBottom: 4,
  },
  emptyAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "#22D3EE",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: "#22D3EE",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSub: { fontSize: 12 },
  headerRight: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 8 },
  quickActions: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 0.5,
  },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  quickLabel: { fontSize: 11, fontWeight: "600" },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  suggestions: { width: "100%", gap: 8, marginTop: 8 },
  suggestion: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  suggestionText: { fontSize: 14 },
  chatContent: { padding: 16, gap: 8 },
  bubbleRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowBot: { justifyContent: "flex-start" },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: "#22D3EE",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  bubbleName: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 10, alignSelf: "flex-end", marginTop: 2 },
  inputArea: {
    borderTopWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typingIndicator: { paddingBottom: 6 },
  typingText: { fontSize: 12, fontStyle: "italic" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  voiceBtnRow: {
    alignItems: "center",
    paddingVertical: 8,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
