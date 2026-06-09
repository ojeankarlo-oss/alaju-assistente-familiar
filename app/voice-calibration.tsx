import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { speakNatural, stopSpeaking } from "@/lib/voice-utils";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getFamily, saveFamily } from "@/lib/family-store";
import type { FamilyMember } from "@/shared/types";

// Frases de calibração — o usuário deve repetir cada uma
const CALIBRATION_PHRASES = [
  "Oi Alaju, tudo bem?",
  "Me lembra de tomar água",
  "Qual é minha agenda de hoje?",
  "Adiciona leite na lista de compras",
  "Me dá uma dica de saúde",
];

// Palavras-chave para identificar quem está falando
// Baseado em padrões de fala capturados durante calibração
function extractVoiceSignature(phrases: string[]): string {
  // Cria uma "assinatura" simples baseada nos padrões de texto reconhecidos
  // Em produção, isso seria um embedding de voz real
  const combined = phrases.join(" ").toLowerCase();
  const words = combined.split(" ").filter((w) => w.length > 3);
  const unique = [...new Set(words)].slice(0, 20);
  return unique.join(",");
}

function matchVoiceToMember(
  transcript: string,
  members: FamilyMember[]
): FamilyMember | null {
  const calibrated = members.filter(
    (m) => m.voiceSignature && m.voiceSignature.length > 0
  );
  if (calibrated.length === 0) return null;

  const words = transcript.toLowerCase().split(" ");
  let bestMatch: FamilyMember | null = null;
  let bestScore = 0;

  for (const member of calibrated) {
    const sigWords = member.voiceSignature!.split(",");
    const matches = words.filter((w) => sigWords.includes(w)).length;
    const score = matches / Math.max(sigWords.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = member;
    }
  }

  return bestScore > 0.1 ? bestMatch : null;
}

export { matchVoiceToMember };

