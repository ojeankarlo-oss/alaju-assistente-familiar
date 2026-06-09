import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

import {
  createDefaultFamily,
  getFamily,
  addFamilyMember,
  getReminders,
  addReminder,
  updateReminder,
  deleteReminder,
  getActiveShoppingList,
  addShoppingItem,
  toggleShoppingItem,
  getSettings,
  saveSettings,
} from "../lib/family-store";

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe("Family Store", () => {
  it("creates a default family profile", async () => {
    const profile = await createDefaultFamily();
    expect(profile.name).toBe("Minha Família");
    expect(profile.members.length).toBe(1);
    expect(profile.members[0].isActive).toBe(true);
  });

  it("persists and retrieves family profile", async () => {
    await createDefaultFamily();
    const profile = await getFamily();
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("Minha Família");
  });

  it("adds a family member", async () => {
    await createDefaultFamily();
    const member = await addFamilyMember({ name: "João", role: "child", isActive: false });
    expect(member.name).toBe("João");
    expect(member.role).toBe("child");
    const profile = await getFamily();
    expect(profile?.members.length).toBe(2);
  });
});

describe("Reminders", () => {
  it("starts with empty reminders", async () => {
    const reminders = await getReminders();
    expect(reminders).toEqual([]);
  });

  it("adds a reminder", async () => {
    const reminder = await addReminder({
      title: "Tomar remédio",
      dateTime: new Date().toISOString(),
      priority: "high",
      completed: false,
    });
    expect(reminder.title).toBe("Tomar remédio");
    expect(reminder.priority).toBe("high");
    expect(reminder.id).toBeTruthy();
  });

  it("updates a reminder", async () => {
    const reminder = await addReminder({
      title: "Consulta médica",
      dateTime: new Date().toISOString(),
      priority: "medium",
      completed: false,
    });
    await updateReminder(reminder.id, { completed: true });
    const reminders = await getReminders();
    const updated = reminders.find((r) => r.id === reminder.id);
    expect(updated?.completed).toBe(true);
  });

  it("deletes a reminder", async () => {
    const reminder = await addReminder({
      title: "Reunião",
      dateTime: new Date().toISOString(),
      priority: "low",
      completed: false,
    });
    await deleteReminder(reminder.id);
    const reminders = await getReminders();
    expect(reminders.find((r) => r.id === reminder.id)).toBeUndefined();
  });
});

describe("Shopping List", () => {
  it("creates an active shopping list if none exists", async () => {
    const list = await getActiveShoppingList();
    expect(list.name).toBe("Lista de Compras");
    expect(list.items).toEqual([]);
  });

  it("adds items to shopping list", async () => {
    const list = await getActiveShoppingList();
    const item = await addShoppingItem(list.id, "Leite", "2x");
    expect(item.name).toBe("Leite");
    expect(item.quantity).toBe("2x");
    expect(item.checked).toBe(false);
  });

  it("toggles shopping item", async () => {
    const list = await getActiveShoppingList();
    const item = await addShoppingItem(list.id, "Pão");
    await toggleShoppingItem(list.id, item.id);
    const updatedList = await getActiveShoppingList();
    const updatedItem = updatedList.items.find((i) => i.id === item.id);
    expect(updatedItem?.checked).toBe(true);
  });
});

describe("Settings", () => {
  it("returns default settings when none saved", async () => {
    const settings = await getSettings();
    expect(settings.voiceEnabled).toBe(true);
    expect(settings.notificationsEnabled).toBe(true);
    expect(settings.telegramBotToken).toBe("");
  });

  it("saves and retrieves settings", async () => {
    await saveSettings({
      telegramBotToken: "123:ABC",
      telegramChatId: "456789",
      voiceEnabled: false,
      notificationsEnabled: true,
      activeMemberId: "member1",
    });
    const settings = await getSettings();
    expect(settings.telegramBotToken).toBe("123:ABC");
    expect(settings.voiceEnabled).toBe(false);
  });
});
