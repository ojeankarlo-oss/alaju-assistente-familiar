import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { addStudySession, getFamily, getStudySessions } from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { FamilyMember, StudySession } from "@/shared/types";

const SUBJECTS = [
  { id: "math", label: "Matemática", icon: "pencil.and.ruler.fill" as const, color: "#2E86C1" },
  { id: "portuguese", label: "Português", icon: "book.fill" as const, color: "#8B5CF6" },
  { id: "science", label: "Ciências", icon: "stethoscope" as const, color: "#22C55E" },
  { id: "history", label: "História", icon: "books.vertical.fill" as const, color: "#F59E0B" },
  { id: "geography", label: "Geografia", icon: "map.fill" as const, color: "#EF4444" },
  { id: "english", label: "Inglês", icon: "bubble.left.fill" as const, color: "#06B6D4" },
];

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function SubjectChip({
  subject,
  selected,
  onPress,
}: {
  subject: (typeof SUBJECTS)[0];
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={[
        styles.subjectChip,
        {
          backgroundColor: selected ? subject.color : colors.surface,
          borderColor: subject.color,
        },
      ]}
      onPress={onPress}
    >
      <IconSymbol name={subject.icon} size={16} color={selected ? "#fff" : subject.color} />
      <Text style={[styles.subjectLabel, { color: selected ? "#fff" : subject.color }]}>
        {subject.label}
      </Text>
    </Pressable>
  );
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const colors = useColors();
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: "#8B5CF6" }]}>
          <Text style={styles.avatarText}>F</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: "#1A3A5C" }
            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
        ]}
      >
        <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.foreground }]}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

export default function StudyScreen() {
  const colors = useColors();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const chatMutation = trpc.assistant.chat.useMutation();

  useEffect(() => {
    (async () => {
      const family = await getFamily();
      const member = family?.members.find((m) => m.isActive) || family?.members[0];
      if (member) setActiveMember(member);
      const sessions = await getStudySessions(member?.id);
      setRecentSessions(sessions.slice(-5).reverse());
    })();
  }, []);

  const handleSelectSubject = useCallback(
    (subjectId: string) => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedSubject(subjectId);
      const subject = SUBJECTS.find((s) => s.id === subjectId);
      const welcome: ChatMsg = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Oi${activeMember ? `, ${activeMember.name}` : ""}! Vamos estudar ${subject?.label}. O que você quer aprender ou tem dúvida? 📚`,
      };
      setMessages([welcome]);
    },
    [activeMember]
  );

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading || !selectedSubject) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const subject = SUBJECTS.find((s) => s.id === selectedSubject);
    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const question = inputText.trim();
    setInputText("");
    setIsLoading(true);

    try {
      const result = await chatMutation.mutateAsync({
        message: `[Matéria: ${subject?.label}] ${question}`,
        memberName: activeMember?.name,
        memberRole: activeMember?.role || "child",
      });

      const assistantMsg: ChatMsg = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.text,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Save session
      await addStudySession({
        memberId: activeMember?.id || "default",
        subject: subject?.label || selectedSubject,
        question,
        answer: result.text,
        createdAt: new Date().toISOString(),
      });

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "Ops! Não consegui responder agora. Tente novamente.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, selectedSubject, activeMember, chatMutation]);

  if (!selectedSubject) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Estudos</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {activeMember ? `Olá, ${activeMember.name}!` : "Escolha uma matéria"}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.subjectGrid} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>Escolha a matéria</Text>
          <View style={styles.subjectList}>
            {SUBJECTS.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.subjectCard, { backgroundColor: colors.surface, borderColor: s.color }]}
                onPress={() => handleSelectSubject(s.id)}
              >
                <View style={[styles.subjectCardIcon, { backgroundColor: s.color + "22" }]}>
                  <IconSymbol name={s.icon} size={28} color={s.color} />
                </View>
                <Text style={[styles.subjectCardLabel, { color: colors.foreground }]}>{s.label}</Text>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>

          {recentSessions.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 24 }]}>
                Últimas dúvidas
              </Text>
              {recentSessions.map((s) => (
                <View
                  key={s.id}
                  style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.sessionSubject, { color: "#8B5CF6" }]}>{s.subject}</Text>
                  <Text style={[styles.sessionQ, { color: colors.foreground }]} numberOfLines={2}>
                    {s.question}
                  </Text>
                  <Text style={[styles.sessionDate, { color: colors.muted }]}>
                    {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
              ))}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  const subject = SUBJECTS.find((s) => s.id === selectedSubject);

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header with subject */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setSelectedSubject(null)} style={styles.backBtn}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={[styles.subjectBadge, { backgroundColor: subject?.color + "22" }]}>
          <IconSymbol name={subject?.icon || "book.fill"} size={18} color={subject?.color || "#1A3A5C"} />
          <Text style={[styles.subjectBadgeText, { color: subject?.color || "#1A3A5C" }]}>
            {subject?.label}
          </Text>
        </View>
      </View>

      {/* Subject chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SUBJECTS.map((s) => (
          <SubjectChip
            key={s.id}
            subject={s}
            selected={s.id === selectedSubject}
            onPress={() => handleSelectSubject(s.id)}
          />
        ))}
      </ScrollView>

      {/* Chat */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble msg={item} />}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="Faça sua pergunta..."
          placeholderTextColor={colors.muted}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isLoading}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: isLoading ? colors.muted : "#1A3A5C" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSend}
          disabled={isLoading}
        >
          <IconSymbol name="paperplane.fill" size={18} color="#fff" />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  headerSub: { fontSize: 13, marginTop: 2 },
  backBtn: { padding: 4 },
  subjectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  subjectBadgeText: { fontSize: 15, fontWeight: "600" },
  subjectGrid: { padding: 16 },
  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  subjectList: { gap: 10 },
  subjectCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 14,
  },
  subjectCardIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subjectCardLabel: { flex: 1, fontSize: 16, fontWeight: "600" },
  sessionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  sessionSubject: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sessionQ: { fontSize: 14, lineHeight: 20 },
  sessionDate: { fontSize: 12 },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  subjectChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  subjectLabel: { fontSize: 13, fontWeight: "600" },
  chatContent: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  inputArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    gap: 10,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
