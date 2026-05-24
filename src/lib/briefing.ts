import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { USER_ID, USER_TIMEZONE, localDateKey } from "@/lib/userConfig";
import {
  COL,
  type BillDoc,
  type ScheduledTo,
  type TaskDoc,
  urgencyToScheduledTo,
} from "@/lib/schema";
import { listUpcomingEvents, type CalendarEvent } from "@/lib/calendar/ical";
import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/llm/anthropic";

function diffDays(dueIso: string, todayIso: string): number {
  const a = new Date(dueIso + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}

function timeBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: USER_TIMEZONE,
  }).format(new Date(iso));
}

// Heurística: se o evento começa às 00:00 no fuso e dura múltiplo de 24h, trata como "dia todo".
// Cobre o caso de feeds iCal do Google Calendar que servem all-day como datetime UTC sem VALUE=DATE.
function isLikelyAllDay(ev: CalendarEvent): boolean {
  if (ev.allDay) return true;
  const startHHMM = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: USER_TIMEZONE,
  }).format(new Date(ev.start));
  if (startHHMM !== "00:00") return false;
  const startMs = new Date(ev.start).getTime();
  const endMs = new Date(ev.end).getTime();
  const durationHours = (endMs - startMs) / 3_600_000;
  return durationHours >= 23.5 && Number.isFinite(durationHours);
}

// Tira valores monetários e referências de data do nome da conta quando o classifier
// jogou tudo no título. Mantém só o "nome humano" da conta.
function cleanBillName(name: string): string {
  return (
    name
      .replace(/\s*R\$\s*[\d.,]+(?:\s*(?:reais|brl))?/gi, "")
      .replace(/\s*vence\s+(?:dia\s+)?\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/gi, "")
      .replace(/\s*(?:mensal|anual|recorrente)/gi, "")
      .replace(/\s*,?\s*$/, "")
      .trim() || name
  );
}

function dateKeyFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function weekdayLong(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: USER_TIMEZONE,
  }).format(new Date());
}

type Briefing = {
  tasksToday: Array<{ title: string; scope: string; key: boolean; project: string | null }>;
  tasksOverdue: Array<{ title: string; due_date: string; daysOverdue: number; scope: string }>;
  billsDueSoon: Array<{ name: string; amount: number | null; daysToDue: number | null; state: "atrasada" | "hoje" | "amanha" | "semana" }>;
  events: CalendarEvent[];
  mercadoPendingCount: number;
};

export async function gatherBriefing(): Promise<Briefing> {
  const today = localDateKey();
  const db = adminDb;

  // Tasks
  const tSnap = await db.collection(COL.tasks).where("user_id", "==", USER_ID).get();
  const open = tSnap.docs
    .map((d) => d.data() as TaskDoc & { scheduled_to?: ScheduledTo })
    .filter((t) => !t.completed_at);

  const tasksToday: Briefing["tasksToday"] = [];
  const tasksOverdue: Briefing["tasksOverdue"] = [];

  for (const t of open) {
    const scheduled = t.scheduled_to ?? urgencyToScheduledTo(t.urgency, t.due_date ?? null);
    const due = t.due_date ?? null;
    const isToday = scheduled === "hoje" || due === today;
    const isOverdue = !!due && due < today;
    if (isOverdue) {
      tasksOverdue.push({
        title: t.title,
        due_date: due!,
        daysOverdue: diffDays(today, due!),
        scope: t.scope ?? "pessoal",
      });
    } else if (isToday) {
      tasksToday.push({
        title: t.title,
        scope: t.scope ?? "pessoal",
        key: Boolean(t.key),
        project: t.project ?? null,
      });
    }
  }
  // KEY primeiro
  tasksToday.sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0));

  // Bills due soon (hoje, amanhã, essa semana, atrasadas)
  const bSnap = await db
    .collection(COL.bills)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "pendente")
    .get();
  const billsDueSoon: Briefing["billsDueSoon"] = [];
  for (const d of bSnap.docs) {
    const data = d.data() as BillDoc;
    if (!data.due_date) continue;
    const days = diffDays(data.due_date, today);
    let state: Briefing["billsDueSoon"][number]["state"] | null = null;
    if (days < 0) state = "atrasada";
    else if (days === 0) state = "hoje";
    else if (days === 1) state = "amanha";
    else if (days <= 7) state = "semana";
    if (!state) continue;
    billsDueSoon.push({
      name: data.name,
      amount: data.amount ?? null,
      daysToDue: days,
      state,
    });
  }
  billsDueSoon.sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0));

  // Calendar events (hoje só)
  const events = (await listUpcomingEvents(1).catch(() => [])).filter(
    (ev) => dateKeyFromIso(ev.start) === today,
  );
  events.sort((a, b) => a.start.localeCompare(b.start));

  // Mercado count
  const mSnap = await db
    .collection(COL.mercado)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "A Comprar")
    .get();

  return {
    tasksToday,
    tasksOverdue,
    billsDueSoon,
    events,
    mercadoPendingCount: mSnap.size,
  };
}

