import Link from "next/link";
import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { getAccessContext } from "@/lib/access-control";
import { getAuthSession } from "@/auth";
import { TrocarTecnicoBotao } from "./TrocarTecnicoBotao";

export const metadata: Metadata = {
  title: "Inspeções",
};

export const dynamic = "force-dynamic";

const ACOES = [
  {
    href: "/jangadas",
    emoji: "🛶",
    titulo: "Inspecionar jangada",
    descricao: "Abrir a ficha, verificar e emitir certificado e quadro",
    destaque: true,
  },
  {
    href: "/equipamentos",
    emoji: "🦺",
    titulo: "Inspecionar colete",
    descricao: "Coletes salva-vidas e os respectivos certificados",
    destaque: true,
  },
  {
    href: "/inspecoes",
    emoji: "🔍",
    titulo: "Todas as inspeções",
    descricao: "Histórico completo, reabrir e voltar a emitir",
    destaque: false,
  },
  {
    href: "/stock",
    emoji: "📦",
    titulo: "Stock",
    descricao: "Artigos, entradas e saídas das inspeções",
    destaque: false,
  },
  {
    href: "/navios",
    emoji: "🚢",
    titulo: "Navios",
    descricao: "Frota e estado das inspeções a bordo",
    destaque: false,
  },
  {
    href: "/clientes",
    emoji: "👥",
    titulo: "Clientes",
    descricao: "Armadores e operadores de navios",
    destaque: false,
  },
] as const;

function dataCurta(valor: unknown) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "—";
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) return bruto;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function InicioPage() {
  const session = await getAuthSession();
  const nome = session?.user?.name?.trim() || "Técnico";

  const access = await getAccessContext();
  const stationId = access?.stationId ?? null;
  // Na Deluxe o contexto é global; a app está limitada à estação configurada.
  const filtroEstacao = (relacao: "serviceStationId") =>
    stationId ? { [relacao]: stationId } : {};

  const [totalJangadas, totalNavios, totalClientes, totalStock, recentes] = await Promise.all([
    prisma.jangada.count({ where: filtroEstacao("serviceStationId") }),
    prisma.navio.count({ where: filtroEstacao("serviceStationId") }),
    prisma.cliente.count({ where: filtroEstacao("serviceStationId") }),
    prisma.stock.count({ where: filtroEstacao("serviceStationId") }),
    prisma.inspecao.findMany({
      select: {
        id: true,
        certificadoNumero: true,
        navioNome: true,
        navioId: true,
        jangadaSerial: true,
        coleteSerial: true,
        dataInspecao: true,
        status: true,
        jangadaId: true,
        coleteId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <main className="ds-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
            {APP_CONFIG.defaultRegionLabel} · {APP_CONFIG.name}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Olá, {nome.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Começa por escolher o que vais inspecionar.
          </p>
        </div>
        <TrocarTecnicoBotao />
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {ACOES.filter((a) => a.destaque).map((acao) => (
          <Link
            key={acao.href}
            href={acao.href}
            className="group flex items-center gap-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-transparent p-6 transition hover:border-cyan-500/60 hover:shadow-lg"
          >
            <span aria-hidden className="text-4xl">{acao.emoji}</span>
            <span>
              <span className="block text-lg font-bold text-slate-900 dark:text-slate-50">
                {acao.titulo}
              </span>
              <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
                {acao.descricao}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACOES.filter((a) => !a.destaque).map((acao) => (
          <Link
            key={acao.href}
            href={acao.href}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-cyan-500/40 hover:shadow dark:border-slate-700 dark:bg-slate-800/60"
          >
            <span aria-hidden className="text-2xl">{acao.emoji}</span>
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                {acao.titulo}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {acao.descricao}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Jangadas", valor: totalJangadas, href: "/jangadas" },
          { label: "Navios", valor: totalNavios, href: "/navios" },
          { label: "Clientes", valor: totalClientes, href: "/clientes" },
          { label: "Artigos", valor: totalStock, href: "/stock" },
        ].map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-center transition hover:border-cyan-500/40 dark:border-slate-700 dark:bg-slate-800/60"
          >
            <span className="block text-3xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
              {kpi.valor.toLocaleString("pt-PT")}
            </span>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {kpi.label}
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Inspeções recentes</h2>
          <Link
            href="/inspecoes"
            className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-400"
          >
            Ver todas
          </Link>
        </div>

        {recentes.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Ainda não há inspeções registadas. Começa pela primeira jangada.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/60">
            {recentes.map((insp) => {
              const alvo = insp.jangadaId
                ? `/jangadas/${insp.jangadaId}`
                : insp.coleteId
                  ? `/coletes/${insp.coleteId}/wizard`
                  : "/inspecoes";
              return (
                <li key={insp.id}>
                  <Link href={alvo} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {insp.certificadoNumero || "s/n cert."}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {insp.navioNome || "Sem navio"}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {insp.jangadaSerial || insp.coleteSerial || "—"}
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {dataCurta(insp.dataInspecao)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
