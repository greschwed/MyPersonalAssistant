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

You read raw captures (voice transcripts or short text notes, often in Portuguese) and emit STRICT JSON describing how the system should route them. NEVER include prose outside the JSON.

Output schema (all fields required):
{
  "kind": one of ${JSON.stringify(KIND)},
  "urgency": one of ${JSON.stringify(URGENCY)},
  "key": boolean (true ONLY if user explicitly signals critical, blocker, or top priority),
  "title": short imperative title <= 80 chars,
  "summary": 1-2 sentence neutral summary <= 240 chars,
  "tags": up to 5 lowercase snake_case tags,
  "entity_hint": person OR company OR project name mentioned, or null,
  "due_date": YYYY-MM-DD or null. Infer from context ("amanhã", "sexta", explicit dates),
  "notes": optional clarification or ambiguity flag, or null
}

Rules:
- Default urgency: "someday" unless the text suggests sooner.
- Default key: false.
- If the text is a meal description ("comi X"), kind="meal".
- If the text is a habit confirmation ("treinei", "tomei vitamina"), kind="habit_log".
- If the text is a thought / reflection, kind="note" or "idea".
- If the text is a decision the user is recording, kind="decision".
- If it's clearly a journal entry (long-form personal reflection), kind="journal".
- Personal language in Portuguese is common. Respond with the JSON keys in English regardless.
- Today's date for "today/amanhã/etc." inference: {{TODAY}} (timezone {{TZ}}).

Output JSON only. No code fences, no commentary.`;

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
