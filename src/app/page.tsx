import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { TopRail } from "@/components/dashboard/TopRail";
import { CaptureBox } from "@/components/dashboard/CaptureBox";
import { MercadoCard } from "@/components/dashboard/MercadoCard";
import {
  OperatorCard,
  SessionCard,
  HabitsCard,
  CalendarCard,
  NutritionCard,
  KeyBlockersCard,
  FinancePulseCard,
} from "@/components/dashboard/cards";
import { USER_TIMEZONE } from "@/lib/userConfig";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ts = new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const operatorName = (user.email ?? "Operador").split("@")[0];

  return (
    <div className="min-h-screen flex flex-col">
      <TopRail email={user.email} ts={ts.toUpperCase()} />

      <main className="flex-1 px-4 pt-4 pb-32 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="flex flex-col gap-4">
          <OperatorCard name={operatorName} />
          <MercadoCard />
          <FinancePulseCard />
          <KeyBlockersCard />
        </aside>

        <section className="flex flex-col gap-4">
          <SessionCard />
          <HabitsCard />
          <CalendarCard />
        </section>

        <aside className="flex flex-col gap-4">
          <NutritionCard />
        </aside>
      </main>

      <CaptureBox />

      <footer className="px-6 pb-4 text-[10px] mono text-[var(--ink-3)] flex justify-between">
        <span>PERSONAL OS // V0.1</span>
        <span>{user.email}</span>
      </footer>
    </div>
  );
}
