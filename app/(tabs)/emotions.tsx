import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getFamily, createDefaultFamily } from "@/lib/family-store";
import type { FamilyMember } from "@/shared/types";

const FAMILY_ID = "alaju_family";

const MOODS = [
  { emoji: "😄", label: "Feliz" },
  { emoji: "😊", label: "Bem" },
  { emoji: "😐", label: "Normal" },
  { emoji: "😔", label: "Triste" },
  { emoji: "😤", label: "Irritado" },
  { emoji: "😴", label: "Cansado" },
  { emoji: "🤒", label: "Doente" },
  { emoji: "😰", label: "Ansioso" },
  { emoji: "🥰", label: "Apaixonado" },
  { emoji: "🤩", label: "Animado" },
  { emoji: "😌", label: "Relaxado" },
  { emoji: "🤔", label: "Pensativo" },
];

interface EmotionEntry {
  member_id: string;
  member_name: string;
  emoji: string;
  mood: string;
  note?: string;
  created_at?: string;
}

export default function EmotionsScreen() {
  const colors = useColors();
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [familyEmotions, setFamilyEmotions] = useState<EmotionEntry[]>([]);
  const [selectedMood, setSelectedMood] = useState<{ emoji: string; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setEmotionMutation = trpc.emotions.setEmotion.useMutation();
  const familyEmotionsQuery = trpc.emotions.getFamilyEmotions.useQuery(
    { familyId: FAMILY_ID },
    { refetchInterval: 30000 } // Atualizar a cada 30 segundos
  );

  useEffect(() => {
    (async () => {
      const family = (await getFamily()) || (await createDefaultFamily());
      const member = family.members.find((m: FamilyMember) => m.isActive) || family.members[0];
      setActiveMember(member || null);
    })();
  }, []);

  useEffect(() => {
    if (familyEmotionsQuery.data?.emotions) {
      setFamilyEmotions(familyEmotionsQuery.data.emotions as EmotionEntry[]);
    }
  }, [familyEmotionsQuery.data]);

  const handleSaveEmotion = useCallback(async () => {
    if (!selectedMood || !activeMember) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setSaving(true);
    try {
      await setEmotionMutation.mutateAsync({
        familyId: FAMILY_ID,
        memberId: activeMember.id,
        memberName: activeMember.name,
        emoji: selectedMood.emoji,
        mood: selectedMood.label,
        note: note.trim() || undefined,
      });
      setSaved(true);
      setNote("");
      familyEmotionsQuery.refetch();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[Emoções] Erro ao salvar:", err);
    } finally {
      setSaving(false);
    }
  }, [selectedMood, activeMember, note, setEmotionMutation, familyEmotionsQuery]);

  const formatTime = (isoDate?: string) => {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}min atrás`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h atrás`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>💬 Como estamos?</Text>
        <Text style={[styles.headerSub, { color: colors.muted }]}>
          Compartilhe seu humor com a família
        </Text>
      </View>

      <FlatList
        data={[{ key: "content" }]}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        renderItem={() => (
          <View style={styles.content}>
            {/* Seletor de humor */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {activeMember ? `Como você está, ${activeMember.name}?` : "Como você está?"}
              </Text>

              <View style={styles.moodsGrid}>
                {MOODS.map((mood) => {
                  const isSelected = selectedMood?.label === mood.label;
                  return (
                    <Pressable
                      key={mood.label}
                      style={({ pressed }) => [
                        styles.moodBtn,
                        {
                          backgroundColor: isSelected ? "#1A3A5C" : colors.background,
                          borderColor: isSelected ? "#22D3EE" : colors.border,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => {
                        setSelectedMood(mood);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                      <Text style={[styles.moodLabel, { color: isSelected ? "#fff" : colors.muted }]}>
                        {mood.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedMood && (
                <>
                  <TextInput
                    style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Adicionar nota (opcional)..."
                    placeholderTextColor={colors.muted}
                    value={note}
                    onChangeText={setNote}
                    maxLength={200}
                    multiline
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveBtn,
                      { backgroundColor: saved ? "#22C55E" : "#1A3A5C" },
                      pressed && { opacity: 0.8 },
                      saving && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveEmotion}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>
                        {saved ? "✅ Compartilhado!" : `Compartilhar ${selectedMood.emoji}`}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            {/* Feed de emoções da família */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.feedHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  🏠 Família agora
                </Text>
                <Pressable
                  onPress={() => familyEmotionsQuery.refetch()}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.refreshBtn, { color: "#22D3EE" }]}>Atualizar</Text>
                </Pressable>
              </View>

              {familyEmotionsQuery.isLoading ? (
                <ActivityIndicator color="#22D3EE" style={{ marginVertical: 20 }} />
              ) : familyEmotions.length === 0 ? (
                <View style={styles.emptyFeed}>
                  <Text style={styles.emptyEmoji}>🤗</Text>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    Nenhum membro compartilhou ainda.{"\n"}Seja o primeiro!
                  </Text>
                </View>
              ) : (
                <View style={styles.emotionsList}>
                  {familyEmotions.map((emotion, idx) => (
                    <View
                      key={`${emotion.member_id}-${idx}`}
                      style={[styles.emotionRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={[styles.emotionAvatar, { backgroundColor: "#1A3A5C22" }]}>
                        <Text style={styles.emotionAvatarText}>
                          {emotion.member_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.emotionInfo}>
                        <View style={styles.emotionTopRow}>
                          <Text style={[styles.emotionName, { color: colors.foreground }]}>
                            {emotion.member_name}
                          </Text>
                          <Text style={[styles.emotionTime, { color: colors.muted }]}>
                            {formatTime(emotion.created_at)}
                          </Text>
                        </View>
                        <View style={styles.emotionMoodRow}>
                          <Text style={styles.emotionEmoji}>{emotion.emoji}</Text>
                          <Text style={[styles.emotionMood, { color: colors.muted }]}>
                            {emotion.mood}
                          </Text>
                        </View>
                        {emotion.note ? (
                          <Text style={[styles.emotionNote, { color: colors.foreground }]}>
                            "{emotion.note}"
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Dica da Alaju */}
            <View style={[styles.tipCard, { backgroundColor: "#1A3A5C15", borderColor: "#22D3EE33" }]}>
              <Text style={styles.tipEmoji}>💡</Text>
              <Text style={[styles.tipText, { color: colors.muted }]}>
                Compartilhar como você está ajuda a Alaju a personalizar as respostas e mantém a família conectada emocionalmente.
              </Text>
            </View>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  moodsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodBtn: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  moodEmoji: {
    fontSize: 22,
  },
  moodLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  saveBtn: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refreshBtn: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyFeed: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emotionsList: {
    gap: 0,
  },
  emotionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  emotionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emotionAvatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A3A5C",
  },
  emotionInfo: {
    flex: 1,
    gap: 4,
  },
  emotionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emotionName: {
    fontSize: 14,
    fontWeight: "600",
  },
  emotionTime: {
    fontSize: 11,
  },
  emotionMoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emotionEmoji: {
    fontSize: 20,
  },
  emotionMood: {
    fontSize: 13,
  },
  emotionNote: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
  tipCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  tipEmoji: {
    fontSize: 18,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
