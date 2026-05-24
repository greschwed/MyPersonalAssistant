"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";
import { TaskEditDrawer, type EditableTask } from "./TaskEditDrawer";

type Urgency = "today" | "this_week" | "this_month" | "someday";
type Scope = "pessoal" | "trabalho";
type ScheduledTo = "hoje" | "amanha" | "esta_semana" | "este_mes" | "data_especifica";

type TaskRow = {
  id: string;
  title: string;
  description: string;
  urgency: Urgency;
  scheduled_to: ScheduledTo;
  key: boolean;
  priority_score: number;
  tags: string[];
  due_date: string | null;
  scope: Scope;
  project: string | null;
  createdAt: string | null;
  completed: boolean;
  completedAt: string | null;
};

type Resp = {
  ok?: boolean;
  counts?: { total: number; pessoal: number; trabalho: number };
  grouped?: Record<Scope, Record<string, TaskRow[]>>;
  error?: string;
};

const SCHEDULED_LABEL: Record<ScheduledTo, string> = {
  hoje: "hoje",
  amanha: "amanhã",
  esta_semana: "esta semana",
  este_mes: "este mês",
  data_especifica: "data",
};

const SCHEDULED_COLOR: Record<ScheduledTo, string> = {
  hoje: "var(--hot)",
  amanha: "var(--warn)",
  esta_semana: "var(--warn)",
  este_mes: "var(--ink-3)",
  data_especifica: "var(--accent)",
};

function toEditable(t: TaskRow): EditableTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    scheduled_to: t.scheduled_to,
    due_date: t.due_date,
    key: t.key,
    scope: t.scope,
    project: t.project,
    tags: t.tags,
    completed: t.completed,
  };
}

export function TasksByProjectCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<EditableTask | null>(null);
  const [pendingDone, setPendingDone] = useState<Set<string>>(new Set());

  async function refresh() {
    try {
      const r = await fetch("/api/tasks?status=open", { cache: "no-store" });
      const d: Resp = await r.json();
      if (!d.ok) {
        setError(d.error ?? "erro");
      } else {
        setError(null);
      }
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggle(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  async function markDone(id: string) {
    setPendingDone((s) => new Set([...s, id]));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true }),
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
      setPendingDone((s) => {
        const c = new Set(s);
        c.delete(id);
        return c;
      });
    }
  }

  const counts = data?.counts;
  const meta = counts ? `${counts.total} aberta${counts.total === 1 ? "" : "s"}` : "…";

  return (
    <>
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
                                {tasks.map((t) => {
                                  const doneInFlight = pendingDone.has(t.id);
                                  return (
                                    <li
                                      key={t.id}
                                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40 transition ${
                                        doneInFlight ? "opacity-50" : ""
                                      }`}
                                    >
                                      {/* checkbox: 1 click marca feito */}
                                      <button
                                        type="button"
                                        onClick={() => markDone(t.id)}
                                        disabled={doneInFlight}
                                        title="Marcar feita"
                                        aria-label="Marcar feita"
                                        className="w-4 h-4 rounded-full border border-[var(--ink-3)] hover:border-[var(--ok)] hover:bg-[var(--ok)]/20 transition shrink-0"
                                      />
                                      {/* dot urgency */}
                                      <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ background: SCHEDULED_COLOR[t.scheduled_to] }}
                                        title={SCHEDULED_LABEL[t.scheduled_to]}
                                      />
                                      {/* title clickable abre drawer */}
                                      <button
                                        type="button"
                                        onClick={() => setEditing(toEditable(t))}
                                        className="flex-1 text-left truncate hover:text-[var(--ink-5)]"
                                      >
                                        {t.title}
                                      </button>
                                      {t.key && (
                                        <span className="mono text-[9px] text-[var(--hot)]">KEY</span>
                                      )}
                                      {t.due_date && (
                                        <span className="mono text-[10px] text-[var(--ink-3)]">
                                          {t.due_date.slice(5)}
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
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

      {editing && (
        <TaskEditDrawer
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onDeleted={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
