import "server-only";

import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/llm/anthropic";
import { USER_TIMEZONE, localDateKey } from "@/lib/userConfig";
import { buildLiveState, liveStateMarkdown } from "@/lib/firestore/contextBuilder";
import { searchMemory, type MemoryHit } from "@/lib/firestore/memory";

const SYSTEM_PROMPT = `Você é o assistente pessoal do operador do Personal OS, falando português do Brasil.

Você responde perguntas USANDO APENAS:
1. O bloco "ESTADO ATUAL" (snapshot ao vivo do Firestore: lista de mercado, tarefas abertas, contas pendentes).
2. O bloco "MEMÓRIA SEMÂNTICA" (capturas passadas recuperadas por similaridade vetorial).

Regras de resposta:
- Resposta MUITO direta e curta — vai aparecer no Telegram ou no mobile. Máximo 8 linhas a menos que a pergunta exija mais.
- Liste em bullets quando a pergunta for listagem.
- Sempre confie no "ESTADO ATUAL" sobre o estado presente das coleções. A "MEMÓRIA" tem registros de quando o item foi capturado — não use ela pra contar quantos itens existem agora.
- Se a pergunta pedir o estado de algo (mercado, tarefas, contas), responda a partir do ESTADO ATUAL.
- Se a pergunta for sobre passado/recordações ("o que eu disse sobre X", "quando eu falei de Y"), use a MEMÓRIA com citações [c#N].
- Se nenhuma das duas fontes responder, diga isso brevemente.
- NUNCA invente conteúdo. Não tem fonte → não responde.
- Datas no fuso {{TZ}}; hoje é {{TODAY}}.`;

function todayInTz(): string {
  return localDateKey();
}

function formatMemory(hits: MemoryHit[]): string {
  if (hits.length === 0) return "(nenhuma memória relevante)";
  return hits
    .map((h, idx) => {
      const id = `c#${idx + 1}`;
      const cap = h.capture;
      const meta = cap
        ? `kind=${cap.classification.kind}${cap.classification.key ? " KEY" : ""} criado=${cap.createdAt ?? "?"}`
        : `source_type=${h.sourceType}`;
      return `[${id}] (${meta})\n${h.text}`;
    })
    .join("\n\n");
}

export type AnswerResult = {
  answer: string;
  hits: MemoryHit[];
};

export async function answerQuestion(
  question: string,
  opts: { memoryK?: number } = {},
): Promise<AnswerResult> {
  const k = opts.memoryK ?? 10;
  const [state, hits] = await Promise.all([
    buildLiveState(),
    searchMemory(question, k).catch((err) => {
      console.error("[answerQuestion] memory search failed:", err);
      return [] as MemoryHit[];
    }),
  ]);

  const userMessage = [
    `Pergunta: ${question}`,
    "",
    liveStateMarkdown(state),
    "",
    "=== MEMÓRIA SEMÂNTICA ===",
    formatMemory(hits),
  ].join("\n");

  const system = SYSTEM_PROMPT
    .replace("{{TODAY}}", todayInTz())
    .replace("{{TZ}}", USER_TIMEZONE);

  const anthropic = getAnthropic();
  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = resp.content.find((b) => b.type === "text");
  const answer = block && "text" in block ? block.text.trim() : "(sem resposta)";
  return { answer, hits };
}
