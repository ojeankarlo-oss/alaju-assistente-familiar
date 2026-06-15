/**
 * cycle-store.ts
 * Armazenamento e lógica de cálculo do ciclo menstrual.
 * Usa AsyncStorage para persistência local.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CycleEntry, CyclePhase, MenstrualProfile } from "@/shared/types";

const CYCLE_KEY = "cycle_entries";

// ─── Persistência ────────────────────────────────────────────────────────────

export async function getCycleEntries(memberId: string): Promise<CycleEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(`${CYCLE_KEY}_${memberId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCycleEntries(memberId: string, entries: CycleEntry[]): Promise<void> {
  await AsyncStorage.setItem(`${CYCLE_KEY}_${memberId}`, JSON.stringify(entries));
}

export async function addCycleEntry(entry: CycleEntry): Promise<void> {
  const entries = await getCycleEntries(entry.memberId);
  entries.push(entry);
  // Ordenar por data mais recente primeiro
  entries.sort((a, b) => b.startDate.localeCompare(a.startDate));
  await saveCycleEntries(entry.memberId, entries);
}

export async function updateCycleEntry(memberId: string, updated: CycleEntry): Promise<void> {
  const entries = await getCycleEntries(memberId);
  const idx = entries.findIndex((e) => e.id === updated.id);
  if (idx !== -1) {
    entries[idx] = updated;
    await saveCycleEntries(memberId, entries);
  }
}

export async function deleteCycleEntry(memberId: string, entryId: string): Promise<void> {
  const entries = await getCycleEntries(memberId);
  await saveCycleEntries(memberId, entries.filter((e) => e.id !== entryId));
}

// ─── Lógica de Cálculo ────────────────────────────────────────────────────────

/**
 * Retorna a data no formato YYYY-MM-DD
 */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Calcula a fase atual do ciclo com base no último período e perfil
 */
