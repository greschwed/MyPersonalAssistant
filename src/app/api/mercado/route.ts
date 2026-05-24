import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { USER_ID } from "@/lib/userConfig";
import { COL, type MercadoItemDoc } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  item: string;
  status: MercadoItemDoc["status"];
  createdAt: string | null;
  boughtAt: string | null;
};

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { toDate?: () => Date };
  return obj.toDate?.()?.toISOString?.() ?? null;
}

export async function GET(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  const okSecret = headerSecret && headerSecret === process.env.API_SECRET;
  if (!session && !okSecret) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Pendentes (mais novos primeiro)
  const pendingSnap = await adminDb
    .collection(COL.mercado)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "A Comprar")
    .get();

  const pending: Row[] = pendingSnap.docs
    .map((d) => {
      const data = d.data() as MercadoItemDoc;
      return {
        id: d.id,
        item: data.item,
        status: data.status,
        createdAt: toIso(data.created_at),
        boughtAt: null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  // Comprados recentes (top 20)
  const boughtSnap = await adminDb
    .collection(COL.mercado)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "Comprado")
    .get();

  const bought: Row[] = boughtSnap.docs
    .map((d) => {
      const data = d.data() as MercadoItemDoc;
      return {
        id: d.id,
        item: data.item,
        status: data.status,
        createdAt: toIso(data.created_at),
        boughtAt: toIso(data.bought_at),
      };
    })
    .sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""))
    .slice(0, 20);

  return NextResponse.json({
    ok: true,
    pending,
    bought,
    counts: { pending: pending.length, bought: bought.length },
  });
}
