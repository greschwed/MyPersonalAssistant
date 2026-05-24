"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAndClear } from "@/lib/firebase/auth";

const TABS = [
  { href: "/", label: "HOME" },
  { href: "/crm", label: "CRM" },
  { href: "/brain", label: "BRAIN" },
  { href: "/finance", label: "FINANCE" },
  { href: "/journal", label: "JOURNAL" },
  { href: "/health", label: "HEALTH" },
];

type TopRailProps = {
  email?: string | null;
  ts: string;
};

export function TopRail({ email, ts }: TopRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = (email ?? "OP").slice(0, 2).toUpperCase();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOutAndClear();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair");
      setSigningOut(false);
    }
  }

  return (
    <header className="panel mx-4 mt-4 px-5 py-2.5 flex items-center justify-between gap-6">
      <span className="font-mono text-[11px] tracking-widest text-[var(--ink-5)]">
        PERSONAL OS // V0.1
      </span>

      <nav className="hidden md:flex items-center gap-1">
        {TABS.map((t) => {
          const active =
            pathname === t.href || (t.href !== "/" && pathname.startsWith(t.href));
          const cls = active
            ? "text-[var(--ink-5)] bg-[var(--ink-1)]"
            : "text-[var(--ink-3)] hover:text-[var(--ink-4)]";
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1.5 rounded-md text-[11px] font-mono tracking-wider transition ${cls}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4 relative" ref={popRef}>
        <span className="font-mono text-[11px] text-[var(--ink-3)]">{ts}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Conta"
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-7 h-7 rounded-full bg-[var(--ink-2)] grid place-items-center text-[10px] font-mono transition hover:ring-1 hover:ring-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
        >
          {initials}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-11 panel p-2 min-w-[220px] flex flex-col gap-1 z-50 shadow-lg"
          >
            <div className="px-2 py-1.5 flex flex-col gap-0.5">
              <span className="text-[10px] mono text-[var(--ink-3)]">Sessão</span>
              <span className="text-xs text-[var(--ink-4)] truncate" title={email ?? ""}>
                {email ?? "—"}
              </span>
            </div>
            <div className="h-px bg-[var(--ink-2)] mx-1 my-1" />
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-xs text-left px-2 py-1.5 rounded hover:bg-[var(--ink-1)] disabled:opacity-50 transition"
            >
              {signingOut ? "Saindo…" : "Sair"}
            </button>
            {error && (
              <p className="px-2 text-[10px] mono text-[var(--danger)]">{error}</p>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
