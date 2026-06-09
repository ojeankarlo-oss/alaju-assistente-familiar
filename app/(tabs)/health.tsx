import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
import { addHealthEntry, getHealthEntries, getFamily } from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { HealthEntry, FamilyMember } from "@/shared/types";

const MOOD_OPTIONS = [
  { value: "great" as const, emoji: "😄", label: "Ótimo" },
  { value: "good" as const, emoji: "🙂", label: "Bem" },
  { value: "ok" as const, emoji: "😐", label: "Ok" },
  { value: "bad" as const, emoji: "😔", label: "Mal" },
];

function MetricCard({
  icon,
  label,
  value,
  unit,
  color,
  target,
}: {
  icon: string;
  label: string;
  value: number;
  unit: string;
  color: string;
  target?: number;
}) {
  const colors = useColors();
  const progress = target ? Math.min((value / target) * 100, 100) : null;
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconSymbol name={icon as any} size={24} color={color} />
      <Text style={[styles.metricValue, { color: colors.foreground }]}>
        {value}
        <Text style={[styles.metricUnit, { color: colors.muted }]}> {unit}</Text>
      </Text>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      {progress !== null && (
        <View style={[styles.metricProgress, { backgroundColor: colors.border }]}>
          <View style={[styles.metricProgressFill, { width: `${progress}%`, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

export default function HealthScreen() {
  const colors = useColors();
  const [todayEntry, setTodayEntry] = useState<Partial<HealthEntry>>({});
  const [steps, setSteps] = useState("");
  const [sleep, setSleep] = useState("");
  const [water, setWater] = useState("");
  const [exercise, setExercise] = useState("");
  const [exerciseType, setExerciseType] = useState("");
  const [mood, setMood] = useState<HealthEntry["mood"]>(undefined);
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [tip, setTip] = useState<string>("");
  const [loadingTip, setLoadingTip] = useState(false);
  const [weekEntries, setWeekEntries] = useState<HealthEntry[]>([]);

  const chatMutation = trpc.assistant.chat.useMutation();

  const load = useCallback(async () => {
    const family = await getFamily();
    const member = family?.members.find((m) => m.isActive) || family?.members[0];
    if (member) setActiveMember(member);

    const entries = await getHealthEntries(member?.id);
    const today = new Date().toISOString().split("T")[0];
    const todayE = entries.find((e) => e.date === today);
    if (todayE) {
      setTodayEntry(todayE);
      setSteps(todayE.steps?.toString() || "");
      setSleep(todayE.sleepHours?.toString() || "");
      setWater(todayE.waterGlasses?.toString() || "");
      setExercise(todayE.exerciseMinutes?.toString() || "");
      setExerciseType(todayE.exerciseType || "");
      setMood(todayE.mood);
    }
    // Last 7 days
    const week = entries.slice(-7);
    setWeekEntries(week);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const today = new Date().toISOString().split("T")[0];
    await addHealthEntry({
      memberId: activeMember?.id || "default",
      date: today,
      steps: steps ? Number(steps) : undefined,
      sleepHours: sleep ? Number(sleep) : undefined,
      waterGlasses: water ? Number(water) : undefined,
      exerciseMinutes: exercise ? Number(exercise) : undefined,
      exerciseType: exerciseType || undefined,
      mood,
    });
    Alert.alert("✅ Salvo!", "Dados de saúde registrados.");
    load();
  }, [activeMember, steps, sleep, water, exercise, exerciseType, mood, load]);

  const handleGetTip = useCallback(async () => {
    setLoadingTip(true);
    try {
      const summary = [
        steps && `${steps} passos`,
        sleep && `${sleep}h de sono`,
        water && `${water} copos de água`,
        exercise && `${exercise} min de ${exerciseType || "exercício"}`,
        mood && `humor: ${mood}`,
      ]
        .filter(Boolean)
        .join(", ");
      const result = await chatMutation.mutateAsync({
        message: `Com base nos meus dados de hoje (${summary || "sem dados ainda"}), me dê uma dica personalizada de saúde e bem-estar em 2-3 frases.`,
        memberName: activeMember?.name,
      });
      setTip(result.text);
    } catch {
      setTip("Não foi possível obter uma dica agora. Tente novamente.");
    } finally {
      setLoadingTip(false);
    }
  }, [steps, sleep, water, exercise, exerciseType, mood, activeMember, chatMutation]);

  const avgSteps = weekEntries.length
    ? Math.round(weekEntries.reduce((s, e) => s + (e.steps || 0), 0) / weekEntries.length)
    : 0;
  const avgSleep = weekEntries.length
    ? (weekEntries.reduce((s, e) => s + (e.sleepHours || 0), 0) / weekEntries.length).toFixed(1)
    : "0";

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Saúde & Rotina</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>

        {/* Weekly summary */}
        <View style={styles.metricsRow}>
          <MetricCard icon="figure.walk" label="Média passos" value={avgSteps} unit="passos" color="#2E86C1" target={8000} />
          <MetricCard icon="moon.fill" label="Média sono" value={Number(avgSleep)} unit="horas" color="#8B5CF6" target={8} />
        </View>

        {/* Today's log */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Registro de Hoje</Text>

          <View style={styles.fieldRow}>
            <IconSymbol name="figure.walk" size={20} color="#2E86C1" />
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Passos"
              placeholderTextColor={colors.muted}
              value={steps}
              onChangeText={setSteps}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldRow}>
            <IconSymbol name="moon.fill" size={20} color="#8B5CF6" />
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Horas de sono"
              placeholderTextColor={colors.muted}
              value={sleep}
              onChangeText={setSleep}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldRow}>
            <IconSymbol name="drop.fill" size={20} color="#22C55E" />
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Copos de água"
              placeholderTextColor={colors.muted}
              value={water}
              onChangeText={setWater}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldRow}>
            <IconSymbol name="flame.fill" size={20} color="#F59E0B" />
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Minutos de exercício"
              placeholderTextColor={colors.muted}
              value={exercise}
              onChangeText={setExercise}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.fieldInputSmall, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Tipo"
              placeholderTextColor={colors.muted}
              value={exerciseType}
              onChangeText={setExerciseType}
            />
          </View>

          {/* Mood */}
          <Text style={[styles.moodLabel, { color: colors.muted }]}>Como você está?</Text>
          <View style={styles.moodRow}>
            {MOOD_OPTIONS.map((m) => (
              <Pressable
                key={m.value}
                style={[
                  styles.moodBtn,
                  { borderColor: colors.border, backgroundColor: mood === m.value ? "#1A3A5C" : colors.background },
                ]}
                onPress={() => setMood(m.value)}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
                <Text style={[styles.moodText, { color: mood === m.value ? "#fff" : colors.muted }]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: "#1A3A5C" },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>Salvar Registro</Text>
          </Pressable>
        </View>

        {/* AI Tip */}
        <View style={[styles.tipSection, { backgroundColor: "#1A3A5C" + "11", borderColor: "#1A3A5C" + "33" }]}>
          <View style={styles.tipHeader}>
            <IconSymbol name="sparkles" size={20} color="#1A3A5C" />
            <Text style={[styles.tipTitle, { color: "#1A3A5C" }]}>Dica Personalizada</Text>
          </View>
          {tip ? (
            <Text style={[styles.tipText, { color: colors.foreground }]}>{tip}</Text>
          ) : (
            <Text style={[styles.tipPlaceholder, { color: colors.muted }]}>
              Registre seus dados e peça uma dica personalizada da Fami.
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.tipBtn,
              { backgroundColor: "#1A3A5C", opacity: loadingTip ? 0.7 : pressed ? 0.85 : 1 },
            ]}
            onPress={handleGetTip}
            disabled={loadingTip}
          >
            <Text style={styles.tipBtnText}>{loadingTip ? "Gerando dica..." : "Pedir dica à Alaju"}</Text>
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  headerSub: { fontSize: 13, marginTop: 2 },
  metricsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    alignItems: "center",
  },
  metricValue: { fontSize: 22, fontWeight: "700" },
  metricUnit: { fontSize: 13, fontWeight: "400" },
  metricLabel: { fontSize: 12 },
  metricProgress: { width: "100%", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  metricProgressFill: { height: "100%", borderRadius: 2 },
  section: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  fieldInputSmall: {
    width: 90,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  moodLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  moodRow: { flexDirection: "row", gap: 8 },
  moodBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  moodEmoji: { fontSize: 20 },
  moodText: { fontSize: 11, fontWeight: "600" },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  tipSection: {
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  tipHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipTitle: { fontSize: 16, fontWeight: "700" },
  tipText: { fontSize: 15, lineHeight: 22 },
  tipPlaceholder: { fontSize: 14, lineHeight: 20 },
  tipBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  tipBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
