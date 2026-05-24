import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { USER_ID } from "@/lib/userConfig";
import {
  COL,
  type Scope,
  type ScheduledTo,
  type TaskDoc,
  urgencyToScheduledTo,
} from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  description: string;
  urgency: TaskDoc["urgency"];
  scheduled_to: ScheduledTo;
  key: boolean;
  priority_score: number;
  tags: string[];
  due_date: string | null;
  scope: Scope;
  project: string | null;
  capture_id: string | null;
  createdAt: string | null;
  completed: boolean;
  completedAt: string | null;
};

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { toDate?: () => Date };
  return obj.toDate?.()?.toISOString?.() ?? null;
}

export async function GET(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "open"; // open | done | all

  const snap = await adminDb
    .collection(COL.tasks)
    .where("user_id", "==", USER_ID)
    .get();

  const all: TaskRow[] = snap.docs.map((d) => {
    const data = d.data() as TaskDoc & { scheduled_to?: ScheduledTo };
    const completedAtIso = toIso(data.completed_at);
    const scheduled =
      data.scheduled_to ?? urgencyToScheduledTo(data.urgency, data.due_date ?? null);
    return {
      id: d.id,
      title: data.title ?? "",
      description: data.description ?? "",
      urgency: data.urgency,
      scheduled_to: scheduled,
      key: Boolean(data.key),
      priority_score: data.priority_score ?? 0,
      tags: data.tags ?? [],
      due_date: data.due_date ?? null,
      scope: (data.scope as Scope) ?? "pessoal",
      project: data.project ?? null,
      capture_id: data.capture_id ?? null,
      createdAt: toIso(data.created_at),
      completed: Boolean(completedAtIso),
      completedAt: completedAtIso,
    };
  });

  const filtered = all.filter((t) => {
    if (statusParam === "all") return true;
    if (statusParam === "done") return t.completed;
    return !t.completed;
  });

  // Sort: priority_score desc, then due_date asc, then createdAt desc
  filtered.sort((a, b) => {
    if (a.priority_score !== b.priority_score) return b.priority_score - a.priority_score;
    const ad = a.due_date ?? "9999";
    const bd = b.due_date ?? "9999";
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  // Group by scope, then by project (null project becomes "Sem projeto")
  const grouped: Record<Scope, Record<string, TaskRow[]>> = {
    pessoal: {},
    trabalho: {},
  };
  for (const t of filtered) {
    const proj = t.project ?? "Sem projeto";
    if (!grouped[t.scope][proj]) grouped[t.scope][proj] = [];
    grouped[t.scope][proj].push(t);
  }

  return NextResponse.json({
    ok: true,
    counts: {
      total: filtered.length,
      pessoal: Object.values(grouped.pessoal).reduce((a, b) => a + b.length, 0),
      trabalho: Object.values(grouped.trabalho).reduce((a, b) => a + b.length, 0),
    },
    grouped,
  });
}
