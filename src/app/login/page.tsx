"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UnauthorizedAccountError, signInWithGoogle } from "@/lib/firebase/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; unauthorized: boolean } | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace(from);
      router.refresh();
    } catch (err) {
      if (err instanceof UnauthorizedAccountError) {
        setError({ message: err.message, unauthorized: true });
      } else {
        setError({
          message: err instanceof Error ? err.message : "Falha no login",
          unauthorized: false,
        });
      }
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
        <div
          className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${
            error.unauthorized
              ? "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--ink-4)]"
              : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] font-mono"
          }`}
        >
          {error.unauthorized ? (
            <>
              <p>{error.message}</p>
              <p className="mt-1 text-[var(--ink-3)]">
                Tente novamente com a conta do operador.
              </p>
            </>
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--ink-3)] font-mono">
        Acesso restrito ao operador autorizado.
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
