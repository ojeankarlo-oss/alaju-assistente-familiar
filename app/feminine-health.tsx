import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getFamily, saveFamily } from "@/lib/family-store";
import {
  PHASE_INFO,
  addCycleEntry,
  calculateAverageCycleLength,
  getCycleEntries,
  getCurrentPhase,
  getUpcomingPeriods,
  toDateString,
} from "@/lib/cycle-store";
import { trpc } from "@/lib/trpc";
import type { CycleEntry, FamilyMember, MenstrualProfile } from "@/shared/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Componente de Fase ───────────────────────────────────────────────────────

function PhaseCard({ profile }: { profile: MenstrualProfile }) {
  const colors = useColors();
  const { phase, dayOfCycle, daysUntilNextPeriod, daysUntilOvulation } = getCurrentPhase(profile);
  const info = PHASE_INFO[phase];

  return (
    <View style={[styles.phaseCard, { backgroundColor: info.color + "18", borderColor: info.color + "44" }]}>
      <View style={styles.phaseHeader}>
        <Text style={styles.phaseEmoji}>{info.emoji}</Text>
        <View style={styles.phaseHeaderText}>
          <Text style={[styles.phaseLabel, { color: info.color }]}>{info.label}</Text>
          {phase !== "unknown" && (
            <Text style={[styles.phaseDay, { color: colors.muted }]}>Dia {dayOfCycle} do ciclo</Text>
          )}
        </View>
      </View>
      <Text style={[styles.phaseDescription, { color: colors.foreground }]}>{info.description}</Text>
      {phase !== "unknown" && (
        <View style={styles.phaseStats}>
          <View style={[styles.phaseStat, { backgroundColor: colors.surface }]}>
            <Text style={[styles.phaseStatValue, { color: info.color }]}>{daysUntilNextPeriod}</Text>
            <Text style={[styles.phaseStatLabel, { color: colors.muted }]}>dias p/ próximo período</Text>
          </View>
          {daysUntilOvulation > 0 && (
            <View style={[styles.phaseStat, { backgroundColor: colors.surface }]}>
              <Text style={[styles.phaseStatValue, { color: "#F59E0B" }]}>{daysUntilOvulation}</Text>
              <Text style={[styles.phaseStatLabel, { color: colors.muted }]}>dias p/ ovulação</Text>
            </View>
          )}
          <View style={[styles.phaseStat, { backgroundColor: colors.surface }]}>
            <Text style={[styles.phaseStatValue, { color: colors.foreground }]}>{info.energy}</Text>
            <Text style={[styles.phaseStatLabel, { color: colors.muted }]}>energia</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Componente de Dicas ──────────────────────────────────────────────────────

function TipsCard({ profile }: { profile: MenstrualProfile }) {
  const colors = useColors();
  const { phase } = getCurrentPhase(profile);
  const info = PHASE_INFO[phase];

  if (phase === "unknown" || info.tips.length === 0) return null;

  return (
    <View style={[styles.tipsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.tipsTitle, { color: colors.foreground }]}>💡 Dicas para esta fase</Text>
      {info.tips.map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <View style={[styles.tipDot, { backgroundColor: info.color }]} />
          <Text style={[styles.tipText, { color: colors.foreground }]}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Componente de Próximos Períodos ─────────────────────────────────────────

function UpcomingCard({ profile }: { profile: MenstrualProfile }) {
  const colors = useColors();
  const upcoming = getUpcomingPeriods(profile, 3);

  if (upcoming.length === 0) return null;

  return (
    <View style={[styles.upcomingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.tipsTitle, { color: colors.foreground }]}>📅 Próximos períodos previstos</Text>
      <View style={styles.upcomingRow}>
        {upcoming.map((date, i) => (
          <View key={i} style={[styles.upcomingItem, { backgroundColor: "#E879A022", borderColor: "#E879A044" }]}>
            <Text style={[styles.upcomingLabel, { color: colors.muted }]}>
              {i === 0 ? "Próximo" : `+${i} ciclo${i > 1 ? "s" : ""}`}
            </Text>
            <Text style={[styles.upcomingDate, { color: "#E879A0" }]}>{formatDateShort(date)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Tela Principal ───────────────────────────────────────────────────────────

export default function FeminineHealthScreen() {
  const colors = useColors();
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [cycleEntries, setCycleEntries] = useState<CycleEntry[]>([]);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [aiTip, setAiTip] = useState("");
  const [loadingTip, setLoadingTip] = useState(false);

  // Setup modal state
  const [setupCycleLen, setSetupCycleLen] = useState("28");
  const [setupPeriodLen, setSetupPeriodLen] = useState("5");
  const [setupLastDate, setSetupLastDate] = useState(toDateString(new Date()));

  // Log modal state
  const [logFlow, setLogFlow] = useState<"light" | "medium" | "heavy">("medium");
  const [logMood, setLogMood] = useState<CycleEntry["mood"]>("ok");
  const [logSymptoms, setLogSymptoms] = useState<string[]>([]);
  const [logNotes, setLogNotes] = useState("");

  const chatMutation = trpc.assistant.chat.useMutation();

  const load = useCallback(async () => {
    const family = await getFamily();
    if (!family) return;
    const active = family.members.find((m) => m.isActive) || family.members[0];
    if (active) {
      setMember(active);
      const entries = await getCycleEntries(active.id);
      setCycleEntries(entries);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const menstrualProfile: MenstrualProfile = member?.menstrualProfile ?? {
    averageCycleLength: 28,
    averagePeriodLength: 5,
    trackingEnabled: false,
  };

  const isConfigured = menstrualProfile.trackingEnabled && !!menstrualProfile.lastPeriodStart;

  const handleSaveSetup = useCallback(async () => {
    if (!member) return;
    const family = await getFamily();
    if (!family) return;

    const cycleLen = parseInt(setupCycleLen) || 28;
    const periodLen = parseInt(setupPeriodLen) || 5;

    const updatedProfile: MenstrualProfile = {
      averageCycleLength: Math.max(21, Math.min(35, cycleLen)),
      averagePeriodLength: Math.max(2, Math.min(10, periodLen)),
      lastPeriodStart: setupLastDate,
      trackingEnabled: true,
    };

    const updatedMembers = family.members.map((m) =>
      m.id === member.id ? { ...m, menstrualProfile: updatedProfile } : m
    );
    await saveFamily({ ...family, members: updatedMembers });
    setShowSetupModal(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }, [member, setupCycleLen, setupPeriodLen, setupLastDate, load]);

  const handleLogPeriod = useCallback(async () => {
    if (!member) return;
    const today = toDateString(new Date());
    const entry: CycleEntry = {
      id: Date.now().toString(),
      memberId: member.id,
      startDate: today,
      flow: logFlow,
      mood: logMood,
      symptoms: logSymptoms,
      notes: logNotes,
    };
    await addCycleEntry(entry);

    // Atualizar lastPeriodStart no perfil
    const family = await getFamily();
    if (family) {
      const entries = await getCycleEntries(member.id);
      const avgCycle = calculateAverageCycleLength(entries);
      const updatedProfile: MenstrualProfile = {
        ...menstrualProfile,
        lastPeriodStart: today,
        averageCycleLength: avgCycle,
        trackingEnabled: true,
      };
      const updatedMembers = family.members.map((m) =>
        m.id === member.id ? { ...m, menstrualProfile: updatedProfile } : m
      );
      await saveFamily({ ...family, members: updatedMembers });
    }

    setLogFlow("medium");
    setLogMood("ok");
    setLogSymptoms([]);
    setLogNotes("");
    setShowLogModal(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }, [member, logFlow, logMood, logSymptoms, logNotes, menstrualProfile, load]);

  const handleGetAiTip = useCallback(async () => {
    if (!member || !isConfigured) return;
    setLoadingTip(true);
    try {
      const { phase } = getCurrentPhase(menstrualProfile);
      const info = PHASE_INFO[phase];
      const result = await chatMutation.mutateAsync({
        message: `Estou na fase ${info.label} do meu ciclo menstrual (${info.description}). Me dê uma dica personalizada de bem-estar, alimentação ou autocuidado para hoje. Seja carinhosa, prática e breve.`,
        memberName: member.name,
        memberRole: member.role,
      });
      setAiTip(result.text);
    } catch {
      setAiTip("Não consegui gerar uma dica agora. Tente novamente em instantes.");
    } finally {
      setLoadingTip(false);
    }
  }, [member, isConfigured, menstrualProfile, chatMutation]);

  const toggleSymptom = (symptom: string) => {
    setLogSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const SYMPTOMS = ["Cólica", "Inchaço", "Dor de cabeça", "Náusea", "Fadiga", "Irritabilidade", "Acne", "Sensibilidade nos seios"];
  const MOODS: Array<{ value: CycleEntry["mood"]; label: string; emoji: string }> = [
    { value: "great", label: "Ótima", emoji: "😄" },
    { value: "good", label: "Bem", emoji: "🙂" },
    { value: "ok", label: "Ok", emoji: "😐" },
    { value: "bad", label: "Mal", emoji: "😔" },
    { value: "irritable", label: "Irritada", emoji: "😤" },
    { value: "anxious", label: "Ansiosa", emoji: "😰" },
  ];

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Saúde Feminina</Text>
        <Pressable
          style={({ pressed }) => [styles.setupBtn, { backgroundColor: "#E879A0" }, pressed && { opacity: 0.8 }]}
          onPress={() => setShowSetupModal(true)}
        >
          <IconSymbol name="gear" size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Saudação */}
        <View style={styles.greetingRow}>
          <Text style={styles.greetingEmoji}>🌸</Text>
          <View>
            <Text style={[styles.greetingTitle, { color: colors.foreground }]}>
              Olá, {member?.name || ""}!
            </Text>
            <Text style={[styles.greetingSubtitle, { color: colors.muted }]}>
              {isConfigured ? "Acompanhe seu ciclo abaixo" : "Configure seu ciclo para começar"}
            </Text>
          </View>
        </View>

        {/* Fase atual */}
        <PhaseCard profile={menstrualProfile} />

        {/* Botões de ação */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: "#E879A0" }, pressed && { opacity: 0.85 }]}
            onPress={() => setShowLogModal(true)}
          >
            <Text style={styles.actionBtnText}>🩸 Registrar período</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: "#A78BFA" }, pressed && { opacity: 0.85 }]}
            onPress={handleGetAiTip}
          >
            <Text style={styles.actionBtnText}>✨ Dica da Alaju</Text>
          </Pressable>
        </View>

        {/* Dica da Alaju */}
        {(aiTip || loadingTip) && (
          <View style={[styles.aiTipCard, { backgroundColor: "#A78BFA18", borderColor: "#A78BFA44" }]}>
            <Text style={[styles.aiTipTitle, { color: "#A78BFA" }]}>💜 Alaju diz:</Text>
            <Text style={[styles.aiTipText, { color: colors.foreground }]}>
              {loadingTip ? "Gerando dica personalizada..." : aiTip}
            </Text>
          </View>
        )}

        {/* Dicas da fase */}
        <TipsCard profile={menstrualProfile} />

        {/* Próximos períodos */}
        {isConfigured && <UpcomingCard profile={menstrualProfile} />}

        {/* Histórico */}
        {cycleEntries.length > 0 && (
          <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.tipsTitle, { color: colors.foreground }]}>📋 Histórico recente</Text>
            {cycleEntries.slice(0, 5).map((entry) => (
              <View key={entry.id} style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.historyDot, { backgroundColor: "#E879A0" }]} />
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyDate, { color: colors.foreground }]}>
                    {formatDate(entry.startDate)}
                  </Text>
                  {entry.flow && (
                    <Text style={[styles.historyMeta, { color: colors.muted }]}>
                      Fluxo: {entry.flow === "light" ? "Leve" : entry.flow === "medium" ? "Moderado" : "Intenso"}
                      {entry.mood ? ` · ${MOODS.find((m) => m.value === entry.mood)?.emoji}` : ""}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Configurar ciclo (se não configurado) */}
        {!isConfigured && (
          <Pressable
            style={({ pressed }) => [styles.setupCta, { backgroundColor: "#E879A0" }, pressed && { opacity: 0.85 }]}
            onPress={() => setShowSetupModal(true)}
          >
            <Text style={styles.setupCtaText}>Configurar meu ciclo agora</Text>
          </Pressable>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Modal de Configuração */}
      <Modal visible={showSetupModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>⚙️ Configurar Ciclo</Text>
              <Pressable onPress={() => setShowSetupModal(false)}>
                <IconSymbol name="xmark" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Duração média do ciclo (dias)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              value={setupCycleLen}
              onChangeText={setSetupCycleLen}
              keyboardType="numeric"
              placeholder="28"
              placeholderTextColor={colors.muted}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Duração média do período (dias)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              value={setupPeriodLen}
              onChangeText={setSetupPeriodLen}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={colors.muted}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Data do último período (AAAA-MM-DD)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              value={setupLastDate}
              onChangeText={setSetupLastDate}
              placeholder="2025-06-01"
              placeholderTextColor={colors.muted}
            />

            <Pressable
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: "#E879A0" }, pressed && { opacity: 0.85 }]}
              onPress={handleSaveSetup}
            >
              <Text style={styles.saveBtnText}>Salvar configuração</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal de Registro de Período */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>🩸 Registrar Período</Text>
                <Pressable onPress={() => setShowLogModal(false)}>
                  <IconSymbol name="xmark" size={22} color={colors.muted} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Intensidade do fluxo</Text>
              <View style={styles.flowRow}>
                {(["light", "medium", "heavy"] as const).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.flowOption, logFlow === f && styles.flowOptionActive]}
                    onPress={() => setLogFlow(f)}
                  >
                    <Text style={[styles.flowOptionText, { color: logFlow === f ? "#fff" : "#E879A0" }]}>
                      {f === "light" ? "Leve" : f === "medium" ? "Moderado" : "Intenso"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Como você está se sentindo?</Text>
              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m.value}
                    style={[styles.moodOption, logMood === m.value && { backgroundColor: "#E879A022", borderColor: "#E879A0" }]}
                    onPress={() => setLogMood(m.value)}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, { color: colors.muted }]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Sintomas (opcional)</Text>
              <View style={styles.symptomsGrid}>
                {SYMPTOMS.map((s) => (
                  <Pressable
                    key={s}
                    style={[
                      styles.symptomChip,
                      { borderColor: colors.border },
                      logSymptoms.includes(s) && { backgroundColor: "#E879A022", borderColor: "#E879A0" },
                    ]}
                    onPress={() => toggleSymptom(s)}
                  >
                    <Text style={[styles.symptomText, { color: logSymptoms.includes(s) ? "#E879A0" : colors.muted }]}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Observações (opcional)</Text>
              <TextInput
                style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
                value={logNotes}
                onChangeText={setLogNotes}
                placeholder="Como foi seu dia..."
                placeholderTextColor={colors.muted}
                multiline
              />

              <Pressable
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: "#E879A0" }, pressed && { opacity: 0.85 }]}
                onPress={handleLogPeriod}
              >
                <Text style={styles.saveBtnText}>Registrar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700" },
  setupBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 16, gap: 16 },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  greetingEmoji: { fontSize: 36 },
  greetingTitle: { fontSize: 22, fontWeight: "700" },
  greetingSubtitle: { fontSize: 14, marginTop: 2 },
  phaseCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10 },
  phaseHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  phaseEmoji: { fontSize: 32 },
  phaseHeaderText: { flex: 1 },
  phaseLabel: { fontSize: 18, fontWeight: "700" },
  phaseDay: { fontSize: 13, marginTop: 2 },
  phaseDescription: { fontSize: 14, lineHeight: 20 },
  phaseStats: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  phaseStat: { flex: 1, minWidth: 80, borderRadius: 10, padding: 10, alignItems: "center", gap: 2 },
  phaseStatValue: { fontSize: 20, fontWeight: "700" },
  phaseStatLabel: { fontSize: 11, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  aiTipCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  aiTipTitle: { fontSize: 15, fontWeight: "700" },
  aiTipText: { fontSize: 14, lineHeight: 22 },
  tipsCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  tipsTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
  upcomingCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  upcomingRow: { flexDirection: "row", gap: 8 },
  upcomingItem: { flex: 1, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, gap: 4 },
  upcomingLabel: { fontSize: 11 },
  upcomingDate: { fontSize: 14, fontWeight: "700" },
  historyCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 0.5 },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historyDate: { fontSize: 14, fontWeight: "600" },
  historyMeta: { fontSize: 12, marginTop: 2 },
  setupCta: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  setupCtaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  notesInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, minHeight: 80, textAlignVertical: "top" },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  flowRow: { flexDirection: "row", gap: 8 },
  flowOption: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#E879A0" },
  flowOptionActive: { backgroundColor: "#E879A0" },
  flowOptionText: { fontWeight: "600", fontSize: 14 },
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  moodOption: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", borderWidth: 1, borderColor: "transparent", gap: 2 },
  moodEmoji: { fontSize: 22 },
  moodLabel: { fontSize: 11 },
  symptomsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomChip: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  symptomText: { fontSize: 13 },
});
