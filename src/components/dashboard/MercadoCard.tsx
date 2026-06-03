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
  const [pendingBought, setPendingBought] = useState<Set<string>>(new Set());

  async function refresh() {
    try {
      const r = await fetch("/api/mercado", { cache: "no-store" });
      const d: MercadoResp = await r.json();
      if (!d.ok) setError(d.error ?? "erro");
      else setError(null);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function markBought(id: string) {
    setPendingBought((s) => new Set([...s, id]));
    try {
      const res = await fetch(`/api/mercado/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bought: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? `erro ${res.status}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setPendingBought((s) => {
        const c = new Set(s);
        c.delete(id);
        return c;
      });
    }
  }

  async function unmarkBought(id: string) {
    setPendingBought((s) => new Set([...s, id]));
    try {
      const res = await fetch(`/api/mercado/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bought: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? `erro ${res.status}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setPendingBought((s) => {
        const c = new Set(s);
        c.delete(id);
        return c;
      });
    }
  }

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
          {pending.map((row) => {
            const inFlight = pendingBought.has(row.id);
            return (
              <li
                key={row.id}
                className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40 transition ${
                  inFlight ? "opacity-50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => markBought(row.id)}
                  disabled={inFlight}
                  title="Marcar como comprado"
                  aria-label="Marcar como comprado"
                  className="w-4 h-4 rounded-full border border-[var(--ink-3)] hover:border-[var(--ok)] hover:bg-[var(--ok)]/20 transition shrink-0"
                />
                <span className="capitalize flex-1 truncate">{row.item}</span>
                <span className="mono text-[10px] text-[var(--ink-3)] shrink-0">
                  {relativeTime(row.createdAt)}
                </span>
              </li>
            );
          })}
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
              {bought.map((row) => {
                const inFlight = pendingBought.has(row.id);
                return (
                  <li
                    key={row.id}
                    className={`flex items-center gap-2 text-[11px] text-[var(--ink-3)] px-2 transition ${
                      inFlight ? "opacity-50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => unmarkBought(row.id)}
                      disabled={inFlight}
                      title="Desmarcar (voltar pra lista)"
                      aria-label="Desmarcar"
                      className="w-3.5 h-3.5 rounded-full border border-[var(--ok)] bg-[var(--ok)]/30 hover:bg-transparent transition shrink-0"
                    />
                    <span className="capitalize line-through flex-1 truncate">{row.item}</span>
                    <span className="mono text-[10px] shrink-0">
                      {relativeTime(row.boughtAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
