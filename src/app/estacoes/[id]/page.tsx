import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { serviceStationTerritoryLabel } from "@/lib/service-station-input";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(value);
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function displayValue(value: string | null | undefined) {
  return value?.trim() || "—";
}

function isExpired(value: Date | null | undefined) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return value < today;
}

export default async function EstacaoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  if (!access.isAdmin && !access.allowedStationIds.includes(id)) {
    notFound();
  }

  const station = await prisma.serviceStation.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      nome: true,
      empresa: true,
      localizacao: true,
      morada: true,
      codigoPostal: true,
      localidade: true,
      telefone: true,
      telefone2: true,
      email: true,
      website: true,
      dgrmCertificado: true,
      dgrmVerificacao: true,
      dgrmValidade: true,
      dgrmMarcas: true,
      prefixo: true,
      territorioTipo: true,
      regiaoOperacional: true,
      ativo: true,
      observacoes: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          clientes: true,
          navios: true,
          jangadas: true,
          tecnicos: true,
          ordensServico: true,
          serviceStationQueues: true,
          stocks: true,
          agendaEventos: true,
          agendas: true,
          contactosInternos: true,
        },
      },
    },
  });

  if (!station) notFound();

  const [calibracoes, queueRecente, ordensRecentes, tecnicos, stocks] = await Promise.all([
    prisma.calibracaoEquipamento.count({ where: { serviceStationId: id } }),
    prisma.serviceStationQueue.findMany({
      where: { serviceStationId: id },
      orderBy: { dataChegada: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        dataChegada: true,
        dataPrevistaEntrega: true,
        jangada: { select: { serial: true, brand: true, model: true } },
      },
    }),
    prisma.ordemServico.findMany({
      where: { serviceStationId: id },
      orderBy: { dataAbertura: "desc" },
      take: 5,
      select: {
        id: true,
        numeroOrdem: true,
        status: true,
        dataAbertura: true,
        descricao: true,
      },
    }),
    prisma.tecnico.findMany({
      where: { serviceStationId: id },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, email: true, ativo: true },
    }),
    prisma.stock.groupBy({
      by: ["categoria"],
      where: { serviceStationId: id },
      _count: { _all: true },
      orderBy: { categoria: "asc" },
    }),
  ]);

  const ficha = [
    { label: "Código interno", value: station.codigo },
    { label: "Empresa", value: displayValue(station.empresa) },
    { label: "Morada", value: displayValue(station.morada) },
    {
      label: "Código postal / localidade",
      value: [station.codigoPostal, station.localidade].filter(Boolean).join(" ") || "—",
    },
    { label: "Telefone", value: displayValue(station.telefone) },
    { label: "Telefone alternativo", value: displayValue(station.telefone2) },
    { label: "Email", value: displayValue(station.email) },
    { label: "Website", value: displayValue(station.website) },
    { label: "Território", value: serviceStationTerritoryLabel(station.territorioTipo) },
    { label: "Região operacional", value: displayValue(station.regiaoOperacional) },
    { label: "Prefixo documental", value: displayValue(station.prefixo) },
    { label: "Localização operacional", value: displayValue(station.localizacao) },
  ];

  const kpis = [
    { label: "Técnicos", value: station._count.tecnicos },
    { label: "Clientes", value: station._count.clientes },
    { label: "Navios", value: station._count.navios },
    { label: "Jangadas", value: station._count.jangadas },
    { label: "Stock", value: station._count.stocks },
    { label: "Calibrações", value: calibracoes },
    { label: "Fila da estação", value: station._count.serviceStationQueues },
    { label: "Ordens de serviço", value: station._count.ordensServico },
  ];

  const dgrmExpired = isExpired(station.dgrmValidade);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/estacoes"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          ← Voltar às estações
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{station.nome}</h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                station.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {station.ativo ? "Ativa" : "Inativa"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Ficha de estação de serviço · atualizada em {formatDateTime(station.updatedAt)}
          </p>
        </div>
        <Link
          href="/estacao-servico"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Abrir estação de serviço
        </Link>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Identificação e contactos
        </h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {ficha.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</dt>
              <dd className="mt-1 text-sm text-slate-800">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Certificação DGRM
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Certificado</p>
            <p className="mt-1 font-mono text-sm text-slate-800">{displayValue(station.dgrmCertificado)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Verificação</p>
            <p className="mt-1 text-sm text-slate-800">{formatDate(station.dgrmVerificacao)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Validade</p>
            <p className={`mt-1 text-sm ${dgrmExpired ? "font-semibold text-red-700" : "text-slate-800"}`}>
              {formatDate(station.dgrmValidade)}
              {dgrmExpired ? " · caducado" : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Marcas</p>
            <p className="mt-1 text-sm text-slate-800">{displayValue(station.dgrmMarcas)}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Registo histórico da listagem DGRM. Confirmar sempre a validade atual antes de emitir certificados.
        </p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Equipa</h2>
          {tecnicos.length === 0 ? (
            <p className="text-sm text-slate-500">Sem técnicos associados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tecnicos.map((tecnico) => (
                <li key={tecnico.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{tecnico.nome}</span>
                  <span className="text-right text-xs text-slate-500">
                    {tecnico.email}
                    {!tecnico.ativo ? " · inativo" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Stock por categoria
          </h2>
          {stocks.length === 0 ? (
            <p className="text-sm text-slate-500">Sem stock associado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stocks.map((row) => (
                <li key={row.categoria} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{row.categoria || "Sem categoria"}</span>
                  <span className="font-semibold text-slate-900">{row._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Fila recente
          </h2>
          {queueRecente.length === 0 ? (
            <p className="text-sm text-slate-500">Sem registos na fila.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {queueRecente.map((item) => (
                <li key={item.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono font-semibold text-slate-800">{item.jangada.serial}</span>
                    <span className="text-xs font-semibold text-slate-500">{item.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Chegada {formatDate(item.dataChegada)} · entrega {formatDate(item.dataPrevistaEntrega)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Ordens de serviço recentes
          </h2>
          {ordensRecentes.length === 0 ? (
            <p className="text-sm text-slate-500">Sem ordens de serviço.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ordensRecentes.map((ordem) => (
                <li key={ordem.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono font-semibold text-slate-800">{ordem.numeroOrdem}</span>
                    <span className="text-xs font-semibold text-slate-500">{ordem.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(ordem.dataAbertura)}
                    {ordem.descricao ? ` · ${ordem.descricao}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {station.observacoes ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-amber-800">Observações</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">{station.observacoes}</p>
        </section>
      ) : null}
    </div>
  );
}
