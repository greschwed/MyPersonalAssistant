import "server-only";

import { cookies } from "next/headers";
import { adminAuth } from "./admin";
import { isUidAllowed } from "../userConfig";

export const SESSION_COOKIE = "__session";
const FIVE_DAYS = 60 * 60 * 24 * 5 * 1000;

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: FIVE_DAYS });
}

export type SessionUser = { uid: string; email: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    if (!isUidAllowed(decoded.uid)) return null;
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: FIVE_DAYS / 1000,
  };
}
