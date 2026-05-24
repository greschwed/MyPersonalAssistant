// Schema central do Personal OS — Firestore collections + tipos da classificação.
// Tudo que o pipeline de captura escreve passa por aqui.

import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export const URGENCY = ["today", "this_week", "this_month", "someday"] as const;
export type Urgency = (typeof URGENCY)[number];

// Novo modelo de agendamento usado no UI. Substitui urgency na ponta.
// urgency continua sendo derivado a partir daqui pra compatibilidade
// com queries/sort/legacy data.
export const SCHEDULED_TO = [
  "hoje",
  "amanha",
  "esta_semana",
  "este_mes",
  "data_especifica",
] as const;
export type ScheduledTo = (typeof SCHEDULED_TO)[number];

export const SCHEDULED_TO_LABEL: Record<ScheduledTo, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  esta_semana: "Esta semana",
  este_mes: "Este mês",
  data_especifica: "Data específica",
};

export const KIND = [
  "task",
  "decision",
  "note",
  "journal",
  "idea",
  "person",
  "meal",
  "habit_log",
  "mercado",          // adiciona itens à lista de compras de supermercado
  "mercado_purchase", // marca itens da lista como comprados
  "bill",             // conta a pagar (com amount + due_date)
] as const;
export type CaptureKind = (typeof KIND)[number];

export const MERCADO_STATUS = ["A Comprar", "Comprado"] as const;
export type MercadoStatus = (typeof MERCADO_STATUS)[number];

export const SCOPE = ["pessoal", "trabalho"] as const;
export type Scope = (typeof SCOPE)[number];

export const BILL_STATUS = ["pendente", "pago"] as const;
export type BillStatus = (typeof BILL_STATUS)[number];

export const BILL_CATEGORY = ["recorrente", "avulsa"] as const;
export type BillCategory = (typeof BILL_CATEGORY)[number];

export const BILL_RECURRENCE = ["mensal", "anual", "outro"] as const;
export type BillRecurrence = (typeof BILL_RECURRENCE)[number];

export const SOURCE = ["telegram_voice", "telegram_text", "web_form", "api"] as const;
export type CaptureSource = (typeof SOURCE)[number];

// Resultado do classifier (Claude/OpenAI). Schema mínimo, validado antes de gravar.
export type Classification = {
  kind: CaptureKind;
  urgency: Urgency;
  key: boolean;
  summary: string;
  title: string;
  tags: string[];
  entity_hint: string | null; // nome cru se a IA detectar pessoa/empresa
  due_date: string | null; // ISO date YYYY-MM-DD ou null
  llm_source: "anthropic" | "openai" | "regex";
  notes: string | null;
  // Específico de kind="mercado" e kind="mercado_purchase":
  // - mercado: lista de itens a adicionar à lista (1+ itens)
  // - mercado_purchase: itens específicos a marcar como comprados; [] = todos pendentes
  mercado_items: string[];
  // Específico de kind="task" e kind="decision": separação pessoal/trabalho + projeto livre.
  scope: Scope;
  project: string | null;
  // Quando agendado. due_date é auto-derivado pra hoje/amanha, obrigatório pra
  // data_especifica, null pra esta_semana/este_mes.
  scheduled_to: ScheduledTo;
  // Específico de kind="bill": conta a pagar, valor + recorrência.
  bill_amount: number | null;
  bill_currency: string;       // default "BRL"
  bill_category: BillCategory; // "recorrente" | "avulsa"
  bill_recurrence: BillRecurrence | null; // só faz sentido se category="recorrente"
};

// === FIRESTORE TYPES ===

export type RawCaptureDoc = {
  user_id: string;
  source: CaptureSource;
  raw_text: string;
  audio_url: string | null;
  transcription_source: "whisper" | "telegram" | "none";
  classification: Classification;
  routed_to: "tasks" | "daily_logs" | "raw_captures" | "mercado" | "mercado_purchase" | "bills" | null;
  routed_id: string | null;
  routed_ids: string[]; // sempre array (0..N); mercado pode rotear pra múltiplos docs
  created_at: Timestamp | FieldValue;
};

