import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { USER_ID, localDateKey } from "@/lib/userConfig";
import { COL, type BillDoc } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BillRow = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  category: BillDoc["category"];
  recurrence: BillDoc["recurrence"];
  due_date: string | null;
  status: BillDoc["status"];
  paid_at: string | null;
  createdAt: string | null;
  // Computed:
  daysToDue: number | null;        // negativo se vencido
  state: "atrasada" | "a_vencer" | "agendada" | "sem_data"; // visual cue (computed)
};

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { toDate?: () => Date };
  return obj.toDate?.()?.toISOString?.() ?? null;
}

function diffDays(dueIso: string, todayIso: string): number {
  // Both YYYY-MM-DD. Returns due - today (negative = vencido).
  const a = new Date(dueIso + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}

export async function GET(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const today = localDateKey();

  const snap = await adminDb
    .collection(COL.bills)
    .where("user_id", "==", USER_ID)
    .get();

  const all: BillRow[] = snap.docs.map((d) => {
    const data = d.data() as BillDoc;
    const days = data.due_date ? diffDays(data.due_date, today) : null;
    let state: BillRow["state"] = "sem_data";
    if (data.status === "pendente") {
      if (days === null) state = "sem_data";
      else if (days < 0) state = "atrasada";
      else if (days <= 7) state = "a_vencer";
      else state = "agendada";
    }
    return {
      id: d.id,
      name: data.name ?? "(sem nome)",
      amount: data.amount ?? null,
      currency: data.currency ?? "BRL",
      category: data.category ?? "avulsa",
      recurrence: data.recurrence ?? null,
      due_date: data.due_date ?? null,
      status: data.status ?? "pendente",
      paid_at: toIso(data.paid_at),
      createdAt: toIso(data.created_at),
      daysToDue: days,
      state,
    };
  });

  const pendentes = all
    .filter((b) => b.status === "pendente")
    .sort((a, b) => {
      // atrasada primeiro, depois por due_date asc
      const aw = a.state === "atrasada" ? 0 : a.state === "a_vencer" ? 1 : 2;
      const bw = b.state === "atrasada" ? 0 : b.state === "a_vencer" ? 1 : 2;
      if (aw !== bw) return aw - bw;
      const ad = a.due_date ?? "9999";
      const bd = b.due_date ?? "9999";
      return ad.localeCompare(bd);
    });

  const pagas = all
    .filter((b) => b.status === "pago")
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))
    .slice(0, 10);

  const totalPendente = pendentes.reduce(
    (sum, b) => sum + (b.amount ?? 0),
    0,
  );
  const totalAtrasado = pendentes
    .filter((b) => b.state === "atrasada")
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);

  return NextResponse.json({
    ok: true,
    today,
    pendentes,
    pagas,
    totals: {
      pendente: totalPendente,
      atrasado: totalAtrasado,
      pendenteCount: pendentes.length,
      atrasadoCount: pendentes.filter((b) => b.state === "atrasada").length,
    },
  });
}
