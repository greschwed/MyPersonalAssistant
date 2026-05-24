import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { USER_ID, USER_TIMEZONE } from "@/lib/userConfig";
import {
  COL,
  SCHEDULED_TO,
  SCOPE,
  dueDateFromScheduledTo,
  urgencyFromScheduledTo,
  type ScheduledTo,
  type Scope,
  type TaskDoc,
} from "@/lib/schema";

export const runtime = "nodejs";

type PatchBody = {
  title?: string;
  description?: string;
  scheduled_to?: ScheduledTo;
  due_date?: string | null;     // YYYY-MM-DD; só usado quando scheduled_to=data_especifica
  key?: boolean;
  scope?: Scope;
  project?: string | null;
  tags?: string[];
  completed?: boolean;          // true → seta completed_at=now; false → null
};

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const ref = adminDb.collection(COL.tasks).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  const cur = snap.data() as TaskDoc;
  if (cur.user_id !== USER_ID) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const update: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };
  const audit: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim().length > 0) {
    update.title = body.title.trim().slice(0, 200);
    audit.title = update.title;
  }
  if (typeof body.description === "string") {
    update.description = body.description.slice(0, 2000);
    audit.description_changed = true;
  }
  if (typeof body.key === "boolean") {
    update.key = body.key;
    audit.key = body.key;
  }
  if (typeof body.scope === "string" && (SCOPE as readonly string[]).includes(body.scope)) {
    update.scope = body.scope;
    audit.scope = body.scope;
  }
  if (body.project === null) {
    update.project = null;
    audit.project = null;
  } else if (typeof body.project === "string") {
    update.project = body.project.trim().toLowerCase().slice(0, 60) || null;
    audit.project = update.project;
  }
  if (Array.isArray(body.tags)) {
    update.tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"))
      .filter(Boolean)
      .slice(0, 8);
  }

  // scheduled_to + due_date: tratados juntos pra manter consistência
  if (typeof body.scheduled_to === "string" && (SCHEDULED_TO as readonly string[]).includes(body.scheduled_to)) {
    const scheduled = body.scheduled_to as ScheduledTo;
    // due_date explícita só quando data_especifica; senão derivar
    const explicit = body.due_date !== undefined
      ? (body.due_date === null || isYmd(body.due_date) ? body.due_date : null)
      : cur.due_date ?? null;
    const due = dueDateFromScheduledTo(scheduled, explicit, USER_TIMEZONE);
    update.scheduled_to = scheduled;
    update.due_date = due;
    update.urgency = urgencyFromScheduledTo(scheduled); // mantém compat
    audit.scheduled_to = scheduled;
    audit.due_date = due;
    if (scheduled === "data_especifica" && !due) {
      return NextResponse.json(
        { error: "data_especifica requer due_date" },
        { status: 400 },
      );
    }
  } else if (body.due_date !== undefined && (body.due_date === null || isYmd(body.due_date))) {
    // mudou só a data sem mexer em scheduled_to → assumir data_especifica
    update.due_date = body.due_date;
    if (body.due_date !== null) {
      update.scheduled_to = "data_especifica" as ScheduledTo;
      update.urgency = urgencyFromScheduledTo("data_especifica");
    }
    audit.due_date = body.due_date;
  }

  // completed: marca/desmarca
  if (typeof body.completed === "boolean") {
    update.completed_at = body.completed ? FieldValue.serverTimestamp() : null;
    audit.completed = body.completed;
  }

  await ref.update(update);

  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "task_update",
    resource_type: "task",
    resource_id: id,
    metadata: audit,
    created_at: FieldValue.serverTimestamp(),
  });

  const fresh = await ref.get();
  return NextResponse.json({ ok: true, task: { id, ...fresh.data() } });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ref = adminDb.collection(COL.tasks).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  const cur = snap.data() as TaskDoc;
  if (cur.user_id !== USER_ID) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await ref.delete();
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "task_delete",
    resource_type: "task",
    resource_id: id,
    metadata: { title: cur.title },
    created_at: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}
