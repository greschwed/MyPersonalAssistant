import { NextResponse } from "next/server";
import { gatherBriefing, renderBriefing } from "@/lib/briefing";
import { sendMessage } from "@/lib/telegram";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { COL } from "@/lib/schema";
import { USER_ID } from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel envia Authorization: Bearer ${CRON_SECRET} pra crons configuradas no vercel.json.
// Aceitamos GET (cron padrão) e POST (manual via UI/curl).
async function handle(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const headerSecret = req.headers.get("x-cron-secret"); // opcional, pra trigger manual
  const expected = process.env.CRON_SECRET;
  const okBearer = !!expected && auth === `Bearer ${expected}`;
  const okHeader = !!expected && headerSecret === expected;
  // Em dev local também aceitamos API_SECRET pra facilitar smoke test
  const apiSecret = req.headers.get("x-api-secret");
  const okApi = !!process.env.API_SECRET && apiSecret === process.env.API_SECRET;

  if (!okBearer && !okHeader && !okApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_USER_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_USER_ID ausente" },
      { status: 500 },
    );
  }

  // dryRun via query param: gera o texto mas não envia
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const withAI = url.searchParams.get("ai") !== "0"; // default ligado

  let text: string;
  try {
    const data = await gatherBriefing();
    text = await renderBriefing(data, { withAI });
  } catch (err) {
    console.error("[cron:briefing] gather failed:", err);
    return NextResponse.json({ error: "gather failed" }, { status: 500 });
  }

  if (!dryRun) {
    try {
      await sendMessage({ chatId: Number(chatId), text });
    } catch (err) {
      console.error("[cron:briefing] sendMessage failed:", err);
      return NextResponse.json({ error: "send failed", text }, { status: 502 });
    }
  }

  // Audit log
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "morning_briefing",
    resource_type: "cron",
    resource_id: null,
    metadata: { chars: text.length, dryRun, withAI },
    created_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, dryRun, text });
}

export const GET = handle;
export const POST = handle;
