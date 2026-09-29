"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

/** Fecha a sessão e volta ao ecrã de seleção de técnico. */
export function TrocarTecnicoBotao() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState(false);

  const trocar = () => {
    setOcupado(true);
    startTransition(async () => {
      await signOut({ callbackUrl: "/selecionar-tecnico" });
      router.push("/selecionar-tecnico");
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={trocar}
      disabled={ocupado || pending}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-500/50 hover:text-cyan-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cyan-400/50"
    >
      <Users size={16} aria-hidden />
      {ocupado || pending ? "A trocar…" : "Trocar de técnico"}
    </button>
  );
}