async function generateOpener(b: Briefing): Promise<string> {
  // 1 linha de saudação personalizada (cheap, ~50 tokens)
  try {
    const summary = [
      `${b.tasksToday.length} tarefas hoje`,
      b.tasksOverdue.length > 0 ? `${b.tasksOverdue.length} atrasadas` : null,
      b.billsDueSoon.filter((x) => x.state === "hoje" || x.state === "atrasada").length > 0
        ? "contas vencendo"
        : null,
      b.events.length > 0 ? `${b.events.length} eventos` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const anthropic = getAnthropic();
    const resp = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 80,
      system:
        "Você é o assistente pessoal do operador. Escreva UMA única linha curta de saudação matinal em português do Brasil, com tom leve e direto. NÃO use emojis no opener. NÃO inclua a data. Máximo 120 chars.",
      messages: [
        {
          role: "user",
          content: `Dia: ${weekdayLong()}. Resumo do que tem hoje: ${summary || "agenda leve"}. Escreva só uma frase de bom dia que dê o tom do dia.`,
        },
      ],
    });
    const block = resp.content.find((b2) => b2.type === "text");
    const text = block && "text" in block ? block.text.trim().split("\n")[0] : "";
    return text || "Bom dia.";
  } catch {
    return "Bom dia.";
  }
}

export async function renderBriefing(b: Briefing, opts: { withAI?: boolean } = {}): Promise<string> {
  const lines: string[] = [];
  const opener = opts.withAI ? await generateOpener(b) : "Bom dia.";
  lines.push(opener);
  lines.push("");
  lines.push(`📅 ${weekdayLong()}`);

  // Eventos
  if (b.events.length > 0) {
    lines.push("");
    lines.push("🗓 AGENDA HOJE");
    for (const ev of b.events) {
      const t = isLikelyAllDay(ev) ? "dia todo" : timeBR(ev.start);
      lines.push(`  ${t} · ${ev.title}`);
    }
  }

  // Atrasadas (tasks)
  if (b.tasksOverdue.length > 0) {
    lines.push("");
    lines.push(`⚠️ TAREFAS ATRASADAS (${b.tasksOverdue.length})`);
    for (const t of b.tasksOverdue.slice(0, 5)) {
      const scopeTag = t.scope === "trabalho" ? "[trab]" : "[pes]";
      lines.push(`  ${scopeTag} ${t.title} (${t.daysOverdue}d)`);
    }
    if (b.tasksOverdue.length > 5) lines.push(`  + ${b.tasksOverdue.length - 5} outras`);
  }

  // Tasks hoje
  if (b.tasksToday.length > 0) {
    lines.push("");
    lines.push(`✅ TAREFAS HOJE (${b.tasksToday.length})`);
    for (const t of b.tasksToday) {
      const scopeTag = t.scope === "trabalho" ? "[trab]" : "[pes]";
      const star = t.key ? " ⭐" : "";
      const projTag = t.project ? ` (${t.project})` : "";
      lines.push(`  ${scopeTag} ${t.title}${projTag}${star}`);
    }
  }

  // Bills
  if (b.billsDueSoon.length > 0) {
    lines.push("");
    lines.push("💳 CONTAS A PAGAR");
    for (const bill of b.billsDueSoon) {
      const amt = bill.amount !== null ? fmtBRL(bill.amount) : "—";
      let when: string;
      if (bill.state === "atrasada") when = `atrasada ${-(bill.daysToDue ?? 0)}d`;
      else if (bill.state === "hoje") when = "vence HOJE";
      else if (bill.state === "amanha") when = "vence amanhã";
      else when = `vence em ${bill.daysToDue}d`;
      lines.push(`  ${cleanBillName(bill.name)} · ${amt} · ${when}`);
    }
  }

  // Mercado
  if (b.mercadoPendingCount > 0) {
    lines.push("");
    lines.push(`🛒 Mercado: ${b.mercadoPendingCount} item${b.mercadoPendingCount === 1 ? "" : "s"} pendente${b.mercadoPendingCount === 1 ? "" : "s"}`);
  }

  // Nada de relevante
  if (
    b.tasksToday.length === 0 &&
    b.tasksOverdue.length === 0 &&
    b.billsDueSoon.length === 0 &&
    b.events.length === 0
  ) {
    lines.push("");
    lines.push("Sem compromissos hoje. Dia em aberto.");
  }

  return lines.join("\n");
}
