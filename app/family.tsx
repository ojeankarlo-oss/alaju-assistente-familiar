import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  addFamilyMember,
  createDefaultFamily,
  deleteFamilyMember,
  getFamily,
  saveFamily,
  updateFamilyMember,
} from "@/lib/family-store";
import type { FamilyMember, FamilyProfile } from "@/shared/types";

const ROLE_COLORS: Record<string, string> = {
  adult: "#1A3A5C",
  child: "#8B5CF6",
  pai: "#1A3A5C",
  mãe: "#E879A0",
  filho: "#8B5CF6",
  filha: "#A855F7",
  avô: "#059669",
  avó: "#0891B2",
  outro: "#6B7280",
};
const ROLE_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  pai: "Pai",
  mãe: "Mãe",
  filho: "Filho",
  filha: "Filha",
  avô: "Avô",
  avó: "Avó",
  outro: "Outro",
};

function MemberCard({
  member,
  onSetActive,
  onDelete,
  onPhotoChange,
}: {
  member: FamilyMember;
  onSetActive: () => void;
  onDelete: () => void;
  onPhotoChange: (memberId: string, uri: string | null) => void;
}) {
  const colors = useColors();

  const handlePickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onPhotoChange(member.id, result.assets[0].uri);
    }
  }, [member.id, onPhotoChange]);

  return (
    <View
      style={[
        styles.memberCard,
        {
          backgroundColor: colors.surface,
          borderColor: member.isActive ? ROLE_COLORS[member.role] : colors.border,
          borderWidth: member.isActive ? 2 : 1,
        },
      ]}
    >
      <Pressable
        style={[styles.memberAvatar, { backgroundColor: ROLE_COLORS[member.role] + "22" }]}
        onPress={handlePickPhoto}
      >
        {member.photoUri ? (
          <Image
            source={{ uri: member.photoUri }}
            style={styles.memberPhoto}
          />
        ) : (
          <IconSymbol
            name={member.role === "child" ? "person.fill" : "person.circle.fill"}
            size={28}
            color={ROLE_COLORS[member.role]}
          />
        )}
        <View style={[styles.photoEditBadge, { backgroundColor: ROLE_COLORS[member.role] }]}>
          <IconSymbol name="pencil" size={8} color="#fff" />
        </View>
      </Pressable>
      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
          {member.isActive && (
            <View style={[styles.activeBadge, { backgroundColor: "#22C55E22" }]}>
              <Text style={styles.activeBadgeText}>Ativo</Text>
            </View>
          )}
        </View>
        <View style={styles.memberMeta}>
          <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + "22" }]}>
            <Text style={[styles.roleText, { color: ROLE_COLORS[member.role] }]}>
              {ROLE_LABELS[member.role]}
            </Text>
          </View>
          {member.age && (
            <Text style={[styles.memberAge, { color: colors.muted }]}>{member.age} anos</Text>
          )}
        </View>
      </View>
      <View style={styles.memberActions}>
        {!member.isActive && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
            onPress={onSetActive}
          >
            <IconSymbol name="checkmark.circle.fill" size={22} color="#22C55E" />
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          onPress={onDelete}
        >
          <IconSymbol name="trash" size={20} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

export default function FamilyScreen() {
  const colors = useColors();
  const [profile, setProfile] = useState<FamilyProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"adult" | "child">("adult");
  const [age, setAge] = useState("");

  const load = useCallback(async () => {
    const p = (await getFamily()) || (await createDefaultFamily());
    setProfile(p);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddMember = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Atenção", "Informe o nome do membro.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addFamilyMember({
      name: name.trim(),
      role,
      age: age ? Number(age) : undefined,
      isActive: false,
    });
    setName("");
    setAge("");
    setRole("adult");
    setShowModal(false);
    load();
  }, [name, role, age, load]);

  const handleSetActive = useCallback(
    async (memberId: string) => {
      if (!profile) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const updated = {
        ...profile,
        members: profile.members.map((m) => ({ ...m, isActive: m.id === memberId })),
      };
      await saveFamily(updated);
      load();
    },
    [profile, load]
  );

  const handlePhotoChange = useCallback(
    async (memberId: string, uri: string | null) => {
      if (!profile) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = {
        ...profile,
        members: profile.members.map((m) =>
          m.id === memberId ? { ...m, photoUri: uri ?? undefined } : m
        ),
      };
      await saveFamily(updated);
      load();
    },
    [profile, load]
  );

  const handleDelete = useCallback(
    async (memberId: string) => {
      const member = profile?.members.find((m) => m.id === memberId);
      if (member?.isActive) {
        Alert.alert("Atenção", "Não é possível excluir o perfil ativo. Ative outro primeiro.");
        return;
      }
      Alert.alert("Excluir membro", `Excluir ${member?.name}?`, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteFamilyMember(memberId);
            load();
          },
        },
      ]);
    },
    [profile, load]
  );

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Família</Text>
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: "#1A3A5C" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => setShowModal(true)}
        >
          <IconSymbol name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Family name */}
      {profile && (
        <View style={[styles.familyBanner, { backgroundColor: "#1A3A5C11", borderColor: "#1A3A5C33" }]}>
          <IconSymbol name="house.fill" size={20} color="#1A3A5C" />
          <Text style={[styles.familyName, { color: "#1A3A5C" }]}>{profile.name}</Text>
          <Text style={[styles.memberCount, { color: "#1A3A5C" }]}>
            {profile.members.length} membro{profile.members.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      <FlatList
        data={profile?.members || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberCard
            member={item}
            onSetActive={() => handleSetActive(item.id)}
            onDelete={() => handleDelete(item.id)}
            onPhotoChange={handlePhotoChange}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="person.2.fill" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum membro</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Add member modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Novo Membro</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <IconSymbol name="xmark" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Nome"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Tipo</Text>
            <View style={styles.roleRow}>
              {(["adult", "child"] as const).map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.roleOption,
                    {
                      backgroundColor: role === r ? ROLE_COLORS[r] : ROLE_COLORS[r] + "22",
                      borderColor: ROLE_COLORS[r],
                    },
                  ]}
                  onPress={() => setRole(r)}
                >
                  <IconSymbol
                    name={r === "child" ? "person.fill" : "person.circle.fill"}
                    size={18}
                    color={role === r ? "#fff" : ROLE_COLORS[r]}
                  />
                  <Text style={[styles.roleOptionText, { color: role === r ? "#fff" : ROLE_COLORS[r] }]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Idade (opcional)"
              placeholderTextColor={colors.muted}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
            />

            <Pressable
              style={({ pressed }) => [
                styles.createBtn,
                { backgroundColor: "#1A3A5C" },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleAddMember}
            >
              <Text style={styles.createBtnText}>Adicionar Membro</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700" },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  familyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  familyName: { flex: 1, fontSize: 16, fontWeight: "700" },
  memberCount: { fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" },
  memberPhoto: { width: 48, height: 48, borderRadius: 24 },
  photoEditBadge: { position: "absolute", bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  memberInfo: { flex: 1, gap: 6 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 16, fontWeight: "600" },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  activeBadgeText: { fontSize: 11, fontWeight: "700", color: "#22C55E" },
  memberMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleText: { fontSize: 12, fontWeight: "600" },
  memberAge: { fontSize: 12 },
  memberActions: { flexDirection: "row", gap: 4 },
  actionBtn: { padding: 6 },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 17, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  roleRow: { flexDirection: "row", gap: 12 },
  roleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  roleOptionText: { fontSize: 14, fontWeight: "600" },
  createBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
