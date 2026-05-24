// Schema central do Personal OS — Firestore collections + tipos da classificação.
// Tudo que o pipeline de captura escreve passa por aqui.

import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export const URGENCY = ["today", "this_week", "this_month", "someday"] as const;
export type Urgency = (typeof URGENCY)[number];

export const KIND = [
  "task",
  "decision",
  "note",
  "journal",
  "idea",
  "person",
  "meal",
  "habit_log",
] as const;
export type CaptureKind = (typeof KIND)[number];

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
};

// === FIRESTORE TYPES ===

export type RawCaptureDoc = {
  user_id: string;
  source: CaptureSource;
  raw_text: string;
  audio_url: string | null;
  transcription_source: "whisper" | "telegram" | "none";
  classification: Classification;
  routed_to: "tasks" | "daily_logs" | "raw_captures" | null;
  routed_id: string | null;
  created_at: Timestamp | FieldValue;
};

export type TaskDoc = {
  user_id: string;
  title: string;
  description: string;
  urgency: Urgency;
  key: boolean;
  priority_score: number;
  tags: string[];
  due_date: string | null;
  owner: string;
  entity_id: string | null;
  capture_id: string | null;
  completed_at: Timestamp | null;
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
  };
}
