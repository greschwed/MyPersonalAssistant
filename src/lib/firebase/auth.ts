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

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, provider);
  await syncSessionCookie(result.user);
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
  if (!res.ok) {
    throw new Error(`Falha ao criar sessão: ${res.status}`);
  }
}
