import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  SESSION_COOKIE,
  createSessionCookie,
  sessionCookieOptions,
} from "@/lib/firebase/session";
import { isUidAllowed } from "@/lib/userConfig";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "missing idToken" }, { status: 400 });
  }

  const decoded = await adminAuth.verifyIdToken(idToken).catch(() => null);
  if (!decoded) {
    return NextResponse.json({ error: "invalid idToken" }, { status: 401 });
  }

  if (!isUidAllowed(decoded.uid)) {
    return NextResponse.json({ error: "unauthorized uid" }, { status: 403 });
  }

  const cookieValue = await createSessionCookie(idToken);
  const res = NextResponse.json({ ok: true, uid: decoded.uid });
  res.cookies.set({ ...sessionCookieOptions(), value: cookieValue });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: "", maxAge: 0 });
  return res;
}

export async function GET() {
  return NextResponse.json({ cookie: SESSION_COOKIE });
}
