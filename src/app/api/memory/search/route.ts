import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { searchMemory } from "@/lib/firestore/memory";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  const okSecret = headerSecret && headerSecret === process.env.API_SECRET;
  if (!session && !okSecret) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const limit = Number.isFinite(body?.limit) ? Math.min(50, Math.max(1, Number(body.limit))) : 20;
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  try {
    const hits = await searchMemory(query, limit);
    return NextResponse.json({ ok: true, hits });
  } catch (err) {
    console.error("[memory/search] failed:", err);
    const msg = err instanceof Error ? err.message : "search failed";
    // Erro mais comum: índice vector ainda não criado em memory_chunks.embedding
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
