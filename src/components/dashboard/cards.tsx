import { Panel } from "./Panel";

export function OperatorCard({ name }: { name: string }) {
  return (
    <Panel label="01 // OPERATOR ● ONLINE" meta="UTC-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-[var(--ink-3)]">Boa tarde,</span>
        <span className="text-2xl font-medium">{name}</span>
        <span className="text-xs text-[var(--ink-3)] mono">São Paulo · BR</span>
      </div>
    </Panel>
  );
}

export function SessionCard() {
  return (
    <Panel label="02 // SESSION" meta="TODAY">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-[var(--ink-3)]">Foco de hoje</span>
        <span className="text-sm">— defina sua única coisa do dia</span>
        <div className="mt-3 mono text-xs text-[var(--ink-3)]">streak 0 dias</div>
      </div>
    </Panel>
  );
}

export function HabitsCard() {
  const habits = ["Sono ≥ 7h", "Treino", "Leitura", "Sem álcool", "Meditação", "Sem açúcar"];
  return (
    <Panel label="03 // HABITS" meta="0/6 · 0%">
      <div className="grid grid-cols-2 gap-2">
        {habits.map((h) => (
          <div
            key={h}
            className="text-xs px-2.5 py-2 rounded-md border hairline bg-[var(--ink-1)]/40"
          >
            {h}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CalendarCard() {
  const days = ["MON 26", "TUE 27", "WED 28", "THU 29", "FRI 30", "SAT 31", "SUN 01"];
  return (
    <Panel label="04 // CALENDAR" meta="MAY 2026">
      <div className="grid grid-cols-7 gap-1 mono text-[10px]">
        {days.map((d) => (
          <div
            key={d}
            className="border hairline rounded-md py-2 px-1 text-center text-[var(--ink-3)]"
          >
            {d}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Conecte sua URL iCal do Google Calendar para popular este card.
      </p>
    </Panel>
  );
}

export function NutritionCard() {
  return (
    <Panel label="08 // NUTRITION" meta="TODAY">
      <div className="flex flex-col gap-1">
        <span className="mono text-3xl">0</span>
        <span className="text-xs text-[var(--ink-3)]">of 2400 kcal</span>
        <div className="mt-2 grid grid-cols-3 gap-2 mono text-[10px] text-[var(--ink-3)]">
          <div>P 0/180g</div>
          <div>C 0/270g</div>
          <div>F 0/70g</div>
        </div>
      </div>
    </Panel>
  );
}

export function KeyBlockersCard() {
  return (
    <Panel label="06 // KEY BLOCKERS" meta="0 ACTIVE">
      <p className="text-xs text-[var(--ink-3)]">
        Tarefas marcadas como <span className="mono">key=true</span> e travadas aparecem
        aqui.
      </p>
    </Panel>
  );
}

export function FinancePulseCard() {
  return (
    <Panel label="07 // FINANCE PULSE" meta="LIVE">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--ink-3)]">NET WORTH</span>
        <span className="mono text-2xl">$ — — —</span>
        <span className="text-[10px] text-[var(--ink-3)] mono">+X.X% · 30D</span>
      </div>
    </Panel>
  );
}
