"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";

type Row = {
  id: string;
  item: string;
  status: "A Comprar" | "Comprado";
  createdAt: string | null;
  boughtAt: string | null;
};

type MercadoResp = {
  ok?: boolean;
  pending?: Row[];
  bought?: Row[];
  counts?: { pending: number; bought: number };
  error?: string;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function MercadoCard() {
  const [data, setData] = useState<MercadoResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetch("/api/mercado")
      .then((r) => r.json())
      .then((d: MercadoResp) => {
        if (canceled) return;
        if (!d.ok) setError(d.error ?? "erro");
        setData(d);
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err.message : "erro");
      });
    return () => {
      canceled = true;
    };
  }, []);

  const pending = data?.pending ?? [];
  const bought = data?.bought ?? [];
  const meta = data
    ? `${pending.length} pendente${pending.length === 1 ? "" : "s"}`
    : "…";

  return (
    <Panel label="🛒 MERCADO" meta={meta}>
      {error && <p className="text-xs text-[var(--danger)] font-mono">{error}</p>}

      {!data && !error && (
        <p className="text-xs text-[var(--ink-3)]">Carregando…</p>
      )}

      {data && pending.length === 0 && (
        <p className="text-xs text-[var(--ink-3)]">
          Lista vazia. Mande &ldquo;Comprar X, Y, Z&rdquo; no Telegram pra adicionar.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pending.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40"
            >
              <span className="capitalize">{row.item}</span>
              <span className="mono text-[10px] text-[var(--ink-3)]">
                {relativeTime(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {bought.length > 0 && (
        <div className="mt-3 pt-3 border-t hairline">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[10px] mono text-[var(--ink-3)] hover:text-[var(--ink-4)] transition"
          >
            {showHistory ? "▾" : "▸"} {bought.length} comprado{bought.length === 1 ? "" : "s"} recente{bought.length === 1 ? "" : "s"}
          </button>
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-1">
              {bought.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between text-[11px] text-[var(--ink-3)] px-2"
                >
                  <span className="capitalize line-through">{row.item}</span>
                  <span className="mono text-[10px]">
                    {relativeTime(row.boughtAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
