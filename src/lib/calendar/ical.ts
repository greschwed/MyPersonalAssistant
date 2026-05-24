import "server-only";

import ICAL from "ical.js";

export type CalendarEvent = {
  uid: string;
  calendar: string;        // name from env var suffix (PESSOAL, TRABALHO, ...)
  color: string;           // hex/oklch
  title: string;
  start: string;           // ISO datetime
  end: string;             // ISO datetime
  allDay: boolean;
  location: string | null;
};

// Cor estável por nome via hash simples
const PALETTE = [
  "#60a5fa", // azul
  "#a78bfa", // roxo
  "#22c55e", // verde
  "#f59e0b", // âmbar
  "#ef4444", // vermelho
  "#06b6d4", // ciano
  "#ec4899", // rosa
];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// Lê env vars GOOGLE_CALENDAR_URL_* e retorna [{name, url, color}]
export function readCalendarSources(): {
  name: string;
  url: string;
  color: string;
}[] {
  const out: { name: string; url: string; color: string }[] = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("GOOGLE_CALENDAR_URL_")) continue;
    if (!v || typeof v !== "string" || !v.startsWith("http")) continue;
    const name = k.replace("GOOGLE_CALENDAR_URL_", "");
    out.push({
      name,
      url: v,
      color: process.env[`GOOGLE_CALENDAR_COLOR_${name}`] ?? colorFor(name),
    });
  }
  // Legacy single var
  const legacy = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (legacy && legacy.startsWith("http")) {
    out.push({ name: "PRINCIPAL", url: legacy, color: colorFor("PRINCIPAL") });
  }
  return out;
}

// Baixa um iCal e retorna eventos expandidos numa janela
async function fetchAndParse(
  source: { name: string; url: string; color: string },
  windowStart: Date,
  windowEnd: Date,
): Promise<CalendarEvent[]> {
  let text: string;
  try {
    const res = await fetch(source.url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[calendar] ${source.name} HTTP ${res.status}`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error(`[calendar] ${source.name} fetch failed:`, err);
    return [];
  }

  let comp: ICAL.Component;
  try {
    const jcal = ICAL.parse(text);
    comp = new ICAL.Component(jcal);
  } catch (err) {
    console.error(`[calendar] ${source.name} parse failed:`, err);
    return [];
  }

  const events: CalendarEvent[] = [];
  const vevents = comp.getAllSubcomponents("vevent");
  const windowStartTime = ICAL.Time.fromJSDate(windowStart, true);
  const windowEndTime = ICAL.Time.fromJSDate(windowEnd, true);

  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    if (!ev.startDate) continue;

    const occurrences: { start: ICAL.Time; end: ICAL.Time }[] = [];
    if (ev.isRecurring()) {
      const iter = ev.iterator(windowStartTime);
      let next = iter.next();
      let safety = 0;
      while (next && safety < 365) {
        safety++;
        if (next.compare(windowEndTime) > 0) break;
        const occ = ev.getOccurrenceDetails(next);
        if (
          occ.endDate.compare(windowStartTime) >= 0 &&
          occ.startDate.compare(windowEndTime) <= 0
        ) {
          occurrences.push({ start: occ.startDate, end: occ.endDate });
        }
        next = iter.next();
      }
    } else {
      // Não recorrente: incluir se intersecta a janela
      if (
        ev.endDate.compare(windowStartTime) >= 0 &&
        ev.startDate.compare(windowEndTime) <= 0
      ) {
        occurrences.push({ start: ev.startDate, end: ev.endDate });
      }
    }

    for (const occ of occurrences) {
      events.push({
        uid: `${ev.uid}@${occ.start.toUnixTime()}`,
        calendar: source.name,
        color: source.color,
        title: ev.summary || "(sem título)",
        start: occ.start.toJSDate().toISOString(),
        end: occ.end.toJSDate().toISOString(),
        allDay: occ.start.isDate,
        location: ev.location || null,
      });
    }
  }
  return events;
}

// Cache em memória de módulo — 5 minutos por origem (per o guia do PDF).
type Cached = { at: number; events: CalendarEvent[] };
const cache = new Map<string, Cached>();
const TTL = 5 * 60 * 1000;

export async function listUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  const sources = readCalendarSources();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86_400_000);

  const all: CalendarEvent[] = [];
  for (const src of sources) {
    const cached = cache.get(src.url);
    if (cached && Date.now() - cached.at < TTL) {
      all.push(...cached.events);
      continue;
    }
    const events = await fetchAndParse(src, start, end);
    cache.set(src.url, { at: Date.now(), events });
    all.push(...events);
  }
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}
