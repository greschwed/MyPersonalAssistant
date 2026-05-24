import "server-only";

import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/llm/anthropic";
import { OPENAI_CLASSIFIER_MODEL, getOpenAI } from "@/lib/llm/openai";
import { USER_TIMEZONE } from "@/lib/userConfig";
import {
  type Classification,
  KIND,
  URGENCY,
  sanitizeClassification,
} from "@/lib/schema";

const SYSTEM_PROMPT = `You are a classifier for a personal AI dashboard called Personal OS.

You read raw captures (voice transcripts or short text notes, almost always in Brazilian Portuguese) and emit STRICT JSON describing how the system should route them. NEVER include prose outside the JSON.

Output schema (ALL fields required, even if empty/null):
{
  "kind": one of ${JSON.stringify(KIND)},
  "urgency": one of ${JSON.stringify(URGENCY)},
  "key": boolean,
  "title": short title <= 80 chars (imperative for tasks, descriptive for notes/meals),
  "summary": 1-2 sentence neutral summary <= 240 chars,
  "tags": up to 5 lowercase snake_case tags,
  "entity_hint": person OR company OR project name mentioned, or null,
  "due_date": YYYY-MM-DD or null. Infer from context ("amanhã", "sexta", explicit dates),
  "notes": optional clarification, or null,
  "mercado_items": array of strings (lowercase), required ONLY for kind="mercado" or "mercado_purchase", else []
}

=== KIND DEFINITIONS ===

"task" — future intent / something the user WILL DO. Verbs in future: "fazer X", "ligar pra Y", "comprar carro", "ir ao mercado".
"decision" — user recording a choice already made.
"note" — neutral observation/thought, not actionable.
"idea" — proposal, brainstorm.
"journal" — long-form personal reflection.
"meal" — registry of FOOD ALREADY EATEN. Triggers: "comi X", "almocei Y", "tomei café com Z".
"habit_log" — registry of HABIT ALREADY DONE. Triggers: "treinei", "corri X km", "fiz yoga hoje", "tomei vitamina", "meditei".
"mercado" — adding items to grocery shopping list. Triggers: "comprar açúcar", "tá faltando leite", "preciso de feijão", "no mercado: X, Y, Z", "adicionar X na lista de compras".
"mercado_purchase" — registering that user finished grocery shopping. Trigger phrase: "Registrar compra de Mercado" (and close variants like "registrar compras do mercado", "registrar a compra do mercado").
"person" — purely a person reference (rare on its own).

=== URGENCY ===

URGENCY is "attention horizon", not strict deadline. Default reasoning:
- "hoje", "agora", "urgente", "ASAP" → "today"
- short concrete errands without time signal ("comprar açúcar", "ligar pro João") → "today" (small same-day actions)
- "amanhã", "essa semana", "sexta", "até X dias" → "this_week"
- "esse mês", "fim do mês" → "this_month"
- vague intent, no concrete handle → "someday"

For kind="mercado" / "mercado_purchase" / "meal" / "habit_log" → urgency MUST be "someday" (these aren't action items with a horizon).

=== KEY ===
true ONLY when user explicitly signals critical/blocker/top-priority ("urgente", "crítico", "preciso muito"). Default false.

=== MERCADO RULES ===

When kind="mercado":
- Parse ALL items from the text into mercado_items (lowercase, trimmed). Multi-item input is common: "Comprar açúcar, água, yogurte, maçã e banana" → mercado_items=["açúcar","água","yogurte","maçã","banana"].
- title = "Lista de mercado (N itens)" where N = count.
- tags = ["mercado","compras"].
- Big purchases ("comprar carro", "comprar passagem", "comprar curso de yoga") are NOT mercado — they're tasks.
- "Fazer mercado" / "ir ao supermercado" is NOT mercado — it's a task (the action of going).

When kind="mercado_purchase":
- mercado_items = the items explicitly listed AFTER the trigger phrase (e.g., "Registrar compra de mercado: açúcar, banana" → ["açúcar","banana"]). If no items listed, mercado_items=[] (means "mark ALL pending as bought").
- title = "Registrar compra de mercado".
- tags = ["mercado","compras"].

=== CRITICAL DISAMBIGUATION ===

Future intent vs past completion is the #1 source of errors. Be strict:
- "fazer X amanhã" / "vou fazer X" / "amanhã, fazer X" → kind="task" (FUTURE) with due_date inferred.
- "fiz X" / "treinei" / "corri" / "tomei" → kind="habit_log" (PAST).
- "ligar pra X" → kind="task" (intent to do).
- "comi X" → kind="meal".

=== CONTEXT ===
Today's date: {{TODAY}} (timezone {{TZ}}). Use to compute due_date.

Always respond in valid JSON only. No code fences. No commentary. Respond with the JSON keys in English regardless of input language.`;

function todayInTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function renderSystem(): string {
  return SYSTEM_PROMPT
    .replace("{{TODAY}}", todayInTz())
    .replace("{{TZ}}", USER_TIMEZONE);
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function classifyWithAnthropic(text: string): Promise<Classification | null> {
  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: renderSystem(),
      messages: [{ role: "user", content: text }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    const parsed = tryParseJson(raw);
    if (!parsed) return null;
    return sanitizeClassification(parsed, { rawText: text, llmSource: "anthropic" });
  } catch (err) {
    console.error("[classify] anthropic failed:", err);
    return null;
  }
}

async function classifyWithOpenAI(text: string): Promise<Classification | null> {
  try {
    const client = getOpenAI();
    const resp = await client.chat.completions.create({
      model: OPENAI_CLASSIFIER_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: renderSystem() },
        { role: "user", content: text },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? "";
    const parsed = tryParseJson(raw);
    if (!parsed) return null;
    return sanitizeClassification(parsed, { rawText: text, llmSource: "openai" });
  } catch (err) {
    console.error("[classify] openai failed:", err);
    return null;
  }
}

function classifyWithRegex(text: string): Classification {
  const lower = text.toLowerCase();
  const today = /\bhoje\b|\bagora\b|urgente/.test(lower);
  const tomorrow = /amanh[aã]/.test(lower);
  const someday = /algum dia|um dia desses/.test(lower);

  let urgency: Classification["urgency"] = "someday";
  if (today) urgency = "today";
  else if (tomorrow) urgency = "this_week";
  else if (!someday) urgency = "this_month";

  let kind: Classification["kind"] = "note";
  if (/^comi\b|jantar|almoço|caf[eé]\s/.test(lower)) kind = "meal";
  if (/^treinei|treino|corri|caminhei|nadei/.test(lower)) kind = "habit_log";
  if (/decidi|decisão/.test(lower)) kind = "decision";
  if (/lembrar|fazer|tarefa|ligar para|enviar/.test(lower)) kind = "task";

  return sanitizeClassification(
    { kind, urgency, summary: text, title: text.split("\n")[0] },
    { rawText: text, llmSource: "regex" },
  );
}

export async function classifyCapture(text: string): Promise<Classification> {
  const trimmed = text.trim();
  if (!trimmed) {
    return sanitizeClassification(
      { kind: "note", summary: "(empty capture)" },
      { rawText: trimmed, llmSource: "regex" },
    );
  }

  const anthropic = await classifyWithAnthropic(trimmed);
  if (anthropic) return anthropic;

  const openai = await classifyWithOpenAI(trimmed);
  if (openai) return openai;

  return classifyWithRegex(trimmed);
}
