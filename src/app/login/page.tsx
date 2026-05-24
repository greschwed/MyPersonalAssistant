"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/firebase/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel w-full max-w-sm p-8 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="label-xs">PERSONAL OS // V0.1</span>
        <h1 className="text-2xl font-medium">Entrar</h1>
        <p className="text-sm text-[var(--ink-3)]">
          Acesso restrito ao operador do sistema.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className="w-full rounded-md border border-[var(--ink-2)] bg-[var(--ink-1)] hover:bg-[var(--ink-2)] transition px-4 py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Conectando…" : "Continuar com Google"}
      </button>

      {error && (
        <p className="text-xs text-[var(--danger)] font-mono">{error}</p>
      )}

      <p className="text-[10px] text-[var(--ink-3)] font-mono">
        Apenas o UID autorizado pode entrar.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <Suspense fallback={<div className="panel w-full max-w-sm p-8">Carregando…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
