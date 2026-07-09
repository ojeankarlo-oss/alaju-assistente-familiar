import { ENV } from "./_core/env";

// ─── Supabase HTTP Client ─────────────────────────────────────────────────────
// Usa a REST API do Supabase diretamente via fetch (sem SDK)
// Chave: sb_publishable_ para leitura pública, sb_secret_ para escrita/admin

function getHeaders(useSecret = false) {
  const key = useSecret ? ENV.supabaseSecretKey : ENV.supabasePublishableKey;
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

function supabaseUrl(table: string, query = "") {
  return `${ENV.supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

// ─── Chat History ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id?: string;
  family_id: string;
  member_id: string;
  member_name: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  try {
    await fetch(supabaseUrl("chat_history"), {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(msg),
    });
  } catch (err) {
    console.error("[Supabase] Erro ao salvar mensagem:", err);
  }
}

export async function getChatHistory(
  familyId: string,
  memberId: string,
  limit = 20
): Promise<ChatMessage[]> {
  try {
    const query = `family_id=eq.${encodeURIComponent(familyId)}&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.desc&limit=${limit}`;
    const res = await fetch(supabaseUrl("chat_history", query), {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as ChatMessage[];
    // Retornar em ordem cronológica (mais antigas primeiro)
    return data.reverse();
  } catch {
    return [];
  }
}

// ─── Member Memory (Memória de Longo Prazo) ───────────────────────────────────

export interface MemoryFact {
  id?: string;
  family_id: string;
  member_id: string;
  member_name: string;
  fact: string;
  category?: string;
  created_at?: string;
}

export async function saveMemoryFact(fact: MemoryFact): Promise<void> {
  try {
    await fetch(supabaseUrl("member_memory"), {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(fact),
    });
  } catch (err) {
    console.error("[Supabase] Erro ao salvar memória:", err);
  }
}

export async function getMemberMemory(
  familyId: string,
  memberId: string,
  limit = 30
): Promise<MemoryFact[]> {
  try {
    const query = `family_id=eq.${encodeURIComponent(familyId)}&member_id=eq.${encodeURIComponent(memberId)}&order=updated_at.desc&limit=${limit}`;
    const res = await fetch(supabaseUrl("member_memory", query), {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    return await res.json() as MemoryFact[];
  } catch {
    return [];
  }
}

// Extrair fatos importantes da resposta da IA e salvar na memória
export async function extractAndSaveMemory(
  familyId: string,
  memberId: string,
  memberName: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  // Detectar padrões que indicam informações importantes para lembrar
  const patterns = [
    { regex: /tenho\s+(\w+[\w\s]+?)(?:\.|,|$)/gi, category: "saúde" },
    { regex: /sou\s+(alérgico|diabético|hipertenso|vegetariano|vegano)[\w\s]*/gi, category: "saúde" },
    { regex: /meu\s+(?:aniversário|birthday)\s+(?:é|foi|será)\s+([\w\s]+?)(?:\.|,|$)/gi, category: "pessoal" },
    { regex: /trabalho\s+(?:como|em|na|no)\s+([\w\s]+?)(?:\.|,|$)/gi, category: "trabalho" },
    { regex: /(?:gosto|adoro|amo|prefiro)\s+(?:de\s+)?([\w\s]+?)(?:\.|,|$)/gi, category: "preferências" },
    { regex: /(?:não\s+gosto|odeio|detesto)\s+(?:de\s+)?([\w\s]+?)(?:\.|,|$)/gi, category: "preferências" },
    { regex: /moro\s+(?:em|no|na)\s+([\w\s]+?)(?:\.|,|$)/gi, category: "localização" },
  ];

  const facts: string[] = [];
  for (const { regex, category: _cat } of patterns) {
    const matches = userMessage.matchAll(regex);
    for (const match of matches) {
      if (match[0] && match[0].length > 5 && match[0].length < 200) {
        facts.push(match[0].trim());
      }
    }
  }

  // Salvar fatos detectados (máximo 3 por mensagem para não sobrecarregar)
  for (const fact of facts.slice(0, 3)) {
    await saveMemoryFact({
      family_id: familyId,
      member_id: memberId,
      member_name: memberName,
      fact,
      category: "auto",
    });
  }
}

// ─── Family Emotions (Emoções Compartilhadas) ─────────────────────────────────

export interface FamilyEmotion {
  id?: string;
  family_id: string;
  member_id: string;
  member_name: string;
  emoji: string;
  mood: string;
  note?: string;
  created_at?: string;
}

export async function setMemberEmotion(emotion: FamilyEmotion): Promise<boolean> {
  try {
    const res = await fetch(supabaseUrl("family_emotions"), {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(emotion),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getFamilyEmotions(familyId: string): Promise<FamilyEmotion[]> {
  try {
    // Buscar a emoção mais recente de cada membro
    const query = `family_id=eq.${encodeURIComponent(familyId)}&order=created_at.desc&limit=50`;
    const res = await fetch(supabaseUrl("family_emotions", query), {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    const all = await res.json() as FamilyEmotion[];
    // Deduplicar: pegar apenas a emoção mais recente por membro
    const seen = new Set<string>();
    return all.filter((e) => {
      if (seen.has(e.member_id)) return false;
      seen.add(e.member_id);
      return true;
    });
  } catch {
    return [];
  }
}
