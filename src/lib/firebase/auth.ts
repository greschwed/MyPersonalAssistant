"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./client";

const provider = new GoogleAuthProvider();
// Força a tela de seleção de conta em todo login (útil quando o gate rejeitar
// uma conta — sem isso, o Google reusa a última conta automaticamente).
provider.setCustomParameters({ prompt: "select_account" });

export class UnauthorizedAccountError extends Error {
  constructor(public email: string | null | undefined) {
    super(
      email
        ? `A conta ${email} não está autorizada neste Personal OS.`
        : "Esta conta Google não está autorizada neste Personal OS.",
    );
    this.name = "UnauthorizedAccountError";
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, provider);
  try {
    await syncSessionCookie(result.user);
  } catch (err) {
    // Importante: se a sessão server-side foi negada, derruba também a sessão
    // client-side do Firebase. Senão, no próximo "Continuar com Google" o popup
    // reusa a conta rejeitada silenciosamente.
    await signOut(auth).catch(() => {});
    throw err;
  }
  return result.user;
}

export async function signOutAndClear(): Promise<void> {
  await signOut(auth);
  await fetch("/api/auth/session", { method: "DELETE" });
}

export function onUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

async function syncSessionCookie(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (res.ok) return;

  if (res.status === 403) {
    throw new UnauthorizedAccountError(user.email);
  }

  let detail = "";
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) detail = ` — ${body.error}`;
  } catch {
    // ignore
  }
  throw new Error(`Falha ao criar sessão (${res.status})${detail}`);
}
