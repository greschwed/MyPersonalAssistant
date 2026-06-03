import "server-only";

import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/llm/anthropic";
import { OPENAI_CLASSIFIER_MODEL, getOpenAI } from "@/lib/llm/openai";
import { USER_TIMEZONE } from "@/lib/userConfig";
import {
  type Classification,
  KIND,
  SCHEDULED_TO,
  URGENCY,
  sanitizeClassification,
} from "@/lib/schema";

const SYSTEM_PROMPT = `You are a classifier for a personal AI dashboard called Personal OS.

You read raw captures (voice transcripts or short text notes, almost always in Brazilian Portuguese) and emit STRICT JSON describing how the system should route them. NEVER include prose outside the JSON.

Output schema (ALL fields required, even if empty/null):
{
  "kind": one of ${JSON.stringify(KIND)},
  "urgency": one of ${JSON.stringify(URGENCY)},   // legacy / internal weighting
  "scheduled_to": one of ${JSON.stringify(SCHEDULED_TO)}, // canonical UI value (overrides urgency)
  "key": boolean,
  "title": short title <= 80 chars (imperative for tasks, descriptive for notes/meals),
  "summary": 1-2 sentence neutral summary <= 240 chars,
  "tags": up to 5 lowercase snake_case tags,
  "entity_hint": person OR company OR project name mentioned, or null,
  "due_date": YYYY-MM-DD or null. Infer from context ("amanhã", "sexta", explicit dates),
  "notes": optional clarification, or null,
  "mercado_items": array of strings (lowercase), required ONLY for kind="mercado" or "mercado_purchase", else [],
  "scope": "pessoal" or "trabalho". Default "pessoal". REQUIRED on kind="task" or "decision",
  "project": short slug/string (lowercase) of the project this belongs to (e.g. "mevo", "casa", "personal-os"), or null. Common ones: "mevo" (work), "casa", "personal-os", "filhos", "saude", "financas",
  "bill_amount": number (in the bill's currency, e.g. 350.50) or null. REQUIRED on kind="bill",
  "bill_currency": "BRL" (default for this user) or other ISO 3-letter. REQUIRED on kind="bill",
  "bill_category": "recorrente" or "avulsa". REQUIRED on kind="bill",
  "bill_recurrence": "mensal" / "anual" / "outro" if bill_category="recorrente", else null
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
"mercado_purchase" — registering that user ALREADY BOUGHT items from the grocery list (past tense). Triggers:
  - Full purchase: "Registrar compra de Mercado", "registrar compras do mercado", "fiz a compra do mercado", "terminei o mercado", "comprei tudo da lista".
  - Specific items (past tense): "comprei açúcar e café", "já comprei leite", "marca açúcar como comprado", "tira o feijão da lista, já comprei", "achei o iogurte".
  IMPORTANT: only past tense / completion ("comprei", "já comprei", "marca como comprado", "tira da lista"). Future intent ("comprar X", "tá faltando X") is kind="mercado".
"task_complete" — marking an EXISTING task as done (past tense). Triggers:
  - "fiz a tarefa de X", "concluí X", "terminei X", "finalizei X", "marca X como feita", "marca X como concluída", "tarefa X feita", "já fiz X".
  - Also fires for "liguei pro João" if "ligar pro João" likely exists as a pending task.
  IMPORTANT: distinguish from habit_log. habit_log is for recurring physical activities ("treinei", "corri", "meditei"). task_complete is for one-off action items the user previously created.
  Set: title = the short identifier of the task being completed, stripped of completion verbs (e.g., "fiz a ligação pro João, pode marcar" → title="ligação pro João"). summary = brief explanation. tags=["concluida"]. scheduled_to="este_mes", urgency="someday".
"bill" — conta a pagar com valor e/ou vencimento. Triggers: "boleto X vence dia Y", "pagar conta de luz R$ 350", "fatura cartão R$ 2400 até 15/06", "IPTU 1200 reais", "aluguel R$ 3000 todo dia 5", "internet 99,90 mensal", "Netflix R$ 55 por mês". Big single bills ("multa de trânsito R$ 200") count too.
  IMPORTANTE pra kind="bill": title é APENAS o nome da conta (ex: "Conta de luz", "Aluguel", "Netflix", "IPTU 2026"). Valor vai em bill_amount, vencimento em due_date, recorrência em bill_recurrence. NÃO repita esses campos no title.
"query" — user is asking a question or requesting a listing/status of existing data. DO NOT confuse with task. Triggers:
  - Listings: "liste X", "lista de Y", "mostre meus Z", "ver minhas tarefas", "ver mercado"
  - Status: "quanto tenho em X", "quantos Y", "qual a situação de Z"
  - Questions: anything ending in "?", "tem X?", "ainda preciso de Y?"
  - Time-based queries: "o que tenho pra hoje?", "que reuniões essa semana?"
  - Recall: "o que eu disse sobre X?", "lembra quando eu falei de Y?"
  Title should be the rephrased question, summary a 1-line clarification, tags empty or single-word topic.
  For query, set scheduled_to="este_mes" and urgency="someday" (não tem horizonte de ação).
"person" — purely a person reference (rare on its own).

=== SCHEDULED_TO (CANONICAL — use this) ===

scheduled_to captures WHEN the user plans to handle this item. Set both
scheduled_to AND urgency consistently (they convey the same idea, urgency
is just an old internal field used for sorting).

Mapping rules:
- "hoje", "agora", "urgente", "ASAP" → scheduled_to="hoje" (urgency="today")
- short concrete errands without explicit time ("comprar açúcar", "ligar pro João") → scheduled_to="hoje" (urgency="today")
- "amanhã" → scheduled_to="amanha" (urgency="this_week")
- "essa semana", "essa sexta", "até X dias (X<=7)" → scheduled_to="esta_semana" (urgency="this_week")
- "esse mês", "fim do mês", vago no horizonte de dias-semanas → scheduled_to="este_mes" (urgency="this_month")
- Data específica mencionada (15/06, 28/05, "no dia 20") → scheduled_to="data_especifica" + due_date no formato YYYY-MM-DD (urgency="this_week")
- Sem sinal nenhum e tipo "algum dia" → scheduled_to="este_mes" (urgency="someday")

For kind="mercado" / "mercado_purchase" / "meal" / "habit_log" / "bill" → scheduled_to="este_mes" (no UI horizon dimension), urgency="someday".

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
- mercado_items = the items explicitly mentioned as bought (e.g., "comprei açúcar e café" → ["açúcar","café"]; "Registrar compra de mercado: açúcar, banana" → ["açúcar","banana"]). If no items listed (e.g., "fiz o mercado", "comprei tudo"), mercado_items=[] (means "mark ALL pending as bought").
- title = "Registrar compra de mercado".
- tags = ["mercado","compras"].

When kind="task_complete":
- title = the task identifier (stripped of completion verbs). Examples:
  * "concluí a tarefa de comprar passagem" → title="comprar passagem"
  * "marca como feita a tarefa de ligar pro Pedro" → title="ligar pro Pedro"
  * "terminei o relatório do trimestre" → title="relatório do trimestre"
  * "fiz a apresentação pro cliente" → title="apresentação pro cliente"
- summary = 1 line restating what was done.
- tags = ["concluida"].
- scheduled_to = "este_mes", urgency = "someday" (no horizon needed for a completion).

=== CRITICAL DISAMBIGUATION ===

Future intent vs past completion vs question is the #1 source of errors. Be strict:
- "fazer X amanhã" / "vou fazer X" / "amanhã, fazer X" → kind="task" (FUTURE) with due_date inferred.
- "treinei" / "corri" / "meditei" / "tomei vitamina" → kind="habit_log" (atividade recorrente já feita).
- "fiz a tarefa de X" / "concluí X" / "marca X como feita" / "terminei a apresentação" → kind="task_complete" (marca tarefa one-off já criada).
- "comi X" / "almocei X" / "jantei X" → kind="meal" (refeição já feita).
- "ligar pra X" / "vou ligar pra X" → kind="task" (intent to do).
- "liguei pra X" → kind="task_complete" (action just completed; system tries to match an open task).
- "comprar X" / "tá faltando X" → kind="mercado" (FUTURE shopping intent).
- "comprei X" / "já comprei X" → kind="mercado_purchase" (PAST purchase, marca da lista).
- "liste X" / "que tem na X" / "quantos X" / "?" → kind="query" (perguntando sobre estado, NÃO criar task).
- "Listar lista de compras" / "mostra meu mercado" → kind="query" (pedido de visualização, não tarefa).

=== SCOPE: PESSOAL VS TRABALHO ===

This user works at MEVO (healthtech). REQUIRED on kind="task" or "decision". For other kinds, scope still needed but mostly informational.

Default: "pessoal".

Set scope="trabalho" when ANY of these signals appear:
- Explicit words: "trabalho", "no trampo", "do trabalho", "mevo".
- Mevo-specific vocabulary: "parceiro", "parceiros", "reunião", "sprint", "produto", "feature", "PR", "deploy", "bug", "cliente", "ticket", "demo", "stakeholder", "roadmap", "release".
- Names of Mevo colleagues, squads, or business partners (orgs / labs / clinics / pharmacies).

Set scope="pessoal" when:
- Clearly personal: "casa", "filhos", "esposa", "louise", "saúde", "treino", "viagem", "família", finance items not tied to work, etc.
- Default fallback when no signal.

=== PROJECT ===

Optional short lowercase slug. Examples:
- "mevo" for general Mevo work
- "personal-os" for work on this very dashboard
- "casa" for household tasks
- "louise" for things related to a specific person
- "financas" for personal finance setup tasks (not bills)

Leave null if no clear project.

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
