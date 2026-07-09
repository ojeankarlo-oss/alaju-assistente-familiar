import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio, TranscriptionError } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import {
  saveChatMessage,
  getChatHistory,
  getMemberMemory,
  extractAndSaveMemory,
  setMemberEmotion,
  getFamilyEmotions,
} from "./supabase";

// ─── ElevenLabs TTS helper ────────────────────────────────────────────────────

// Voice ID da Jessica (Playful, Bright, Warm) — funciona bem em pt-BR com eleven_multilingual_v2
const ELEVENLABS_VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

async function generateElevenLabsSpeech(text: string, voiceId?: string): Promise<string | null> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) return null;

  const selectedVoiceId = voiceId || ELEVENLABS_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error("[ElevenLabs] Erro:", res.status, await res.text());
      return null;
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return base64;
  } catch (err) {
    console.error("[ElevenLabs] Exceção:", err);
    return null;
  }
}

// ─── Telegram helper ──────────────────────────────────────────────────────────

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = await res.json() as { ok: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok", supabase: !!ENV.supabaseUrl })),

  assistant: router({
    // Chat com memória persistente via Supabase
    chat: publicProcedure
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          memberName: z.string().optional(),
          memberId: z.string().optional(),       // ID único do membro
          familyId: z.string().optional(),       // ID único da família
          memberRole: z.enum(["adult", "child", "pai", "mãe", "filho", "filha", "avô", "avó", "outro"]).optional(),
          context: z.string().optional(),        // JSON string with family context
          gender: z.enum(["male", "female"]).optional(),
          cycleContext: z.string().optional(),   // Current cycle phase info for female members
        })
      )
      .mutation(async ({ input }) => {
        const isChild = input.memberRole === "child";
        const name = input.memberName || "você";
        const familyId = input.familyId || "default_family";
        const memberId = input.memberId || input.memberName || "default_member";

        // ── 1. Buscar histórico e memória do Supabase ──
        const [chatHistory, memories] = await Promise.all([
          getChatHistory(familyId, memberId, 10),
          getMemberMemory(familyId, memberId, 20),
        ]);

        // ── 2. Montar contexto de memória ──
        const memoryContext = memories.length > 0
          ? `\nO que você já sabe sobre ${name}:\n${memories.map((m) => `- ${m.fact}`).join("\n")}`
          : "";

        // ── 3. Montar system prompt ──
        const systemPrompt = isChild
          ? `Você é uma assistente familiar amigável e educativa chamada "Alaju". 
Você está conversando com uma criança chamada ${name}.
Seja sempre gentil, paciente e use linguagem simples adequada para crianças.
Quando ajudar com lições de escola, explique passo a passo e incentive a criança a tentar resolver.
Nunca dê respostas prontas para exercícios — guie o raciocínio.
Evite qualquer conteúdo inadequado para crianças.
Responda sempre em português brasileiro.${memoryContext}`
          : `Você é uma assistente familiar inteligente e prestativa chamada "Alaju".
Você está conversando com ${name}.
Você pode ajudar com: lembretes, lista de compras, informações sobre saúde e bem-estar, 
chamar aplicativos de corrida, ajudar crianças com estudos e organizar a rotina familiar.
Quando o usuário pedir para criar um lembrete, liste as informações necessárias (o quê, quando).
Quando pedir para adicionar à lista de compras, confirme os itens.
Quando pedir para chamar corrida, pergunte o destino se não foi informado.
Seja direto, útil e amigável. Responda sempre em português brasileiro.
${input.context ? `\nContexto familiar: ${input.context}` : ""}
${input.gender === "female" && input.cycleContext ? `\nContexto do ciclo menstrual de ${name}: ${input.cycleContext}. Use esse contexto para dar dicas mais personalizadas sobre bem-estar, humor, alimentação e autocuidado quando relevante. Seja empática e acolhedora.` : ""}${memoryContext}`;

        // ── 4. Montar histórico de mensagens para a IA ──
        const historyMessages = chatHistory.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        }));

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: input.message },
          ],
        });

        const rawContent = response.choices[0]?.message?.content;
        const text = typeof rawContent === "string" ? rawContent : "Desculpe, não consegui processar sua mensagem.";

        // ── 5. Salvar mensagens no Supabase (não bloqueia a resposta) ──
        Promise.all([
          saveChatMessage({
            family_id: familyId,
            member_id: memberId,
            member_name: name,
            role: "user",
            content: input.message,
          }),
          saveChatMessage({
            family_id: familyId,
            member_id: memberId,
            member_name: name,
            role: "assistant",
            content: text,
          }),
          extractAndSaveMemory(familyId, memberId, name, input.message, text),
        ]).catch((err) => console.error("[Supabase] Erro ao salvar histórico:", err));

        // ── 6. Detectar intenção para ações estruturadas ──
        const lowerMsg = input.message.toLowerCase();
        let action: string | null = null;
        let actionData: Record<string, string> = {};

        if (
          lowerMsg.includes("lembrete") ||
          lowerMsg.includes("lembre") ||
          lowerMsg.includes("me avise") ||
          lowerMsg.includes("me lembre")
        ) {
          action = "create_reminder";
        } else if (
          lowerMsg.includes("lista de compras") ||
          lowerMsg.includes("adicionar") ||
          lowerMsg.includes("comprar") ||
          lowerMsg.includes("adiciona")
        ) {
          action = "add_shopping";
        } else if (
          lowerMsg.includes("uber") ||
          lowerMsg.includes("corrida") ||
          lowerMsg.includes("táxi") ||
          lowerMsg.includes("taxi") ||
          lowerMsg.includes("99") ||
          lowerMsg.includes("transporte")
        ) {
          action = "open_ride_app";
          const destMatch = input.message.match(/(?:para|até|ir (?:para|ao|à))\s+(.+?)(?:\.|$)/i);
          if (destMatch) actionData.destination = destMatch[1].trim();
        } else if (
          lowerMsg.includes("saúde") ||
          lowerMsg.includes("exercício") ||
          lowerMsg.includes("dormi") ||
          lowerMsg.includes("sono") ||
          lowerMsg.includes("água") ||
          lowerMsg.includes("passos")
        ) {
          action = "health_log";
        } else if (
          lowerMsg.includes("lição") ||
          lowerMsg.includes("tarefa") ||
          lowerMsg.includes("escola") ||
          lowerMsg.includes("matéria") ||
          lowerMsg.includes("matemática") ||
          lowerMsg.includes("português") ||
          lowerMsg.includes("ciências")
        ) {
          action = "study_help";
        }

        return { text, action, actionData };
      }),

    // Transcribe audio file
    transcribe: publicProcedure
      .input(z.object({ audioUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: "pt",
        });
        if ("error" in result) {
          throw new Error((result as TranscriptionError).error);
        }
        return { text: result.text };
      }),

    // Upload audio and get URL for transcription
    uploadAudio: publicProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string() }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("mp4") ? "m4a" : "wav";
        const key = `audio/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url };
      }),
  }),

  // ─── Emoções Familiares (estilo Widgetable) ───────────────────────────────
  emotions: router({
    // Definir emoção atual de um membro
    setEmotion: publicProcedure
      .input(
        z.object({
          familyId: z.string().min(1),
          memberId: z.string().min(1),
          memberName: z.string().min(1),
          emoji: z.string().min(1),
          mood: z.string().min(1),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const ok = await setMemberEmotion({
          family_id: input.familyId,
          member_id: input.memberId,
          member_name: input.memberName,
          emoji: input.emoji,
          mood: input.mood,
          note: input.note,
        });
        return { ok };
      }),

    // Buscar emoções atuais de todos os membros da família
    getFamilyEmotions: publicProcedure
      .input(z.object({ familyId: z.string().min(1) }))
      .query(async ({ input }) => {
        const emotions = await getFamilyEmotions(input.familyId);
        return { emotions };
      }),
  }),

  // ─── Memória da IA ────────────────────────────────────────────────────────
  memory: router({
    // Buscar histórico de conversas de um membro
    getChatHistory: publicProcedure
      .input(
        z.object({
          familyId: z.string().min(1),
          memberId: z.string().min(1),
          limit: z.number().min(1).max(100).optional(),
        })
      )
      .query(async ({ input }) => {
        const history = await getChatHistory(input.familyId, input.memberId, input.limit ?? 20);
        return { history };
      }),

    // Buscar memórias de longo prazo de um membro
    getMemberMemory: publicProcedure
      .input(
        z.object({
          familyId: z.string().min(1),
          memberId: z.string().min(1),
        })
      )
      .query(async ({ input }) => {
        const memories = await getMemberMemory(input.familyId, input.memberId);
        return { memories };
      }),
  }),

  tts: router({
    // Gerar áudio via ElevenLabs TTS — retorna base64 do MP3
    speak: publicProcedure
      .input(z.object({ text: z.string().min(1).max(1000), voiceId: z.string().optional() }))
      .mutation(async ({ input }) => {
        const base64 = await generateElevenLabsSpeech(input.text, input.voiceId);
        return { base64, available: base64 !== null };
      }),

    // Listar vozes femininas em português disponíveis no ElevenLabs
    listVoices: publicProcedure
      .query(async () => {
        const apiKey = ENV.elevenLabsApiKey;
        if (!apiKey) return { voices: [], available: false };

        try {
          const res = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": apiKey },
          });
          if (!res.ok) return { voices: [], available: false };

          const data = await res.json() as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string }> };

          const RECOMMENDED = [
            { voice_id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Jovem, calorosa e expressiva" },
            { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Calma, clara e natural" },
            { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "Sofisticada e articulada" },
            { voice_id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "Amigável e energética" },
            { voice_id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", description: "Animada e expressiva" },
          ];

          const availableIds = new Set(data.voices.map((v) => v.voice_id));
          const voices = RECOMMENDED.map((v) => ({
            ...v,
            available: availableIds.has(v.voice_id),
          }));

          return { voices, available: true };
        } catch {
          return { voices: [], available: false };
        }
      }),
  }),

  telegram: router({
    // Send shopping list to Telegram
    sendShoppingList: publicProcedure
      .input(
        z.object({
          botToken: z.string().min(1),
          chatId: z.string().min(1),
          items: z.array(z.object({ name: z.string(), quantity: z.string().optional(), checked: z.boolean() })),
          listName: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const header = `🛒 *${input.listName || "Lista de Compras"}*\n\n`;
        const itemLines = input.items
          .map((i) => {
            const qty = i.quantity ? ` (${i.quantity})` : "";
            const done = i.checked ? "✅" : "⬜";
            return `${done} ${i.name}${qty}`;
          })
          .join("\n");
        const footer = `\n\n_Enviado pelo Alaju_ 🏠`;
        const text = header + itemLines + footer;
        const ok = await sendTelegramMessage(input.botToken, input.chatId, text);
        return { ok };
      }),

    // Send a reminder notification to Telegram
    sendReminder: publicProcedure
      .input(
        z.object({
          botToken: z.string().min(1),
          chatId: z.string().min(1),
          title: z.string(),
          description: z.string().optional(),
          memberName: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const who = input.memberName ? ` para *${input.memberName}*` : "";
        const desc = input.description ? `\n📝 ${input.description}` : "";
        const text = `⏰ *Lembrete${who}*\n\n${input.title}${desc}\n\n_Alaju_ 🏠`;
        const ok = await sendTelegramMessage(input.botToken, input.chatId, text);
        return { ok };
      }),

    // Send a custom message
    sendMessage: publicProcedure
      .input(
        z.object({
          botToken: z.string().min(1),
          chatId: z.string().min(1),
          text: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const ok = await sendTelegramMessage(input.botToken, input.chatId, input.text);
        return { ok };
      }),

    // Test Telegram connection
    testConnection: publicProcedure
      .input(z.object({ botToken: z.string().min(1), chatId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const ok = await sendTelegramMessage(
          input.botToken,
          input.chatId,
          "✅ *Alaju* conectada com sucesso! 🏠"
        );
        return { ok };
      }),
  }),
});

export type AppRouter = typeof appRouter;
