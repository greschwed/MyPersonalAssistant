"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";

type Event = {
  uid: string;
  calendar: string;
  color: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
};

type Resp = {
  ok?: boolean;
  days?: number;
  sources?: { name: string; color: string }[];
  events?: Event[];
  error?: string;
};

const DAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildWeek(): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

function timeOnly(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function WeekCalendarCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKey(new Date()));

  useEffect(() => {
    let canceled = false;
    fetch("/api/calendar/events?days=7")
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

  const week = useMemo(buildWeek, []);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of data?.events ?? []) {
      const start = new Date(ev.start);
      const key = dateKey(start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [data?.events]);

  const meta = data?.events ? `${data.events.length} eventos / 7d` : "…";

  const selectedEvents = (eventsByDay.get(selectedKey) ?? []).sort((a, b) =>
    a.start.localeCompare(b.start),
  );

  return (
    <Panel label="📅 SEMANA" meta={meta}>
      {error && <p className="text-xs text-[var(--danger)] font-mono">{error}</p>}
      {!data && !error && <p className="text-xs text-[var(--ink-3)]">Carregando…</p>}

      {data && (
        <div className="flex flex-col gap-3">
          {/* Legenda dos calendários */}
          {data.sources && data.sources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.sources.map((s) => (
                <span
                  key={s.name}
                  className="flex items-center gap-1 mono text-[10px] text-[var(--ink-3)]"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.name.toLowerCase()}
                </span>
              ))}
            </div>
          )}

          {/* Strip de 7 dias */}
          <div className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const key = dateKey(d);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isSelected = key === selectedKey;
              const isToday = key === dateKey(new Date());
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`flex flex-col items-center py-1.5 rounded transition border hairline ${
                    isSelected
                      ? "bg-[var(--ink-2)] border-[var(--ink-3)]"
                      : "bg-transparent hover:bg-[var(--ink-1)]/50"
                  }`}
                >
                  <span className="mono text-[9px] text-[var(--ink-3)] uppercase">
                    {DAY_LABELS[d.getDay()]}
                  </span>
                  <span
                    className={`mono text-sm ${
                      isToday ? "text-[var(--accent)]" : "text-[var(--ink-4)]"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex gap-0.5 mt-0.5 h-1.5">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ background: ev.color }}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] text-[var(--ink-3)]">+</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Eventos do dia selecionado */}
          <div className="flex flex-col gap-1.5">
            {selectedEvents.length === 0 && (
              <p className="text-[11px] text-[var(--ink-3)]">— sem eventos —</p>
            )}
            {selectedEvents.map((ev) => (
              <div
                key={ev.uid}
                className="flex items-start gap-2 text-xs px-2 py-1.5 rounded border hairline bg-[var(--ink-1)]/40"
                title={`${ev.calendar}${ev.location ? ` · ${ev.location}` : ""}`}
              >
                <span
                  className="w-1 h-full rounded-full shrink-0 mt-0.5"
                  style={{
                    background: ev.color,
                    minHeight: "1.4em",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] text-[var(--ink-3)] shrink-0">
                      {ev.allDay ? "dia todo" : timeOnly(ev.start)}
                    </span>
                    <span className="truncate">{ev.title}</span>
                  </div>
                  {ev.location && (
                    <p className="text-[10px] text-[var(--ink-3)] truncate mt-0.5">
                      {ev.location}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
