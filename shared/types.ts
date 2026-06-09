// Shared types for Assistente Familiar Mobile

export interface FamilyMember {
  id: string;
  name: string;
  role: "adult" | "child";
  avatar?: string;
  age?: number;
  isActive?: boolean;
}

export interface FamilyProfile {
  id: string;
  name: string;
  members: FamilyMember[];
  telegramBotToken?: string;
  telegramChatId?: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dateTime: string;
  memberId?: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  checked: boolean;
  addedBy?: string;
  createdAt: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingItem[];
  sentToTelegram: boolean;
  createdAt: string;
}

export interface HealthEntry {
  id: string;
  memberId: string;
  date: string;
  steps?: number;
  sleepHours?: number;
  waterGlasses?: number;
  exerciseMinutes?: number;
  exerciseType?: string;
  mood?: "great" | "good" | "ok" | "bad";
  notes?: string;
}

export interface StudySession {
  id: string;
  memberId: string;
  subject: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  memberId?: string;
}

export interface AssistantSettings {
  telegramBotToken: string;
  telegramChatId: string;
  voiceEnabled: boolean;
  notificationsEnabled: boolean;
  activeMemberId: string;
}
