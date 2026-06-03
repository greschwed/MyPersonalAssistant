import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { USER_ID } from "@/lib/userConfig";
import { COL, MERCADO_STATUS, type MercadoItemDoc, type MercadoStatus } from "@/lib/schema";

export const runtime = "nodejs";

type PatchBody = {
  status?: MercadoStatus; // "A Comprar" | "Comprado"
  bought?: boolean;       // atalho: true → "Comprado"; false → "A Comprar"
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  let nextStatus: MercadoStatus | null = null;
  if (typeof body.bought === "boolean") {
    nextStatus = body.bought ? "Comprado" : "A Comprar";
  } else if (typeof body.status === "string" && (MERCADO_STATUS as readonly string[]).includes(body.status)) {
    nextStatus = body.status;
  }
  if (!nextStatus) {
    return NextResponse.json({ error: "status ou bought obrigatório" }, { status: 400 });
  }

  const ref = adminDb.collection(COL.mercado).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const cur = snap.data() as MercadoItemDoc;
  if (cur.user_id !== USER_ID) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = { status: nextStatus };
  update.bought_at = nextStatus === "Comprado" ? FieldValue.serverTimestamp() : null;

  await ref.update(update);

  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "mercado_update",
    resource_type: "mercado_item",
    resource_id: id,
    metadata: { status: nextStatus, item: cur.item },
    created_at: FieldValue.serverTimestamp(),
  });

  const fresh = await ref.get();
  return NextResponse.json({ ok: true, item: { id, ...fresh.data() } });
}
