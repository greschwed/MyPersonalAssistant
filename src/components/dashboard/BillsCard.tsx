"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";

type BillState = "atrasada" | "a_vencer" | "agendada" | "sem_data";

type Bill = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  category: "recorrente" | "avulsa";
  recurrence: "mensal" | "anual" | "outro" | null;
  due_date: string | null;
  status: "pendente" | "pago";
  daysToDue: number | null;
  state: BillState;
};

type Resp = {
  ok?: boolean;
  today?: string;
  pendentes?: Bill[];
  pagas?: Bill[];
  totals?: {
    pendente: number;
    atrasado: number;
    pendenteCount: number;
    atrasadoCount: number;
  };
  error?: string;
};

const STATE_DOT: Record<BillState, string> = {
  atrasada: "var(--hot)",
  a_vencer: "var(--warn)",
  agendada: "var(--ink-3)",
  sem_data: "var(--ink-3)",
};

const STATE_LABEL: Record<BillState, string> = {
  atrasada: "atrasada",
  a_vencer: "a vencer",
  agendada: "agendada",
  sem_data: "sem data",
};

function brl(n: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function BillsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetch("/api/bills")
      .then((r) => r.json())
      .then((d: Resp) => {
        if (canceled) return;
        if (!d.ok) setError(d.error ?? "erro");
        setData(d);
      })
      .catch((err) => !canceled && setError(err instanceof Error ? err.message : "erro"));
    return () => {
      canceled = true;
    };
  }, []);

  const t = data?.totals;
  const meta = t
    ? `${t.pendenteCount} pendente${t.pendenteCount === 1 ? "" : "s"}${
        t.atrasadoCount > 0 ? ` · ${t.atrasadoCount} atrasada${t.atrasadoCount === 1 ? "" : "s"}` : ""
      }`
    : "…";

  return (
    <Panel label="💳 CONTAS A PAGAR" meta={meta}>
      {error && <p className="text-xs text-[var(--danger)] font-mono">{error}</p>}
      {!data && !error && <p className="text-xs text-[var(--ink-3)]">Carregando…</p>}

      {data?.pendentes && data.pendentes.length === 0 && (
        <p className="text-xs text-[var(--ink-3)]">
          Sem contas pendentes. Mande &ldquo;boleto X R$ Y vence dia Z&rdquo; no Telegram.
        </p>
      )}

      {data?.pendentes && data.pendentes.length > 0 && (
        <>
          <div className="flex justify-between items-baseline mb-2 mono text-[11px]">
            <span className="text-[var(--ink-3)]">Total pendente</span>
            <span>
              {brl(t?.pendente ?? 0)}
              {t && t.atrasado > 0 && (
                <span className="ml-2 text-[var(--hot)]">({brl(t.atrasado)} atrasado)</span>
              )}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {data.pendentes.map((b) => (
              <li
                key={b.id}
                className="text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40 flex items-center gap-2"
                title={`${STATE_LABEL[b.state]}${b.recurrence ? ` · ${b.recurrence}` : ""}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATE_DOT[b.state] }}
                />
                <span className="flex-1 truncate">{b.name}</span>
                {b.category === "recorrente" && (
                  <span className="mono text-[9px] text-[var(--ink-3)]">↻</span>
                )}
                <span className="mono text-[11px]">
                  {b.amount !== null ? brl(b.amount, b.currency) : "—"}
                </span>
                {b.due_date && (
                  <span
                    className={`mono text-[10px] ${
                      b.state === "atrasada" ? "text-[var(--hot)]" : "text-[var(--ink-3)]"
                    }`}
                  >
                    {b.due_date.slice(5)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {data?.pagas && data.pagas.length > 0 && (
        <div className="mt-3 pt-3 border-t hairline">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[10px] mono text-[var(--ink-3)] hover:text-[var(--ink-4)] transition"
          >
            {showHistory ? "▾" : "▸"} {data.pagas.length} paga{data.pagas.length === 1 ? "" : "s"} recente{data.pagas.length === 1 ? "" : "s"}
          </button>
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-1">
              {data.pagas.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between text-[11px] text-[var(--ink-3)] px-2"
                >
                  <span className="truncate">{b.name}</span>
                  <span className="mono text-[10px]">
                    {b.amount !== null ? brl(b.amount, b.currency) : "—"}
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
