import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AssistantSettings,
  ChatMessage,
  FamilyMember,
  FamilyProfile,
  HealthEntry,
  Reminder,
  ShoppingItem,
  ShoppingList,
  StudySession,
} from "@/shared/types";

const KEYS = {
  FAMILY: "family_profile",
  REMINDERS: "reminders",
  SHOPPING_LISTS: "shopping_lists",
  HEALTH: "health_entries",
  STUDY: "study_sessions",
  CHAT: "chat_history",
  SETTINGS: "assistant_settings",
};

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Family ──────────────────────────────────────────────────────────────────

export async function getFamily(): Promise<FamilyProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.FAMILY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveFamily(profile: FamilyProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.FAMILY, JSON.stringify(profile));
}

export async function createDefaultFamily(): Promise<FamilyProfile> {
  const profile: FamilyProfile = {
    id: uuid(),
    name: "Minha Família",
    members: [
      {
        id: uuid(),
        name: "Você",
        role: "adult",
        isActive: true,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  await saveFamily(profile);
  return profile;
}

export async function addFamilyMember(member: Omit<FamilyMember, "id">): Promise<FamilyMember> {
  const profile = (await getFamily()) || (await createDefaultFamily());
  const newMember: FamilyMember = { ...member, id: uuid() };
  profile.members.push(newMember);
  await saveFamily(profile);
  return newMember;
}

export async function updateFamilyMember(id: string, updates: Partial<FamilyMember>): Promise<void> {
  const profile = await getFamily();
  if (!profile) return;
  profile.members = profile.members.map((m) => (m.id === id ? { ...m, ...updates } : m));
  await saveFamily(profile);
}

export async function deleteFamilyMember(id: string): Promise<void> {
  const profile = await getFamily();
  if (!profile) return;
  profile.members = profile.members.filter((m) => m.id !== id);
  await saveFamily(profile);
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export async function getReminders(): Promise<Reminder[]> {
  const raw = await AsyncStorage.getItem(KEYS.REMINDERS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.REMINDERS, JSON.stringify(reminders));
}

export async function addReminder(data: Omit<Reminder, "id" | "createdAt">): Promise<Reminder> {
  const reminders = await getReminders();
  const reminder: Reminder = { ...data, id: uuid(), createdAt: new Date().toISOString() };
  reminders.push(reminder);
  await saveReminders(reminders);
  return reminder;
}

export async function updateReminder(id: string, updates: Partial<Reminder>): Promise<void> {
  const reminders = await getReminders();
  const updated = reminders.map((r) => (r.id === id ? { ...r, ...updates } : r));
  await saveReminders(updated);
}

export async function deleteReminder(id: string): Promise<void> {
  const reminders = await getReminders();
  await saveReminders(reminders.filter((r) => r.id !== id));
}

// ─── Shopping ─────────────────────────────────────────────────────────────────

export async function getShoppingLists(): Promise<ShoppingList[]> {
  const raw = await AsyncStorage.getItem(KEYS.SHOPPING_LISTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveShoppingLists(lists: ShoppingList[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.SHOPPING_LISTS, JSON.stringify(lists));
}

export async function getActiveShoppingList(): Promise<ShoppingList> {
  const lists = await getShoppingLists();
  const active = lists.find((l) => !l.sentToTelegram);
  if (active) return active;
  const newList: ShoppingList = {
    id: uuid(),
    name: "Lista de Compras",
    items: [],
    sentToTelegram: false,
    createdAt: new Date().toISOString(),
  };
  await saveShoppingLists([...lists, newList]);
  return newList;
}

export async function addShoppingItem(listId: string, name: string, quantity?: string): Promise<ShoppingItem> {
  const lists = await getShoppingLists();
  const item: ShoppingItem = { id: uuid(), name, quantity, checked: false, createdAt: new Date().toISOString() };
  const updated = lists.map((l) =>
    l.id === listId ? { ...l, items: [...l.items, item] } : l
  );
  await saveShoppingLists(updated);
  return item;
}

export async function toggleShoppingItem(listId: string, itemId: string): Promise<void> {
  const lists = await getShoppingLists();
  const updated = lists.map((l) =>
    l.id === listId
      ? { ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)) }
      : l
  );
  await saveShoppingLists(updated);
}

export async function deleteShoppingItem(listId: string, itemId: string): Promise<void> {
  const lists = await getShoppingLists();
  const updated = lists.map((l) =>
    l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l
  );
  await saveShoppingLists(updated);
}

export async function markListSentToTelegram(listId: string): Promise<void> {
  const lists = await getShoppingLists();
  const updated = lists.map((l) => (l.id === listId ? { ...l, sentToTelegram: true } : l));
  await saveShoppingLists(updated);
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function getHealthEntries(memberId?: string): Promise<HealthEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.HEALTH);
  const all: HealthEntry[] = raw ? JSON.parse(raw) : [];
  return memberId ? all.filter((e) => e.memberId === memberId) : all;
}

export async function addHealthEntry(data: Omit<HealthEntry, "id">): Promise<HealthEntry> {
  const raw = await AsyncStorage.getItem(KEYS.HEALTH);
  const all: HealthEntry[] = raw ? JSON.parse(raw) : [];
  const entry: HealthEntry = { ...data, id: uuid() };
  all.push(entry);
  await AsyncStorage.setItem(KEYS.HEALTH, JSON.stringify(all));
  return entry;
}

// ─── Study ────────────────────────────────────────────────────────────────────

export async function getStudySessions(memberId?: string): Promise<StudySession[]> {
  const raw = await AsyncStorage.getItem(KEYS.STUDY);
  const all: StudySession[] = raw ? JSON.parse(raw) : [];
  return memberId ? all.filter((s) => s.memberId === memberId) : all;
}

export async function addStudySession(data: Omit<StudySession, "id">): Promise<StudySession> {
  const raw = await AsyncStorage.getItem(KEYS.STUDY);
  const all: StudySession[] = raw ? JSON.parse(raw) : [];
  const session: StudySession = { ...data, id: uuid() };
  all.push(session);
  await AsyncStorage.setItem(KEYS.STUDY, JSON.stringify(all));
  return session;
}

// ─── Chat History ─────────────────────────────────────────────────────────────

export async function getChatHistory(): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(KEYS.CHAT);
  return raw ? JSON.parse(raw) : [];
}

export async function addChatMessage(msg: Omit<ChatMessage, "id">): Promise<ChatMessage> {
  const history = await getChatHistory();
  const message: ChatMessage = { ...msg, id: uuid() };
  const trimmed = [...history, message].slice(-100); // keep last 100
  await AsyncStorage.setItem(KEYS.CHAT, JSON.stringify(trimmed));
  return message;
}

export async function clearChatHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CHAT);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AssistantSettings> {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  const defaults: AssistantSettings = {
    telegramBotToken: "",
    telegramChatId: "",
    voiceEnabled: true,
    notificationsEnabled: true,
    activeMemberId: "",
    standbyMode: false,
    selectedVoiceId: "cgSgspJ2msm6clMCkdW9", // Jessica (default)
    selectedVoiceName: "Jessica",
  };
  if (!raw) return defaults;
  // Merge para garantir que novos campos tenham defaults em instalações antigas
  return { ...defaults, ...JSON.parse(raw) };
}

export async function saveSettings(settings: AssistantSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ─── Memória de Longo Prazo ───────────────────────────────────────────────────

/**
 * Atualiza uma preferência/memória de um membro.
 * Exemplos de chaves: "horario_lembrete", "app_corrida", "materia_favorita", "alimento_evitar"
 */
export async function setMemberMemory(memberId: string, key: string, value: string): Promise<void> {
  const profile = await getFamily();
  if (!profile) return;
  profile.members = profile.members.map((m) => {
    if (m.id !== memberId) return m;
    return {
      ...m,
      preferences: { ...(m.preferences ?? {}), [key]: value },
      conversationCount: (m.conversationCount ?? 0) + 1,
      lastSeen: new Date().toISOString(),
    };
  });
  await saveFamily(profile);
}

/**
 * Retorna todas as memórias de um membro como string formatada para o prompt da IA.
 */
export async function getMemberMemoryContext(memberId: string): Promise<string> {
  const profile = await getFamily();
  if (!profile) return "";
  const member = profile.members.find((m) => m.id === memberId);
  if (!member || !member.preferences || Object.keys(member.preferences).length === 0) return "";
  const lines = Object.entries(member.preferences).map(([k, v]) => `- ${k}: ${v}`);
  return `Memórias sobre ${member.name}:\n${lines.join("\n")}`;
}

/**
 * Incrementa o contador de conversas e atualiza o lastSeen do membro ativo.
 */
export async function recordMemberInteraction(memberId: string): Promise<void> {
  const profile = await getFamily();
  if (!profile) return;
  profile.members = profile.members.map((m) => {
    if (m.id !== memberId) return m;
    return {
      ...m,
      conversationCount: (m.conversationCount ?? 0) + 1,
      lastSeen: new Date().toISOString(),
    };
  });
  await saveFamily(profile);
}

/**
 * Verifica se o onboarding já foi concluído.
 */
export async function isOnboardingDone(): Promise<boolean> {
  const raw = await AsyncStorage.getItem("onboarding_done");
  return raw === "true";
}

export async function markOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem("onboarding_done", "true");
}
