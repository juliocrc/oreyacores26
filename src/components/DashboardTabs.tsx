"use client";

import { useState } from "react";
import { InspectorDashboard, ManagerDashboard, ComplianceDashboard } from "./dashboard";
import { ClipboardCheck, Columns3, ShieldCheck } from "lucide-react";

type Tab = "inspecao" | "frota" | "conformidade";

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "inspecao", label: "Inspeção", icon: ClipboardCheck },
  { id: "frota", label: "Frota", icon: Columns3 },
  { id: "conformidade", label: "Conformidade", icon: ShieldCheck },
];

export function DashboardTabs() {
  const [tab, setTab] = useState<Tab>("frota");

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-1" aria-label="Dashboard views">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
                tab === id
                  ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "inspecao" && <InspectorDashboard />}
      {tab === "frota" && <ManagerDashboard />}
      {tab === "conformidade" && <ComplianceDashboard />}
    </div>
  );
}