export function getCurrentPhase(profile: MenstrualProfile): {
  phase: CyclePhase;
  dayOfCycle: number;
  daysUntilNextPeriod: number;
  daysUntilOvulation: number;
} {
  if (!profile.lastPeriodStart) {
    return { phase: "unknown", dayOfCycle: 0, daysUntilNextPeriod: 0, daysUntilOvulation: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastStart = new Date(profile.lastPeriodStart);
  lastStart.setHours(0, 0, 0, 0);

  const dayOfCycle = Math.floor((today.getTime() - lastStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const cycleLen = profile.averageCycleLength || 28;
  const periodLen = profile.averagePeriodLength || 5;

  // Normalizar para dentro do ciclo atual
  const dayInCycle = ((dayOfCycle - 1) % cycleLen) + 1;

  // Ovulação estimada: cycleLen - 14 dias
  const ovulationDay = cycleLen - 14;
  const daysUntilOvulation = ovulationDay - dayInCycle;
  const daysUntilNextPeriod = cycleLen - dayInCycle + 1;

  let phase: CyclePhase;
  if (dayInCycle <= periodLen) {
    phase = "menstruation";
  } else if (dayInCycle <= ovulationDay - 2) {
    phase = "follicular";
  } else if (dayInCycle <= ovulationDay + 2) {
    phase = "ovulation";
  } else {
    phase = "luteal";
  }

  return {
    phase,
    dayOfCycle: dayInCycle,
    daysUntilNextPeriod: Math.max(0, daysUntilNextPeriod),
    daysUntilOvulation: Math.max(0, daysUntilOvulation),
  };
}

/**
 * Gera os próximos 3 meses de previsões de período
 */
export function getUpcomingPeriods(profile: MenstrualProfile, count = 3): string[] {
  if (!profile.lastPeriodStart) return [];

  const cycleLen = profile.averageCycleLength || 28;
  const lastStart = new Date(profile.lastPeriodStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming: string[] = [];
  let next = new Date(lastStart);

  // Avançar até encontrar datas futuras
  while (next <= today) {
    next = new Date(next.getTime() + cycleLen * 24 * 60 * 60 * 1000);
  }

  for (let i = 0; i < count; i++) {
    upcoming.push(toDateString(next));
    next = new Date(next.getTime() + cycleLen * 24 * 60 * 60 * 1000);
  }

  return upcoming;
}

/**
 * Informações de cada fase para exibição
 */
export const PHASE_INFO: Record<CyclePhase, {
  label: string;
  color: string;
  emoji: string;
  description: string;
  tips: string[];
  mood: string;
  energy: string;
}> = {
  menstruation: {
    label: "Menstruação",
    color: "#E879A0",
    emoji: "🌸",
    description: "Seu corpo está renovando. É normal sentir cólicas e cansaço.",
    tips: [
      "Hidrate-se bastante com água morna",
      "Bolsa de água quente alivia cólicas",
      "Prefira alimentos ricos em ferro: feijão, espinafre",
      "Evite cafeína em excesso",
      "Exercícios leves como yoga ajudam",
    ],
    mood: "Introvertida e sensível",
    energy: "Baixa",
  },
  follicular: {
    label: "Fase Folicular",
    color: "#A78BFA",
    emoji: "🌱",
    description: "Energia crescente! Ótimo momento para novos projetos e aprendizado.",
    tips: [
      "Aproveite a energia para começar algo novo",
      "Boa fase para exercícios mais intensos",
      "Criatividade em alta — use isso!",
      "Alimentos ricos em proteína e vegetais frescos",
      "Sono mais profundo e reparador",
    ],
    mood: "Animada e otimista",
    energy: "Crescente",
  },
  ovulation: {
    label: "Ovulação",
    color: "#F59E0B",
    emoji: "✨",
    description: "Pico de energia e sociabilidade. Você está no seu melhor!",
    tips: [
      "Ótimo momento para reuniões e conversas importantes",
      "Libido naturalmente mais alta",
      "Aproveite para atividades físicas intensas",
      "Comunicação fluida — bom para resolver conflitos",
      "Cuide da pele: ela pode ficar mais oleosa",
    ],
    mood: "Extrovertida e confiante",
    energy: "Alta",
  },
  luteal: {
    label: "Fase Lútea",
    color: "#6366F1",
    emoji: "🌙",
    description: "Fase de introspecção. O corpo se prepara para o próximo ciclo.",
    tips: [
      "Reduza açúcar e sal para diminuir inchaço",
      "Magnésio ajuda com TPM: nozes, chocolate amargo",
      "Priorize o descanso e o sono",
      "Exercícios moderados como caminhada",
      "Seja gentil consigo mesma — é normal sentir mais",
    ],
    mood: "Reflexiva, pode ter TPM",
    energy: "Diminuindo",
  },
  unknown: {
    label: "Ciclo não configurado",
    color: "#6B7280",
    emoji: "📅",
    description: "Configure seu ciclo para receber dicas personalizadas.",
    tips: [],
    mood: "—",
    energy: "—",
  },
};

/**
 * Calcula a média do ciclo com base no histórico
 */
export function calculateAverageCycleLength(entries: CycleEntry[]): number {
  if (entries.length < 2) return 28;
  const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].startDate);
    const curr = new Date(sorted[i].startDate);
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 15 && diff < 45) lengths.push(diff); // Filtrar outliers
  }
  if (lengths.length === 0) return 28;
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

/**
 * Gera contexto do ciclo para a Alaju
 */
export function getCycleContextForAlaju(profile: MenstrualProfile, memberName: string): string {
  if (!profile.trackingEnabled || !profile.lastPeriodStart) return "";

  const { phase, dayOfCycle, daysUntilNextPeriod } = getCurrentPhase(profile);
  const info = PHASE_INFO[phase];

  return `
[Saúde Feminina de ${memberName}]
Fase atual: ${info.label} (dia ${dayOfCycle} do ciclo)
Energia esperada: ${info.energy}
Humor esperado: ${info.mood}
Próxima menstruação em: ${daysUntilNextPeriod} dias
Dica principal: ${info.tips[0] || ""}
`.trim();
}
