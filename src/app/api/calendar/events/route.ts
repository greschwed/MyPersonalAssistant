import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { listUpcomingEvents, readCalendarSources } from "@/lib/calendar/ical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSessionUser();
  const headerSecret = req.headers.get("x-api-secret");
  if (!session && !(headerSecret && headerSecret === process.env.API_SECRET)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  const sources = readCalendarSources().map((s) => ({
    name: s.name,
    color: s.color,
  }));

  const events = await listUpcomingEvents(days);
  return NextResponse.json(
    { ok: true, days, sources, events },
    { headers: { "cache-control": "no-store" } },
  );
}
