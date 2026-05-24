import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { searchMemory, type MemoryHit } from "@/lib/firestore/memory";
import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/llm/anthropic";
import { USER_TIMEZONE } from "@/lib/userConfig";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Você é o assistente pessoal do operador do Personal OS, falando em português do Brasil.

Você responde perguntas usando APENAS o contexto que recebe (capturas, tarefas, anotações, refeições, hábitos, ideias do próprio usuário). Quando não houver contexto suficiente, diga claramente que não tem informação e sugira o que o usuário poderia capturar para obter resposta no futuro.

Regras:
- Citar fontes com o ID em colchetes ao final da frase relevante. Ex: "Você anotou que precisa ligar pra mãe [c#3] (há 2 dias)."
- Datas sempre no fuso {{TZ}}; data atual: {{TODAY}}.
- Sem floreio. Resposta direta, no máximo 6 linhas a menos que a pergunta exija mais.
- Se a pergunta for sobre uma lista (mercado, tarefas), retorne a lista em bullets.
- Nunca invente conteúdo que não estiver no contexto.`;

function todayInTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatContext(hits: MemoryHit[]): string {
  if (hits.length === 0) return "(nenhum contexto recuperado)";
  return hits
    .map((h, idx) => {
      const id = `c#${idx + 1}`;
      const cap = h.capture;
      const meta = cap
        ? `kind=${cap.classification.kind} urgency=${cap.classification.urgency} key=${cap.classification.key} criado=${cap.createdAt ?? "?"} source=${cap.source}`
        : `source_type=${h.sourceType}`;
      return `[${id}] (${meta})\n${h.text}`;
    })
    .join("\n\n");
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  const okSecret = headerSecret && headerSecret === process.env.API_SECRET;
  if (!session && !okSecret) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const k = Number.isFinite(body?.k) ? Math.min(30, Math.max(3, Number(body.k))) : 12;
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  let hits: MemoryHit[] = [];
  try {
    hits = await searchMemory(question, k);
  } catch (err) {
    console.error("[ask] memory search failed:", err);
    return NextResponse.json(
      { error: "memory search failed (índice vector criado?)" },
      { status: 500 },
    );
  }

  const system = SYSTEM_PROMPT.replace("{{TZ}}", USER_TIMEZONE).replace("{{TODAY}}", todayInTz());
  const userMessage = `Pergunta: ${question}\n\n=== CONTEXTO ===\n${formatContext(hits)}`;

  try {
    const anthropic = getAnthropic();
    const resp = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const answer = block && "text" in block ? block.text : "";

    return NextResponse.json({
      ok: true,
      answer,
      hits: hits.map((h, idx) => ({
        ref: `c#${idx + 1}`,
        chunkId: h.chunkId,
        sourceType: h.sourceType,
        sourceId: h.sourceId,
        capture: h.capture
          ? {
              rawText: h.capture.rawText,
              kind: h.capture.classification.kind,
              urgency: h.capture.classification.urgency,
              key: h.capture.classification.key,
              createdAt: h.capture.createdAt,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[ask] anthropic failed:", err);
    const msg = err instanceof Error ? err.message : "claude failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
