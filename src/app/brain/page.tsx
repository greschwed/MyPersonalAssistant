import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { TopRail } from "@/components/dashboard/TopRail";
import { BrainConsole } from "@/components/dashboard/BrainConsole";
import { USER_TIMEZONE } from "@/lib/userConfig";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
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

  return (
    <div className="min-h-screen flex flex-col">
      <TopRail email={user.email} ts={ts.toUpperCase()} />

      <main className="flex-1 px-4 pt-4 pb-8 max-w-4xl w-full mx-auto">
        <BrainConsole />
      </main>

      <footer className="px-6 pb-4 text-[10px] mono text-[var(--ink-3)] flex justify-between">
        <span>PERSONAL OS // BRAIN</span>
        <span>{user.email}</span>
      </footer>
    </div>
  );
}
