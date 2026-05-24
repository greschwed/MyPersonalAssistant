import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { answerQuestion } from "@/lib/llm/answerQuestion";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  const okSecret = headerSecret && headerSecret === process.env.API_SECRET;
  if (!session && !okSecret) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const k = Number.isFinite(body?.k) ? Math.min(30, Math.max(3, Number(body.k))) : 10;
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  try {
    const { answer, hits } = await answerQuestion(question, { memoryK: k });
    return NextResponse.json({
      ok: true,
      answer,
      hits: hits.map((h, idx) => ({
        ref: `c#${idx + 1}`,
        chunkId: h.chunkId,
        sourceType: h.sourceType,
        sourceId: h.sourceId,
        capture: h.capture
          ? {
              rawText: h.capture.rawText,
              kind: h.capture.classification.kind,
              urgency: h.capture.classification.urgency,
              key: h.capture.classification.key,
              createdAt: h.capture.createdAt,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[ask] failed:", err);
    const msg = err instanceof Error ? err.message : "ask failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
