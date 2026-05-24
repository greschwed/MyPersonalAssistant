"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";

type Urgency = "today" | "this_week" | "this_month" | "someday";
type Scope = "pessoal" | "trabalho";

type TaskRow = {
  id: string;
  title: string;
  urgency: Urgency;
  key: boolean;
  priority_score: number;
  tags: string[];
  due_date: string | null;
  scope: Scope;
  project: string | null;
  createdAt: string | null;
};

type Resp = {
  ok?: boolean;
  counts?: { total: number; pessoal: number; trabalho: number };
  grouped?: Record<Scope, Record<string, TaskRow[]>>;
  error?: string;
};

const URGENCY_LABEL: Record<Urgency, string> = {
  today: "hoje",
  this_week: "semana",
  this_month: "mês",
  someday: "algum dia",
};

const URGENCY_COLOR: Record<Urgency, string> = {
  today: "var(--hot)",
  this_week: "var(--warn)",
  this_month: "var(--ink-3)",
  someday: "var(--ink-3)",
};

export function TasksByProjectCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let canceled = false;
    fetch("/api/tasks?status=open")
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

  function toggle(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  const counts = data?.counts;
  const meta = counts ? `${counts.total} aberto${counts.total === 1 ? "" : "s"}` : "…";

  return (
    <Panel label="✅ TO-DO" meta={meta}>
      {error && <p className="text-xs text-[var(--danger)] font-mono">{error}</p>}
      {!data && !error && <p className="text-xs text-[var(--ink-3)]">Carregando…</p>}

      {data?.grouped && (
        <div className="flex flex-col gap-4">
          {(["pessoal", "trabalho"] as Scope[]).map((scope) => {
            const projects = data.grouped![scope] ?? {};
            const scopeCount = Object.values(projects).reduce((a, b) => a + b.length, 0);
            const isCollapsed = collapsed[`scope:${scope}`] ?? false;

            return (
              <div key={scope} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggle(`scope:${scope}`)}
                  className="flex items-center justify-between text-left"
                >
                  <span className="label-xs text-[var(--ink-4)]">
                    {isCollapsed ? "▸" : "▾"} {scope.toUpperCase()}
                  </span>
                  <span className="mono text-[10px] text-[var(--ink-3)]">{scopeCount}</span>
                </button>

                {!isCollapsed && scopeCount === 0 && (
                  <p className="text-[11px] text-[var(--ink-3)] pl-3">— vazio —</p>
                )}

                {!isCollapsed &&
                  Object.entries(projects)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([proj, tasks]) => {
                      const projKey = `${scope}:${proj}`;
                      const projCollapsed = collapsed[projKey] ?? false;
                      return (
                        <div key={projKey} className="ml-2 flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => toggle(projKey)}
                            className="flex items-center justify-between text-left"
                          >
                            <span className="text-[11px] font-mono text-[var(--ink-3)]">
                              {projCollapsed ? "▸" : "▾"} {proj}
                            </span>
                            <span className="mono text-[10px] text-[var(--ink-3)]">
                              {tasks.length}
                            </span>
                          </button>
                          {!projCollapsed && (
                            <ul className="ml-2 flex flex-col gap-1">
                              {tasks.map((t) => (
                                <li
                                  key={t.id}
                                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: URGENCY_COLOR[t.urgency] }}
                                    title={URGENCY_LABEL[t.urgency]}
                                  />
                                  <span className="flex-1 truncate">{t.title}</span>
                                  {t.key && (
                                    <span className="mono text-[9px] text-[var(--hot)]">KEY</span>
                                  )}
                                  {t.due_date && (
                                    <span className="mono text-[10px] text-[var(--ink-3)]">
                                      {t.due_date.slice(5)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
