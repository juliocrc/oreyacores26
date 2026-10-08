import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Anchor } from "lucide-react";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { listarTecnicosSelecionaveis } from "@/lib/selecao-tecnicos";
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
  let session = null;
  try {
    session = await getAuthSession();
  } catch (error) {
    console.error("Failed to resolve auth session on technician selection page.", error);
  }

  if (session?.user?.id) {
    redirect(destino);
  }

  let estacao: { id: number; codigo: string; nome: string } | null = null;
  let databaseError: string | null = null;

  try {
    estacao = await prisma.serviceStation.findFirst({
      where: { codigo: APP_CONFIG.defaultServiceStationCode, ativo: true },
      select: { id: true, codigo: true, nome: true },
    });
  } catch (error) {
    console.error("Failed to load the default service station when rendering technician selector.", error);
    databaseError = "A base de dados não está disponível neste momento.";
  }

  // Todos os técnicos activos entram na lista, mesmo os que ainda não têm
  // utilizador criado — o utilizador é criado no momento em que clica no nome.
  let disponiveis: Awaited<ReturnType<typeof listarTecnicosSelecionaveis>> = [];

  try {
    disponiveis = await listarTecnicosSelecionaveis();
  } catch (error) {
    console.error("Failed to load selectable technicians for the selection page.", error);
    databaseError ??= "Não foi possível carregar a lista de técnicos.";
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
            Toca no teu nome para começar. Sem palavra-passe — a aplicação lembra-te
            enquanto estiver aberta.
          </p>
        </header>

        {databaseError ? (
          <div className="ds-card border-warn-line bg-warn-soft p-6 text-center">
            <p className="font-semibold text-warn">Não foi possível carregar a seleção.</p>
            <p className="mt-2 text-sm text-ink-muted">{databaseError}</p>
            <p className="mt-3 text-xs text-ink-subtle">
              Verifica se a base de dados e as variáveis de ambiente estão configuradas.
            </p>
          </div>
        ) : disponiveis.length === 0 ? (
          <div className="ds-card border-warn-line bg-warn-soft p-6 text-center">
            <p className="font-semibold text-warn">Nenhum técnico disponível.</p>
            <p className="mt-2 text-sm text-ink-muted">
              Não há técnicos activos nesta instalação. Executa{" "}
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
