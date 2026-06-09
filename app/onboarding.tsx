import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { addFamilyMember, markOnboardingDone } from "@/lib/family-store";

const ROLES = [
  { key: "pai", label: "Pai", icon: "person.fill", color: "#1A3A5C" },
  { key: "mãe", label: "Mãe", icon: "person.fill", color: "#C2185B" },
  { key: "filho", label: "Filho", icon: "person.fill", color: "#1565C0" },
  { key: "filha", label: "Filha", icon: "person.fill", color: "#AD1457" },
  { key: "avô", label: "Avô", icon: "person.fill", color: "#4527A0" },
  { key: "avó", label: "Avó", icon: "person.fill", color: "#6A1B9A" },
  { key: "outro", label: "Outro", icon: "person.fill", color: "#37474F" },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];

interface MemberDraft {
  name: string;
  role: RoleKey;
  age: string;
}

const STEPS = ["welcome", "family_name", "add_members", "done"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const colors = useColors();
  const [step, setStep] = useState<Step>("welcome");
  const [familyName, setFamilyName] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState<RoleKey>("pai");
  const [draftAge, setDraftAge] = useState("");
  const [saving, setSaving] = useState(false);

  const addMember = () => {
    if (!draftName.trim()) {
      Alert.alert("Atenção", "Informe o nome do membro.");
      return;
    }
    setMembers((prev) => [
      ...prev,
      { name: draftName.trim(), role: draftRole, age: draftAge.trim() },
    ]);
    setDraftName("");
    setDraftAge("");
    setDraftRole("pai");
    if (Haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const finish = async () => {
    if (members.length === 0) {
      Alert.alert("Atenção", "Adicione pelo menos um membro da família.");
      return;
    }
    setSaving(true);
    try {
      for (const m of members) {
        await addFamilyMember({
          name: m.name,
          role: m.role as any,
          age: m.age ? Number(m.age) : undefined,
          isActive: false,
          preferences: {},
        });
      }
      // Mark onboarding as done
      await markOnboardingDone();
      router.replace("/(tabs)" as any);
    } catch {
      Alert.alert("Erro", "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  // ── Welcome ──────────────────────────────────────────────────────────────────
  if (step === "welcome") {
    return (
      <ScreenContainer className="items-center justify-center px-8">
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.welcomeLogo}
          resizeMode="contain"
        />
        <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
          Olá! Sou a Alaju 👋
        </Text>
        <Text style={[styles.welcomeSub, { color: colors.muted }]}>
          Sua assistente familiar inteligente. Vou ajudar toda a família com lembretes, compras,
          saúde, estudos e muito mais.
        </Text>
        <Text style={[styles.welcomeSub, { color: colors.muted, marginTop: 8 }]}>
          Vamos começar cadastrando sua família para que eu possa te conhecer melhor!
        </Text>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setStep("add_members")}
        >
          <Text style={styles.primaryBtnText}>Começar</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/(tabs)" as any)}>
          <Text style={[styles.skipText, { color: colors.muted }]}>Pular por agora</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  // ── Add Members ──────────────────────────────────────────────────────────────
  if (step === "add_members") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.stepHeader}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Quem é sua família?
            </Text>
            <Text style={[styles.stepSub, { color: colors.muted }]}>
              Adicione os membros para que a Alaju possa reconhecer cada um e personalizar as respostas.
            </Text>
          </View>

          {/* Members list */}
          {members.length > 0 && (
            <View style={[styles.membersList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {members.map((m, i) => {
                const roleInfo = ROLES.find((r) => r.key === m.role);
                return (
                  <View
                    key={i}
                    style={[styles.memberItem, { borderBottomColor: colors.border, borderBottomWidth: i < members.length - 1 ? 0.5 : 0 }]}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: (roleInfo?.color ?? "#1A3A5C") + "22" }]}>
                      <Text style={{ fontSize: 20 }}>
                        {m.role === "pai" || m.role === "avô" || m.role === "filho" ? "👨" :
                         m.role === "mãe" || m.role === "avó" || m.role === "filha" ? "👩" : "🧑"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.foreground }]}>{m.name}</Text>
                      <Text style={[styles.memberRole, { color: colors.muted }]}>
                        {roleInfo?.label}{m.age ? ` · ${m.age} anos` : ""}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeMember(i)} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                      <IconSymbol name="xmark" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* Add form */}
          <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>
              {members.length === 0 ? "Adicionar primeiro membro" : "Adicionar outro membro"}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Nome"
              placeholderTextColor={colors.muted}
              value={draftName}
              onChangeText={setDraftName}
            />
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Idade (opcional)"
              placeholderTextColor={colors.muted}
              value={draftAge}
              onChangeText={setDraftAge}
              keyboardType="numeric"
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Papel na família</Text>
            <View style={styles.rolesGrid}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.key}
                  style={[
                    styles.roleChip,
                    {
                      backgroundColor: draftRole === r.key ? r.color : r.color + "18",
                      borderColor: r.color,
                    },
                  ]}
                  onPress={() => setDraftRole(r.key)}
                >
                  <Text style={[styles.roleChipText, { color: draftRole === r.key ? "#fff" : r.color }]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
              onPress={addMember}
            >
              <IconSymbol name="plus" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Adicionar</Text>
            </Pressable>
          </View>

          {/* Continue */}
          {members.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, { marginTop: 8 }, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
              onPress={finish}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>
                {saving ? "Salvando..." : `Continuar com ${members.length} membro${members.length > 1 ? "s" : ""}`}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.replace("/(tabs)" as any)} style={{ marginTop: 8, alignItems: "center" }}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Pular por agora</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },
  welcomeLogo: { width: 120, height: 120, borderRadius: 28, marginBottom: 24 },
  welcomeTitle: { fontSize: 28, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  welcomeSub: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  primaryBtn: {
    backgroundColor: "#1A3A5C",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: "center",
    marginTop: 32,
    width: "100%",
  },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  skipText: { fontSize: 14, marginTop: 16, textDecorationLine: "underline" },
  stepHeader: { gap: 8, marginBottom: 4 },
  stepTitle: { fontSize: 24, fontWeight: "800" },
  stepSub: { fontSize: 14, lineHeight: 20 },
  membersList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: { fontSize: 15, fontWeight: "600" },
  memberRole: { fontSize: 13, marginTop: 2 },
  addForm: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  formTitle: { fontSize: 16, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: -4 },
  rolesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  roleChipText: { fontSize: 13, fontWeight: "600" },
  addBtn: {
    backgroundColor: "#1A3A5C",
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
