import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  addCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getFamily,
  updateCalendarEvent,
} from "@/lib/family-store";
import type { CalendarEvent, EventCategory, EventReminderTime, FamilyMember } from "@/shared/types";

// ─── Constantes ───────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CATEGORY_CONFIG: Record<EventCategory, { label: string; color: string; icon: string }> = {
  family:   { label: "Família",     color: "#1A3A5C", icon: "👨‍👩‍👧" },
  health:   { label: "Saúde",       color: "#EF4444", icon: "🏥" },
  school:   { label: "Escola",      color: "#8B5CF6", icon: "📚" },
  birthday: { label: "Aniversário", color: "#F59E0B", icon: "🎂" },
  work:     { label: "Trabalho",    color: "#22C55E", icon: "💼" },
  other:    { label: "Outro",       color: "#6B7280", icon: "📌" },
};

const REMINDER_OPTIONS: { value: EventReminderTime; label: string }[] = [
  { value: "at_time", label: "Na hora" },
  { value: "5min",    label: "5 min antes" },
  { value: "15min",   label: "15 min antes" },
  { value: "30min",   label: "30 min antes" },
  { value: "1h",      label: "1 hora antes" },
  { value: "1day",    label: "1 dia antes" },
  { value: "2days",   label: "2 dias antes" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const d = new Date();
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function getReminderOffset(reminder: EventReminderTime): number {
  switch (reminder) {
    case "at_time": return 0;
    case "5min":    return 5 * 60 * 1000;
    case "15min":   return 15 * 60 * 1000;
    case "30min":   return 30 * 60 * 1000;
    case "1h":      return 60 * 60 * 1000;
    case "1day":    return 24 * 60 * 60 * 1000;
    case "2days":   return 2 * 24 * 60 * 60 * 1000;
  }
}

async function scheduleEventNotification(event: CalendarEvent): Promise<string | undefined> {
  if (Platform.OS === "web" || !event.reminder) return undefined;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return undefined;

    const [year, month, day] = event.date.split("-").map(Number);
    const [hour, minute] = event.time ? event.time.split(":").map(Number) : [9, 0];
    const eventDate = new Date(year, month - 1, day, hour, minute);
    const triggerDate = new Date(eventDate.getTime() - getReminderOffset(event.reminder));

    if (triggerDate <= new Date()) return undefined;

    const cat = CATEGORY_CONFIG[event.category];
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${cat.icon} ${event.title}`,
        body: event.description
          ? event.description
          : event.time
          ? `Hoje às ${event.time}`
          : "Evento do dia",
        data: { eventId: event.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return notifId;
  } catch {
    return undefined;
  }
}

async function cancelEventNotification(notificationId?: string) {
  if (!notificationId || Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch { /* ignora */ }
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function EventDot({ color }: { color: string }) {
  return <View style={[styles.eventDot, { backgroundColor: color }]} />;
}

function EventCard({
  event,
  members,
  onPress,
  onDelete,
}: {
  event: CalendarEvent;
  members: FamilyMember[];
  onPress: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const colors = useColors();
  const cat = CATEGORY_CONFIG[event.category];
  const member = members.find((m) => m.id === event.memberId);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.eventCard,
        { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: cat.color },
        pressed && { opacity: 0.8 },
      ]}
      onPress={() => onPress(event)}
    >
      <View style={styles.eventCardLeft}>
        <Text style={styles.eventCardIcon}>{cat.icon}</Text>
        <View style={styles.eventCardInfo}>
          <Text style={[styles.eventCardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {event.title}
          </Text>
          <View style={styles.eventCardMeta}>
            {event.time && (
              <Text style={[styles.eventCardTime, { color: colors.muted }]}>
                🕐 {event.time}{event.endTime ? ` – ${event.endTime}` : ""}
              </Text>
            )}
            {event.allDay && (
              <Text style={[styles.eventCardTime, { color: colors.muted }]}>Dia inteiro</Text>
            )}
            {member && (
              <Text style={[styles.eventCardMember, { color: cat.color }]}>
                · {member.name}
              </Text>
            )}
            {event.reminder && (
              <Text style={[styles.eventCardReminder, { color: colors.muted }]}>
                · 🔔 {REMINDER_OPTIONS.find((r) => r.value === event.reminder)?.label}
              </Text>
            )}
          </View>
          {event.description ? (
            <Text style={[styles.eventCardDesc, { color: colors.muted }]} numberOfLines={1}>
              {event.description}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
        onPress={() => onDelete(event)}
        hitSlop={8}
      >
        <IconSymbol name="trash.fill" size={16} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

// ─── Modal de Evento ──────────────────────────────────────────────────────────

interface EventFormState {
  title: string;
  description: string;
  date: string;
  time: string;
  endTime: string;
  allDay: boolean;
  category: EventCategory;
  memberId: string;
  reminder: EventReminderTime | "";
  recurring: CalendarEvent["recurring"];
}

const EMPTY_FORM: EventFormState = {
  title: "",
  description: "",
  date: todayKey(),
  time: "09:00",
  endTime: "",
  allDay: false,
  category: "family",
  memberId: "",
  reminder: "30min",
  recurring: "none",
};

function EventModal({
  visible,
  onClose,
  onSave,
  editEvent,
  members,
  selectedDate,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (form: EventFormState) => void;
  editEvent: CalendarEvent | null;
  members: FamilyMember[];
  selectedDate: string;
}) {
  const colors = useColors();
  const [form, setForm] = useState<EventFormState>({ ...EMPTY_FORM, date: selectedDate });

  useEffect(() => {
    if (visible) {
      if (editEvent) {
        setForm({
          title: editEvent.title,
          description: editEvent.description ?? "",
          date: editEvent.date,
          time: editEvent.time ?? "09:00",
          endTime: editEvent.endTime ?? "",
          allDay: editEvent.allDay,
          category: editEvent.category,
          memberId: editEvent.memberId ?? "",
          reminder: editEvent.reminder ?? "30min",
          recurring: editEvent.recurring ?? "none",
        });
      } else {
        setForm({ ...EMPTY_FORM, date: selectedDate });
      }
    }
  }, [visible, editEvent, selectedDate]);

  const set = useCallback(<K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert("Atenção", "O título do evento é obrigatório.");
      return;
    }
    if (!form.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Atenção", "Data inválida. Use o formato AAAA-MM-DD.");
      return;
    }
    if (!form.allDay && form.time && !form.time.match(/^\d{2}:\d{2}$/)) {
      Alert.alert("Atenção", "Hora inválida. Use o formato HH:MM.");
      return;
    }
    onSave(form);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.modalHeaderBtn}>
            <Text style={[styles.modalHeaderBtnText, { color: colors.muted }]}>Cancelar</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {editEvent ? "Editar Evento" : "Novo Evento"}
          </Text>
          <Pressable
            onPress={handleSave}
            style={[styles.modalHeaderBtn, styles.modalSaveBtn, { backgroundColor: "#1A3A5C" }]}
          >
            <Text style={styles.modalSaveBtnText}>Salvar</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          {/* Título */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>TÍTULO *</Text>
          <TextInput
            style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Ex: Consulta médica, Aniversário da Ana..."
            placeholderTextColor={colors.muted}
            value={form.title}
            onChangeText={(v) => set("title", v)}
            returnKeyType="next"
            autoFocus
          />

          {/* Categoria */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>CATEGORIA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {(Object.keys(CATEGORY_CONFIG) as EventCategory[]).map((cat) => {
              const cfg = CATEGORY_CONFIG[cat];
              const active = form.category === cat;
              return (
                <Pressable
                  key={cat}
                  style={[
                    styles.chip,
                    { borderColor: cfg.color, backgroundColor: active ? cfg.color : "transparent" },
                  ]}
                  onPress={() => set("category", cat)}
                >
                  <Text style={styles.chipIcon}>{cfg.icon}</Text>
                  <Text style={[styles.chipText, { color: active ? "#fff" : cfg.color }]}>
                    {cfg.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Data */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>DATA (AAAA-MM-DD) *</Text>
          <TextInput
            style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="2025-12-25"
            placeholderTextColor={colors.muted}
            value={form.date}
            onChangeText={(v) => set("date", v)}
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
          />

          {/* Dia inteiro */}
          <View style={[styles.switchRow, { borderColor: colors.border }]}>
            <Text style={[styles.switchLabel, { color: colors.foreground }]}>Dia inteiro</Text>
            <Switch
              value={form.allDay}
              onValueChange={(v) => set("allDay", v)}
              trackColor={{ false: colors.border, true: "#1A3A5C" }}
              thumbColor="#fff"
            />
          </View>

          {/* Hora */}
          {!form.allDay && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>HORA DE INÍCIO (HH:MM)</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="09:00"
                placeholderTextColor={colors.muted}
                value={form.time}
                onChangeText={(v) => set("time", v)}
                keyboardType="numbers-and-punctuation"
                returnKeyType="next"
              />
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>HORA DE TÉRMINO (HH:MM)</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="10:00 (opcional)"
                placeholderTextColor={colors.muted}
                value={form.endTime}
                onChangeText={(v) => set("endTime", v)}
                keyboardType="numbers-and-punctuation"
                returnKeyType="next"
              />
            </>
          )}

          {/* Membro */}
          {members.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>PARA QUEM</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                <Pressable
                  style={[
                    styles.chip,
                    { borderColor: "#1A3A5C", backgroundColor: form.memberId === "" ? "#1A3A5C" : "transparent" },
                  ]}
                  onPress={() => set("memberId", "")}
                >
                  <Text style={[styles.chipText, { color: form.memberId === "" ? "#fff" : "#1A3A5C" }]}>
                    👨‍👩‍👧 Família toda
                  </Text>
                </Pressable>
                {members.map((m) => {
                  const active = form.memberId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      style={[
                        styles.chip,
                        { borderColor: "#1A3A5C", backgroundColor: active ? "#1A3A5C" : "transparent" },
                      ]}
                      onPress={() => set("memberId", m.id)}
                    >
                      <Text style={[styles.chipText, { color: active ? "#fff" : "#1A3A5C" }]}>
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Lembrete */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>LEMBRETE AUTOMÁTICO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Pressable
              style={[
                styles.chip,
                { borderColor: colors.muted, backgroundColor: form.reminder === "" ? colors.muted : "transparent" },
              ]}
              onPress={() => set("reminder", "")}
            >
              <Text style={[styles.chipText, { color: form.reminder === "" ? "#fff" : colors.muted }]}>
                Sem lembrete
              </Text>
            </Pressable>
            {REMINDER_OPTIONS.map((opt) => {
              const active = form.reminder === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.chip,
                    { borderColor: "#F59E0B", backgroundColor: active ? "#F59E0B" : "transparent" },
                  ]}
                  onPress={() => set("reminder", opt.value)}
                >
                  <Text style={[styles.chipText, { color: active ? "#fff" : "#F59E0B" }]}>
                    🔔 {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Recorrência */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>RECORRÊNCIA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {(["none", "weekly", "monthly", "yearly"] as const).map((rec) => {
              const labels = { none: "Nenhuma", weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };
              const active = form.recurring === rec;
              return (
                <Pressable
                  key={rec}
                  style={[
                    styles.chip,
                    { borderColor: "#8B5CF6", backgroundColor: active ? "#8B5CF6" : "transparent" },
                  ]}
                  onPress={() => set("recurring", rec)}
                >
                  <Text style={[styles.chipText, { color: active ? "#fff" : "#8B5CF6" }]}>
                    {labels[rec]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Descrição */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>DESCRIÇÃO (OPCIONAL)</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Detalhes, endereço, observações..."
            placeholderTextColor={colors.muted}
            value={form.description}
            onChangeText={(v) => set("description", v)}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Tela Principal ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const colors = useColors();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    const [evts, family] = await Promise.all([getCalendarEvents(), getFamily()]);
    setEvents(evts);
    setMembers(family?.members ?? []);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Grade do calendário ──────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [currentYear, currentMonth]);

  // Mapa de data → eventos para o mês atual
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  // Eventos do dia selecionado
  const selectedEvents = useMemo(
    () =>
      (eventsByDate[selectedDate] ?? []).sort((a, b) =>
        (a.time ?? "00:00").localeCompare(b.time ?? "00:00")
      ),
    [eventsByDate, selectedDate]
  );

  // ── Navegação de mês ─────────────────────────────────────────────────────────

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (form: EventFormState) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const data: Omit<CalendarEvent, "id" | "createdAt"> = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      time: form.allDay ? undefined : (form.time || undefined),
      endTime: form.allDay ? undefined : (form.endTime || undefined),
      allDay: form.allDay,
      category: form.category,
      memberId: form.memberId || undefined,
      reminder: (form.reminder as EventReminderTime) || undefined,
      recurring: form.recurring ?? "none",
    };

    if (editEvent) {
      // Cancelar notificação antiga
      await cancelEventNotification(editEvent.notificationId);
      // Reagendar se necessário
      const notifId = data.reminder ? await scheduleEventNotification({ ...data, id: editEvent.id, createdAt: editEvent.createdAt }) : undefined;
      await updateCalendarEvent(editEvent.id, { ...data, notificationId: notifId });
    } else {
      const newEvent = await addCalendarEvent(data);
      if (newEvent.reminder) {
        const notifId = await scheduleEventNotification(newEvent);
        if (notifId) await updateCalendarEvent(newEvent.id, { notificationId: notifId });
      }
    }

    setShowModal(false);
    setEditEvent(null);
    await loadData();

    // Navegar para o mês do evento
    const [y, m] = form.date.split("-").map(Number);
    setCurrentYear(y);
    setCurrentMonth(m - 1);
    setSelectedDate(form.date);
  }, [editEvent, loadData]);

  const handleDelete = useCallback((event: CalendarEvent) => {
    Alert.alert(
      "Excluir evento",
      `Deseja excluir "${event.title}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await cancelEventNotification(event.notificationId);
            await deleteCalendarEvent(event.id);
            await loadData();
          },
        },
      ]
    );
  }, [loadData]);

  const handleEdit = useCallback((event: CalendarEvent) => {
    setEditEvent(event);
    setShowModal(true);
  }, []);

  const handleAddNew = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditEvent(null);
    setShowModal(true);
  }, []);

  // ── Próximos eventos (resumo) ─────────────────────────────────────────────────

  const upcomingEvents = useMemo(() => {
    const todayStr = todayKey();
    return events
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : (a.time ?? "00:00").localeCompare(b.time ?? "00:00");
      })
      .slice(0, 5);
  }, [events]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Calendário</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>Agenda familiar</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, { backgroundColor: "#1A3A5C" }, pressed && { opacity: 0.8 }]}
            onPress={handleAddNew}
          >
            <IconSymbol name="plus" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Evento</Text>
          </Pressable>
        </View>

        {/* Navegação de mês */}
        <View style={[styles.monthNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.5 }]}
            onPress={prevMonth}
          >
            <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.foreground }]}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.5 }]}
            onPress={nextMonth}
          >
            <IconSymbol name="chevron.right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Grade do calendário */}
        <View style={[styles.calendarGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Cabeçalho dos dias da semana */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={[styles.weekdayLabel, { color: colors.muted }]}>{w}</Text>
            ))}
          </View>

          {/* Dias */}
          <View style={styles.daysGrid}>
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />;
              }
              const dateKey = toDateKey(currentYear, currentMonth, day);
              const isToday = dateKey === todayKey();
              const isSelected = dateKey === selectedDate;
              const dayEvents = eventsByDate[dateKey] ?? [];
              const hasEvents = dayEvents.length > 0;

              return (
                <Pressable
                  key={dateKey}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isSelected && { backgroundColor: "#1A3A5C", borderRadius: 10 },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: "#1A3A5C", borderRadius: 10 },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => setSelectedDate(dateKey)}
                >
                  <Text style={[
                    styles.dayNumber,
                    { color: isSelected ? "#fff" : isToday ? "#1A3A5C" : colors.foreground },
                  ]}>
                    {day}
                  </Text>
                  {hasEvents && (
                    <View style={styles.dotsRow}>
                      {dayEvents.slice(0, 3).map((e) => (
                        <EventDot key={e.id} color={isSelected ? "#ffffff88" : CATEGORY_CONFIG[e.category].color} />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Eventos do dia selecionado */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {selectedDate === todayKey() ? "Hoje" : formatDateLabel(selectedDate)}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.addSmallBtn, { borderColor: "#1A3A5C" }, pressed && { opacity: 0.6 }]}
              onPress={handleAddNew}
            >
              <IconSymbol name="plus" size={14} color="#1A3A5C" />
              <Text style={[styles.addSmallBtnText, { color: "#1A3A5C" }]}>Adicionar</Text>
            </Pressable>
          </View>

          {selectedEvents.length === 0 ? (
            <View style={[styles.emptyDay, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.emptyDayIcon}>📅</Text>
              <Text style={[styles.emptyDayText, { color: colors.muted }]}>
                Nenhum evento neste dia
              </Text>
              <Pressable
                style={({ pressed }) => [styles.emptyDayBtn, { backgroundColor: "#1A3A5C" }, pressed && { opacity: 0.8 }]}
                onPress={handleAddNew}
              >
                <Text style={styles.emptyDayBtnText}>+ Criar evento</Text>
              </Pressable>
            </View>
          ) : (
            selectedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                members={members}
                onPress={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </View>

        {/* Próximos eventos */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Próximos eventos</Text>
            {upcomingEvents.map((event) => {
              const cat = CATEGORY_CONFIG[event.category];
              const member = members.find((m) => m.id === event.memberId);
              const isEventToday = event.date === todayKey();
              return (
                <Pressable
                  key={event.id}
                  style={({ pressed }) => [
                    styles.upcomingCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    const [y, mo] = event.date.split("-").map(Number);
                    setCurrentYear(y);
                    setCurrentMonth(mo - 1);
                    setSelectedDate(event.date);
                  }}
                >
                  <View style={[styles.upcomingDateBadge, { backgroundColor: cat.color + "22" }]}>
                    <Text style={[styles.upcomingDateDay, { color: cat.color }]}>
                      {event.date.split("-")[2]}
                    </Text>
                    <Text style={[styles.upcomingDateMonth, { color: cat.color }]}>
                      {MONTHS[Number(event.date.split("-")[1]) - 1].slice(0, 3)}
                    </Text>
                  </View>
                  <View style={styles.upcomingInfo}>
                    <Text style={[styles.upcomingTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {cat.icon} {event.title}
                    </Text>
                    <Text style={[styles.upcomingMeta, { color: colors.muted }]}>
                      {isEventToday ? "Hoje" : ""}{event.time ? (isEventToday ? " · " : "") + event.time : ""}
                      {member ? ` · ${member.name}` : ""}
                    </Text>
                  </View>
                  {event.reminder && (
                    <Text style={styles.upcomingBell}>🔔</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Modal de evento */}
      <EventModal
        visible={showModal}
        onClose={() => { setShowModal(false); setEditEvent(null); }}
        onSave={handleSave}
        editEvent={editEvent}
        members={members}
        selectedDate={selectedDate}
      />
    </ScreenContainer>
  );
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][date.getDay()];
  return `${weekday}, ${d} de ${MONTHS[m - 1]}`;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  // Navegação de mês
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  monthNavBtn: { padding: 8 },
  monthTitle: { fontSize: 17, fontWeight: "700" },

  // Grade
  calendarGrid: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 10,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: "500",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Seção
  section: {
    marginHorizontal: 12,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  addSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  addSmallBtnText: { fontSize: 12, fontWeight: "600" },

  // Evento vazio
  emptyDay: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 0.5,
    gap: 8,
  },
  emptyDayIcon: { fontSize: 32 },
  emptyDayText: { fontSize: 14 },
  emptyDayBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  emptyDayBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  // Card de evento
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  eventCardLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  eventCardIcon: { fontSize: 22, marginTop: 1 },
  eventCardInfo: { flex: 1, gap: 2 },
  eventCardTitle: { fontSize: 15, fontWeight: "600" },
  eventCardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  eventCardTime: { fontSize: 12 },
  eventCardMember: { fontSize: 12, fontWeight: "600" },
  eventCardReminder: { fontSize: 12 },
  eventCardDesc: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 6 },

  // Próximos eventos
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  upcomingDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingDateDay: { fontSize: 18, fontWeight: "700", lineHeight: 20 },
  upcomingDateMonth: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  upcomingInfo: { flex: 1 },
  upcomingTitle: { fontSize: 14, fontWeight: "600" },
  upcomingMeta: { fontSize: 12, marginTop: 2 },
  upcomingBell: { fontSize: 16 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  modalHeaderBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  modalHeaderBtnText: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalSaveBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },
  modalSaveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalScroll: { flex: 1, paddingHorizontal: 16 },

  // Campos do formulário
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldInputMulti: {
    minHeight: 80,
    paddingTop: 12,
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
  },
  chipIcon: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    marginTop: 8,
  },
  switchLabel: { fontSize: 15, fontWeight: "500" },
});
