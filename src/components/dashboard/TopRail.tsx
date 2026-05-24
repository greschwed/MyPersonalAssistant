"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const initials = (email ?? "OP").slice(0, 2).toUpperCase();

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

      <div className="flex items-center gap-4">
        <span className="font-mono text-[11px] text-[var(--ink-3)]">{ts}</span>
        <div className="w-7 h-7 rounded-full bg-[var(--ink-2)] grid place-items-center text-[10px] font-mono">
          {initials}
        </div>
      </div>
    </header>
  );
}
