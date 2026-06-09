import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  addReminder,
  deleteReminder,
  getReminders,
  updateReminder,
} from "@/lib/family-store";
import type { Reminder } from "@/shared/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const PRIORITY_COLORS = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444",
};

const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

async function scheduleNotification(reminder: Reminder) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const trigger = new Date(reminder.dateTime);
    if (trigger > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ ${reminder.title}`,
          body: reminder.description || "Lembrete do Assistente Familiar",
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
      });
    }
  } catch {
    // ignore
  }
}

function ReminderCard({
  reminder,
  onToggle,
  onDelete,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const date = new Date(reminder.dateTime);
  const isPast = date < new Date();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: reminder.completed ? 0.6 : 1,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.checkArea, pressed && { opacity: 0.7 }]}
        onPress={onToggle}
      >
        <IconSymbol
          name={reminder.completed ? "checkmark.circle.fill" : "checkmark.circle"}
          size={26}
          color={reminder.completed ? "#22C55E" : colors.muted}
        />
      </Pressable>
      <View style={styles.cardContent}>
        <Text
          style={[
            styles.cardTitle,
            { color: colors.foreground },
            reminder.completed && styles.strikethrough,
          ]}
        >
          {reminder.title}
        </Text>
        {reminder.description ? (
          <Text style={[styles.cardDesc, { color: colors.muted }]}>{reminder.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <IconSymbol name="clock.fill" size={12} color={isPast && !reminder.completed ? "#EF4444" : colors.muted} />
          <Text
            style={[
              styles.cardDate,
              { color: isPast && !reminder.completed ? "#EF4444" : colors.muted },
            ]}
          >
            {date.toLocaleDateString("pt-BR")} às {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <View
            style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[reminder.priority] + "22" }]}
          >
            <Text style={[styles.priorityText, { color: PRIORITY_COLORS[reminder.priority] }]}>
              {PRIORITY_LABELS[reminder.priority]}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
        onPress={onDelete}
      >
        <IconSymbol name="trash" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function RemindersScreen() {
  const colors = useColors();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const load = useCallback(async () => {
    const data = await getReminders();
    setReminders(data.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert("Atenção", "Informe o título do lembrete.");
      return;
    }
    const now = new Date();
    const [day, month, year] = (dateStr || `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`).split("/");
    const [hour, min] = (timeStr || "09:00").split(":");
    const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min));

    const reminder = await addReminder({
      title: title.trim(),
      description: description.trim() || undefined,
      dateTime: dt.toISOString(),
      priority,
      completed: false,
    });
    await scheduleNotification(reminder);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTitle("");
    setDescription("");
    setDateStr("");
    setTimeStr("");
    setPriority("medium");
    setShowModal(false);
    load();
  }, [title, description, dateStr, timeStr, priority, load]);

  const handleToggle = useCallback(
    async (id: string, current: boolean) => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateReminder(id, { completed: !current });
      load();
    },
    [load]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      Alert.alert("Excluir lembrete", "Tem certeza?", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteReminder(id);
            load();
          },
        },
      ]);
    },
    [load]
  );

  const pending = reminders.filter((r) => !r.completed);
  const done = reminders.filter((r) => r.completed);

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Lembretes</Text>
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: "#1A3A5C" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => setShowModal(true)}
        >
          <IconSymbol name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={[...pending, ...done]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ReminderCard
            reminder={item}
            onToggle={() => handleToggle(item.id, item.completed)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="bell.fill" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum lembrete ainda</Text>
            <Text style={[styles.emptyHint, { color: colors.muted }]}>
              Toque em + para criar ou peça à Fami
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Create modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Novo Lembrete</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <IconSymbol name="xmark" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Título do lembrete"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Descrição (opcional)"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.fieldInputHalf, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="Data (DD/MM/AAAA)"
                placeholderTextColor={colors.muted}
                value={dateStr}
                onChangeText={setDateStr}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.fieldInputHalf, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="Hora (HH:MM)"
                placeholderTextColor={colors.muted}
                value={timeStr}
                onChangeText={setTimeStr}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Prioridade</Text>
            <View style={styles.priorityRow}>
              {(["low", "medium", "high"] as const).map((p) => (
                <Pressable
                  key={p}
                  style={[
                    styles.priorityOption,
                    {
                      backgroundColor:
                        priority === p ? PRIORITY_COLORS[p] : PRIORITY_COLORS[p] + "22",
                      borderColor: PRIORITY_COLORS[p],
                    },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text
                    style={[
                      styles.priorityOptionText,
                      { color: priority === p ? "#fff" : PRIORITY_COLORS[p] },
                    ]}
                  >
                    {PRIORITY_LABELS[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.createBtn,
                { backgroundColor: "#1A3A5C" },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleCreate}
            >
              <Text style={styles.createBtnText}>Criar Lembrete</Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { padding: 16, gap: 10 },
  card: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    alignItems: "flex-start",
  },
  checkArea: { paddingTop: 2 },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  cardDate: { fontSize: 12 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  priorityText: { fontSize: 11, fontWeight: "600" },
  deleteBtn: { padding: 4 },
  strikethrough: { textDecorationLine: "line-through" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 17, fontWeight: "600" },
  emptyHint: { fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 10 },
  fieldInputHalf: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  priorityRow: { flexDirection: "row", gap: 10 },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  priorityOptionText: { fontSize: 13, fontWeight: "600" },
  createBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
