// Shared types for Assistente Familiar Mobile

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";

export type CyclePhase =
  | "menstruation"   // Menstruação (dias 1-5)
  | "follicular"     // Folicular (dias 6-13)
  | "ovulation"      // Ovulação (dias 12-16)
  | "luteal"         // Lútea (dias 17-28)
  | "unknown";

export interface CycleEntry {
  id: string;
  memberId: string;
  startDate: string;   // ISO date string (YYYY-MM-DD)
  endDate?: string;    // ISO date string
  cycleLength?: number; // duração em dias
  notes?: string;
  symptoms?: string[];  // cólica, inchaço, dor de cabeça, etc.
  mood?: "great" | "good" | "ok" | "bad" | "irritable" | "anxious";
  flow?: "light" | "medium" | "heavy";
}

export interface MenstrualProfile {
  averageCycleLength: number;   // padrão: 28
  averagePeriodLength: number;  // padrão: 5
  lastPeriodStart?: string;     // ISO date string
  trackingEnabled: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: "adult" | "child" | "pai" | "mãe" | "filho" | "filha" | "avô" | "avó" | "outro";
  avatar?: string;
  photoUri?: string;  // URI local da foto de perfil do membro
  age?: number;
  gender?: Gender;
  menstrualProfile?: MenstrualProfile;
  isActive?: boolean;
  // Calibração de voz
  voiceSignature?: string;
  voiceCalibrated?: boolean;
  // Perfil de aprendizado
  preferences?: Record<string, string>;
  conversationCount?: number;
  lastSeen?: string;
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
  standbyMode: boolean;        // Modo plantão: escuta contínua pela wake word
  selectedVoiceId: string;    // ID da voz ElevenLabs selecionada
  selectedVoiceName: string;  // Nome amigável da voz selecionada
}
