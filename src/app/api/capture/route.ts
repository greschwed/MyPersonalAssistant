import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { ingestCapture } from "@/lib/firestore/captures";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Aceita sessão de usuário OU x-api-secret (já filtrado pelo proxy, mas dupla checagem aqui)
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  const okSecret = headerSecret && headerSecret === process.env.API_SECRET;
  if (!session && !okSecret) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const classification = await classifyCapture(text);
  const result = await ingestCapture({
    source: "web_form",
    rawText: text,
    audioUrl: null,
    transcriptionSource: "none",
    classification,
  });

  return NextResponse.json({
    ok: true,
    capture_id: result.captureId,
    routed_to: result.routedTo,
    routed_id: result.routedId,
    classification,
  });
}
