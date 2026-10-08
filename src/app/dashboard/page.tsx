import type { Metadata } from "next";
import { DashboardTabs } from "@/components/DashboardTabs";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="ds-page">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Visão geral das inspeções, da frota e da conformidade.
        </p>
      </header>

      <DashboardTabs />
    </main>
  );
}
