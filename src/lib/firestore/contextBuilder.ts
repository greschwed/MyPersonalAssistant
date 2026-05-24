import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { USER_ID, USER_TIMEZONE, localDateKey } from "@/lib/userConfig";
import {
  COL,
  type BillDoc,
  type MercadoItemDoc,
  type ScheduledTo,
  type TaskDoc,
  urgencyToScheduledTo,
} from "@/lib/schema";

export type LiveState = {
  mercado: { pending: string[]; recentBought: string[]; counts: { pending: number; bought: number } };
  tasks: {
    open: Array<{
      title: string;
      scheduled_to: ScheduledTo;
      due_date: string | null;
      scope: string;
      project: string | null;
      key: boolean;
    }>;
    count: number;
  };
  bills: {
    pendentes: Array<{
      name: string;
      amount: number | null;
      currency: string;
      due_date: string | null;
      category: string;
      daysToDue: number | null;
    }>;
    totalPendente: number;
    totalAtrasado: number;
  };
};

function diffDays(dueIso: string, todayIso: string): number {
  const a = new Date(dueIso + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}

export async function buildLiveState(): Promise<LiveState> {
  const today = localDateKey();
  const db = adminDb;

  // Mercado
  const [mPending, mBought] = await Promise.all([
    db.collection(COL.mercado).where("user_id", "==", USER_ID).where("status", "==", "A Comprar").get(),
    db.collection(COL.mercado).where("user_id", "==", USER_ID).where("status", "==", "Comprado").get(),
  ]);
  const pendingItems = mPending.docs
    .map((d) => d.data() as MercadoItemDoc)
    .map((d) => d.item);
  const boughtItems = mBought.docs
    .map((d) => d.data() as MercadoItemDoc)
    .map((d) => d.item)
    .slice(0, 10);

  // Tasks (open = sem completed_at)
  const tSnap = await db
    .collection(COL.tasks)
    .where("user_id", "==", USER_ID)
    .get();
  const openTasks = tSnap.docs
    .map((d) => d.data() as TaskDoc & { scheduled_to?: ScheduledTo })
    .filter((t) => !t.completed_at)
    .map((t) => ({
      title: t.title,
      scheduled_to: t.scheduled_to ?? urgencyToScheduledTo(t.urgency, t.due_date ?? null),
      due_date: t.due_date ?? null,
      scope: t.scope ?? "pessoal",
      project: t.project ?? null,
      key: Boolean(t.key),
    }));

  // Bills pendentes
  const bSnap = await db
    .collection(COL.bills)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "pendente")
    .get();
  const bills = bSnap.docs.map((d) => {
    const data = d.data() as BillDoc;
    return {
      name: data.name,
      amount: data.amount ?? null,
      currency: data.currency || "BRL",
      due_date: data.due_date ?? null,
      category: data.category ?? "avulsa",
      daysToDue: data.due_date ? diffDays(data.due_date, today) : null,
    };
  });
  const totalPendente = bills.reduce((s, b) => s + (b.amount ?? 0), 0);
  const totalAtrasado = bills
    .filter((b) => (b.daysToDue ?? 1) < 0)
    .reduce((s, b) => s + (b.amount ?? 0), 0);

  return {
    mercado: {
      pending: pendingItems,
      recentBought: boughtItems,
      counts: { pending: pendingItems.length, bought: boughtItems.length },
    },
    tasks: { open: openTasks, count: openTasks.length },
    bills: { pendentes: bills, totalPendente, totalAtrasado },
  };
}

// Formata o LiveState num bloco markdown compacto pra colar no system/user prompt do Claude.
export function liveStateMarkdown(state: LiveState): string {
  const lines: string[] = [];

  lines.push(`=== ESTADO ATUAL (${localDateKey()}, ${USER_TIMEZONE}) ===`);

  lines.push("");
  lines.push(`MERCADO — pendentes (${state.mercado.counts.pending}):`);
  if (state.mercado.pending.length === 0) lines.push("  (vazia)");
  for (const item of state.mercado.pending) lines.push(`  - ${item}`);
  if (state.mercado.recentBought.length > 0) {
    lines.push(`MERCADO — comprados recentes: ${state.mercado.recentBought.join(", ")}`);
  }

  lines.push("");
  lines.push(`TAREFAS abertas (${state.tasks.count}):`);
  if (state.tasks.open.length === 0) lines.push("  (nenhuma)");
  for (const t of state.tasks.open) {
    const dueLabel = t.due_date ? ` (vence ${t.due_date})` : "";
    const proj = t.project ? `[${t.project}] ` : "";
    const keyTag = t.key ? " ★KEY" : "";
    lines.push(`  - [${t.scheduled_to}] [${t.scope}] ${proj}${t.title}${dueLabel}${keyTag}`);
  }

  lines.push("");
  if (state.bills.pendentes.length > 0) {
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
    lines.push(
      `CONTAS PENDENTES (${state.bills.pendentes.length}) — total ${fmt(state.bills.totalPendente)}${state.bills.totalAtrasado > 0 ? `, atrasado ${fmt(state.bills.totalAtrasado)}` : ""}:`,
    );
    for (const b of state.bills.pendentes) {
      const amt = b.amount !== null ? fmt(b.amount) : "—";
      const due = b.due_date
        ? ` vence ${b.due_date}${b.daysToDue !== null ? (b.daysToDue < 0 ? ` (atrasada ${-b.daysToDue}d)` : b.daysToDue === 0 ? " (hoje!)" : ` (${b.daysToDue}d)`) : ""}`
        : "";
      lines.push(`  - ${b.name}: ${amt}${due} (${b.category})`);
    }
  } else {
    lines.push("CONTAS PENDENTES: nenhuma");
  }

  return lines.join("\n");
}