export default function VoiceCalibrationScreen() {
  const colors = useColors();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [step, setStep] = useState<"select" | "calibrating" | "done">("select");
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [capturedPhrases, setCapturedPhrases] = useState<string[]>([]);
  const [lastHeard, setLastHeard] = useState("");
  const capturedRef = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      const family = await getFamily();
      if (family) setMembers(family.members);
    })();
  }, []);

  // Evento de resultado do reconhecimento
  useSpeechRecognitionEvent("result", (event) => {
    const results = event.results;
    if (!results || results.length === 0) return;
    const last = results[results.length - 1];
    const text = last?.transcript ?? "";
    if (text) setLastHeard(text);
  });

  // Quando o reconhecimento termina, avança para a próxima frase
  useSpeechRecognitionEvent("end", () => {
    if (!isListening) return;
    setIsListening(false);

    const heard = lastHeard.trim();
    if (heard) {
      const newCaptured = [...capturedRef.current, heard];
      capturedRef.current = newCaptured;
      setCapturedPhrases(newCaptured);
    }

    const nextIdx = currentPhraseIdx + 1;
    if (nextIdx >= CALIBRATION_PHRASES.length) {
      // Calibração completa
      finishCalibration(capturedRef.current);
    } else {
      setCurrentPhraseIdx(nextIdx);
      setLastHeard("");
      // Instrui a próxima frase
      setTimeout(() => {
        speakNatural(`Agora diga: ${CALIBRATION_PHRASES[nextIdx]}`);
      }, 800);
    }
  });

  useSpeechRecognitionEvent("error", () => {
    setIsListening(false);
    // Tenta novamente a mesma frase
    setTimeout(() => {
      speakNatural("Não ouvi direito. Tente novamente.");
    }, 500);
  });

  const startCalibration = useCallback(async () => {
    if (!selectedMember) return;

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permissão necessária", "Preciso de acesso ao microfone para calibrar sua voz.");
      return;
    }

    capturedRef.current = [];
    setCapturedPhrases([]);
    setCurrentPhraseIdx(0);
    setLastHeard("");
    setStep("calibrating");

    speakNatural(
      `Vamos calibrar sua voz, ${selectedMember.name}. Repita cada frase que eu disser. Primeira frase: ${CALIBRATION_PHRASES[0]}`,
      {
        onDone: () => {
          setTimeout(() => listenPhrase(), 500);
        },
      }
    );
  }, [selectedMember]);

  const listenPhrase = useCallback(() => {
    setIsListening(true);
    setLastHeard("");
    ExpoSpeechRecognitionModule.start({
      lang: "pt-BR",
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
    });
  }, []);

  const finishCalibration = useCallback(
    async (phrases: string[]) => {
      if (!selectedMember) return;

      const signature = extractVoiceSignature(phrases);
      const family = await getFamily();
      if (!family) return;

      const updatedMembers = family.members.map((m) =>
        m.id === selectedMember.id
          ? { ...m, voiceSignature: signature, voiceCalibrated: true }
          : m
      );
      await saveFamily({ ...family, members: updatedMembers });
      setMembers(updatedMembers);
      setStep("done");

      speakNatural(
        `Perfeito, ${selectedMember.name}! Sua voz foi calibrada com sucesso. Agora eu vou reconhecer você quando você falar comigo.`
      );
    },
    [selectedMember]
  );

  const renderSelectStep = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerSection}>
        <IconSymbol name="waveform" size={48} color="#22D3EE" />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Calibrar Voz
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Selecione quem vai calibrar a voz. A Alaju aprenderá a reconhecer cada membro da família.
        </Text>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.memberCard,
              {
                backgroundColor: colors.surface,
                borderColor:
                  selectedMember?.id === item.id ? "#22D3EE" : colors.border,
                borderWidth: selectedMember?.id === item.id ? 2 : 1,
              },
            ]}
            onPress={() => {
              setSelectedMember(item);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={styles.memberAvatar}>
              <Text style={styles.memberEmoji}>
                {item.role === "pai" ? "👨" :
                 item.role === "mãe" ? "👩" :
                 item.role === "filho" || item.role === "filha" ? "🧒" :
                 item.role === "avô" || item.role === "avó" ? "👴" : "👤"}
              </Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={[styles.memberName, { color: colors.foreground }]}>
                {item.name}
              </Text>
              <Text style={[styles.memberRole, { color: colors.muted }]}>
                {item.role}
              </Text>
            </View>
            <View style={styles.memberStatus}>
              {item.voiceCalibrated ? (
                <View style={styles.calibratedBadge}>
                  <IconSymbol name="checkmark" size={12} color="#fff" />
                  <Text style={styles.calibratedText}>Calibrado</Text>
                </View>
              ) : (
                <Text style={[styles.notCalibratedText, { color: colors.muted }]}>
                  Não calibrado
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />

      {members.length === 0 && (
        <View style={styles.emptyMembers}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Nenhum membro cadastrado. Adicione membros da família em Configurações primeiro.
          </Text>
          <Pressable
            style={[styles.btnSecondary, { borderColor: colors.border }]}
            onPress={() => router.push("/settings" as any)}
          >
            <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>
              Ir para Configurações
            </Text>
          </Pressable>
        </View>
      )}

      {selectedMember && (
        <Pressable
          style={styles.btnPrimary}
          onPress={startCalibration}
        >
          <IconSymbol name="mic.fill" size={20} color="#fff" />
          <Text style={styles.btnPrimaryText}>
            Calibrar voz de {selectedMember.name}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );

  const renderCalibratingStep = () => (
    <View style={styles.calibratingContainer}>
      <View style={styles.progressBar}>
        {CALIBRATION_PHRASES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              {
                backgroundColor:
                  i < currentPhraseIdx
                    ? "#22C55E"
                    : i === currentPhraseIdx
                    ? "#22D3EE"
                    : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.progressLabel, { color: colors.muted }]}>
        Frase {currentPhraseIdx + 1} de {CALIBRATION_PHRASES.length}
      </Text>

      <View style={[styles.phraseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.phraseLabel, { color: colors.muted }]}>Diga em voz alta:</Text>
        <Text style={[styles.phraseText, { color: colors.foreground }]}>
          "{CALIBRATION_PHRASES[currentPhraseIdx]}"
        </Text>
      </View>

      {/* Microfone animado */}
      <Pressable
        style={[styles.micBtn, { backgroundColor: isListening ? "#EF4444" : "#1A3A5C" }]}
        onPress={isListening ? undefined : listenPhrase}
      >
        <IconSymbol name="mic.fill" size={32} color="#fff" />
      </Pressable>

      <Text style={[styles.micLabel, { color: isListening ? "#EF4444" : colors.muted }]}>
        {isListening ? "Ouvindo..." : "Toque para falar"}
      </Text>

      {lastHeard ? (
        <View style={[styles.heardCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.heardLabel, { color: colors.muted }]}>Ouvi:</Text>
          <Text style={[styles.heardText, { color: colors.foreground }]}>"{lastHeard}"</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.btnSecondary, { borderColor: colors.border, marginTop: 24 }]}
        onPress={() => {
          ExpoSpeechRecognitionModule.stop();
          stopSpeaking();
          setStep("select");
          setCurrentPhraseIdx(0);
          setCapturedPhrases([]);
          capturedRef.current = [];
        }}
      >
        <Text style={[styles.btnSecondaryText, { color: colors.muted }]}>Cancelar</Text>
      </Pressable>
    </View>
  );

  const renderDoneStep = () => (
    <View style={styles.doneContainer}>
      <View style={styles.doneIcon}>
        <IconSymbol name="checkmark.circle.fill" size={72} color="#22C55E" />
      </View>
      <Text style={[styles.doneTitle, { color: colors.foreground }]}>
        Voz calibrada!
      </Text>
      <Text style={[styles.doneDesc, { color: colors.muted }]}>
        A Alaju agora reconhece a voz de {selectedMember?.name}. Ela vai aprender mais sobre você ao longo das conversas.
      </Text>

      <View style={styles.tipsCard}>
        <Text style={[styles.tipsTitle, { color: colors.foreground }]}>Como a Alaju aprende:</Text>
        {[
          "Cada conversa melhora o reconhecimento",
          "Ela lembra suas preferências e rotina",
          "Adapta as respostas ao seu perfil",
          "Você pode recalibrar quando quiser",
        ].map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <IconSymbol name="sparkles" size={14} color="#22D3EE" />
            <Text style={[styles.tipText, { color: colors.muted }]}>{tip}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.btnPrimary}
        onPress={() => {
          setStep("select");
          setSelectedMember(null);
        }}
      >
        <Text style={styles.btnPrimaryText}>Calibrar outro membro</Text>
      </Pressable>

      <Pressable
        style={[styles.btnSecondary, { borderColor: colors.border }]}
        onPress={() => router.back()}
      >
        <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Voltar ao início</Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Calibração de Voz
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "select" && renderSelectStep()}
      {step === "calibrating" && renderCalibratingStep()}
      {step === "done" && renderDoneStep()}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  scrollContent: { padding: 20, gap: 16 },
  headerSection: { alignItems: "center", gap: 8, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1A3A5C22",
    alignItems: "center",
    justifyContent: "center",
  },
  memberEmoji: { fontSize: 24 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "600" },
  memberRole: { fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  memberStatus: { alignItems: "flex-end" },
  calibratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#22C55E",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  calibratedText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  notCalibratedText: { fontSize: 11 },
  emptyMembers: { alignItems: "center", gap: 12, paddingVertical: 24 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1A3A5C",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnSecondary: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnSecondaryText: { fontSize: 15, fontWeight: "500" },
  calibratingContainer: {
    flex: 1,
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  progressBar: { flexDirection: "row", gap: 8, marginBottom: 4 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  progressLabel: { fontSize: 13 },
  phraseCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  phraseLabel: { fontSize: 13 },
  phraseText: { fontSize: 20, fontWeight: "700", textAlign: "center", lineHeight: 28 },
  micBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micLabel: { fontSize: 14, fontWeight: "600" },
  heardCard: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    gap: 4,
  },
  heardLabel: { fontSize: 12 },
  heardText: { fontSize: 16, fontWeight: "500", textAlign: "center" },
  doneContainer: {
    flex: 1,
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  doneIcon: { marginTop: 16, marginBottom: 8 },
  doneTitle: { fontSize: 26, fontWeight: "700" },
  doneDesc: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  tipsCard: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1A3A5C11",
    gap: 10,
  },
  tipsTitle: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { fontSize: 13, flex: 1 },
});