export type TaskDoc = {
  user_id: string;
  title: string;
  description: string;
  urgency: Urgency;          // derivado de scheduled_to, mantido pra compat
  scheduled_to: ScheduledTo; // canonical no UI
  key: boolean;
  priority_score: number;
  tags: string[];
  due_date: string | null;
  owner: string;
  entity_id: string | null;
  capture_id: string | null;
  scope: Scope;             // "pessoal" (default) | "trabalho"
  project: string | null;   // slug ou string livre (ex: "mevo", "casa", "personal-os")
  completed_at: Timestamp | null;
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
};

export type BillDoc = {
  user_id: string;
  name: string;
  amount: number | null;        // null se IA não conseguiu extrair
  currency: string;             // "BRL" default
  category: BillCategory;       // "recorrente" | "avulsa"
  recurrence: BillRecurrence | null;
  due_date: string | null;      // YYYY-MM-DD
  status: BillStatus;           // "pendente" (default) | "pago"
  paid_at: Timestamp | null;
  capture_id: string | null;
  raw_text: string;
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
};

export type EntityDoc = {
  user_id: string;
  name: string;
  kind: "person" | "org" | "project" | "other";
  metadata: Record<string, unknown>;
  created_at: Timestamp | FieldValue;
};

export type DailyLogDoc = {
  user_id: string;
  log_date: string; // YYYY-MM-DD no fuso do usuário
  notes: {
    habits?: { done: string[]; total: number };
    nutrition?: { meals: NutritionMeal[] };
    finance?: FinanceSnapshot | null;
    goals_week_items?: GoalItem[];
    goals_month_items?: GoalItem[];
    journal?: string;
  };
  mood: number | null;
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
};

export type NutritionMeal = {
  id: string;
  t: string; // HH:mm
  n: string; // name
  kcal: number;
  p: number;
  c: number;
  f: number;
  estimated: boolean;
};

export type GoalItem = { id: string; text: string; done: boolean };

export type FinanceSnapshot = {
  net_worth: number;
  currency: string;
  as_of: string; // ISO datetime
  categories: { name: string; total: number }[];
  notes: string | null;
};

export type MemoryChunkDoc = {
  user_id: string;
  source_type: "capture" | "task" | "journal" | "meal" | "decision" | "note";
  source_id: string;
  text: string;
  embedding: FieldValue; // FieldValue.vector(...)
  created_at: Timestamp | FieldValue;
};

export type MercadoItemDoc = {
  user_id: string;
  item: string;
  raw_text: string;
  capture_id: string;
  status: MercadoStatus;
  bought_at: Timestamp | null;
  created_at: Timestamp | FieldValue;
};

export type AuditLogDoc = {
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Timestamp | FieldValue;
};

// === FIRESTORE COLLECTION NAMES ===
export const COL = {
  users: "users",
  entities: "entities",
  rawCaptures: "raw_captures",
  tasks: "tasks",
  dailyLogs: "daily_logs",
  memoryChunks: "memory_chunks",
  auditLog: "audit_log",
  mercado: "mercado",
  bills: "bills",
} as const;

