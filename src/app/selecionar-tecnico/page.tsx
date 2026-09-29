import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Anchor } from "lucide-react";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { getAuthSession } from "@/auth";
import { SelecionarTecnicoForm } from "./SelecionarTecnicoForm";

export const metadata: Metadata = {
  title: "Escolher técnico",
};

export const dynamic = "force-dynamic";

export default async function SelecionarTecnicoPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const destino =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/";

  // Já existe sessão? Não volta a perguntar.
  const session = await getAuthSession();
  if (session?.user?.id) {
    redirect(destino);
  }

  const estacao = await prisma.serviceStation.findFirst({
    where: { codigo: APP_CONFIG.defaultServiceStationCode, ativo: true },
    select: { id: true, codigo: true, nome: true },
  });

  const tecnicos = estacao
    ? await prisma.tecnico.findMany({
        where: { serviceStationId: estacao.id, ativo: true },
        select: { id: true, nome: true, email: true },
        orderBy: { nome: "asc" },
      })
    : [];

  // Só entram os técnicos que já têm utilizador com sessão possível.
  const disponiveis: Array<{ id: number; nome: string; email: string; userId: number }> = [];
  for (const tecnico of tecnicos) {
    if (!tecnico.email) continue;
    const user = await prisma.user.findFirst({
      where: { email: tecnico.email, NOT: { role: "CLIENTE" } },
      select: { id: true },
    });
    if (user) disponiveis.push({ id: tecnico.id, nome: tecnico.nome, email: tecnico.email, userId: user.id });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:py-16">
      {/* Halo suave por trás do cartão */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(79,70,229,0.10),transparent_70%)]"
      />

      <div className="ds-animate-in relative w-full max-w-lg">
        <header className="mb-8 text-center">
          <span className="ds-badge ds-badge-sea mb-5 inline-flex">
            <Anchor size={13} aria-hidden />
            {estacao ? estacao.nome : APP_CONFIG.defaultServiceStationCode}
          </span>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Quem está a inspecionar?
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[0.9375rem] text-ink-muted">
            Escolhe o teu nome para começar. Só precisas de fazer isto uma vez — a aplicação
            lembra-te.
          </p>
        </header>

        {disponiveis.length === 0 ? (
          <div className="ds-card border-warn-line bg-warn-soft p-6 text-center">
            <p className="font-semibold text-warn">Nenhum técnico disponível.</p>
            <p className="mt-2 text-sm text-ink-muted">
              A estação {APP_CONFIG.defaultServiceStationCode} não tem técnicos activos com
              utilizador. Executa{" "}
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-warn">
                node scripts/garantir-tecnicos-deluxe.cjs
              </code>
              .
            </p>
          </div>
        ) : (
          <Suspense fallback={<div className="ds-skeleton h-14" />}>
            <SelecionarTecnicoForm tecnicos={disponiveis} callbackUrl={destino} />
          </Suspense>
        )}

        <footer className="mt-8 text-center">
          <p className="text-xs text-ink-subtle">
            {APP_CONFIG.name ?? "OREYACORESDELUXE"} — aplicação local, sem ligação à internet.
          </p>
        </footer>
      </div>
    </main>
  );
}