// Validador defensivo do output do LLM — nunca confiar 100%.
export function sanitizeClassification(
  raw: Partial<Classification> & Record<string, unknown>,
  fallback: { rawText: string; llmSource: Classification["llm_source"] },
): Classification {
  const kind = (KIND as readonly string[]).includes(String(raw.kind))
    ? (raw.kind as CaptureKind)
    : "note";
  const urgency = (URGENCY as readonly string[]).includes(String(raw.urgency))
    ? (raw.urgency as Urgency)
    : "someday";

  const summary = typeof raw.summary === "string" && raw.summary.length > 0
    ? raw.summary.slice(0, 280)
    : fallback.rawText.slice(0, 280);
  const title = typeof raw.title === "string" && raw.title.length > 0
    ? raw.title.slice(0, 120)
    : summary.split("\n")[0].slice(0, 120);

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const due = typeof raw.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)
    ? raw.due_date
    : null;

  const entityHint = typeof raw.entity_hint === "string" && raw.entity_hint.trim().length > 0
    ? raw.entity_hint.trim().slice(0, 120)
    : null;

  const mercadoItems = Array.isArray(raw.mercado_items)
    ? raw.mercado_items
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 80)
        .slice(0, 50)
    : [];

  const scope: Scope =
    (SCOPE as readonly string[]).includes(String(raw.scope))
      ? (raw.scope as Scope)
      : "pessoal";

  const scheduledTo: ScheduledTo =
    (SCHEDULED_TO as readonly string[]).includes(String(raw.scheduled_to))
      ? (raw.scheduled_to as ScheduledTo)
      : urgencyToScheduledTo(urgency, due);

  const project = typeof raw.project === "string" && raw.project.trim().length > 0
    ? raw.project.trim().toLowerCase().replace(/[^a-z0-9_\- ]+/g, "").slice(0, 60) || null
    : null;

  const billAmount = typeof raw.bill_amount === "number" && Number.isFinite(raw.bill_amount)
    ? Math.max(0, raw.bill_amount)
    : null;

  const billCurrency = typeof raw.bill_currency === "string" && raw.bill_currency.length >= 3
    ? raw.bill_currency.toUpperCase().slice(0, 3)
    : "BRL";

  const billCategory: BillCategory =
    (BILL_CATEGORY as readonly string[]).includes(String(raw.bill_category))
      ? (raw.bill_category as BillCategory)
      : "avulsa";

  const billRecurrence: BillRecurrence | null =
    (BILL_RECURRENCE as readonly string[]).includes(String(raw.bill_recurrence))
      ? (raw.bill_recurrence as BillRecurrence)
      : null;

  return {
    kind,
    urgency,
    key: Boolean(raw.key),
    summary,
    title,
    tags,
    entity_hint: entityHint,
    due_date: due,
    llm_source: fallback.llmSource,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : null,
    mercado_items: mercadoItems,
    scope,
    project,
    scheduled_to: scheduledTo,
    bill_amount: billAmount,
    bill_currency: billCurrency,
    bill_category: billCategory,
    bill_recurrence: billRecurrence,
  };
}

// === HELPERS scheduled_to <-> urgency / due_date ===

// Calcula due_date no fuso fornecido. Para evitar dependência circular com
// userConfig, recebe tz como parâmetro.
export function dueDateFromScheduledTo(
  scheduled: ScheduledTo,
  explicitDue: string | null,
  tz: string,
): string | null {
  if (scheduled === "data_especifica") return explicitDue;
  if (scheduled === "esta_semana" || scheduled === "este_mes") return null;

  const today = new Date();
  if (scheduled === "amanha") today.setDate(today.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
}

// Para compatibilidade com queries/sort que ainda usam urgency.
export function urgencyFromScheduledTo(scheduled: ScheduledTo): Urgency {
  switch (scheduled) {
    case "hoje":
      return "today";
    case "amanha":
    case "esta_semana":
      return "this_week";
    case "este_mes":
      return "this_month";
    case "data_especifica":
      return "this_week"; // peso médio — data específica pode ser hoje ou longe
  }
}

// Para backfill de tasks legadas (sem scheduled_to).
export function urgencyToScheduledTo(
  urgency: Urgency,
  dueDate: string | null,
): ScheduledTo {
  if (dueDate) return "data_especifica";
  switch (urgency) {
    case "today":
      return "hoje";
    case "this_week":
      return "esta_semana";
    case "this_month":
      return "este_mes";
    case "someday":
      return "este_mes";
  }
}
