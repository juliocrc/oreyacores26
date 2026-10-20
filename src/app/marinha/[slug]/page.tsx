import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Anchor,
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Info,
  MapPin,
  Ship,
  Shield,
} from "lucide-react";
import {
  MARINHA_FONTE,
  marinhaClasses,
  marinhaNavioPorSlug,
  marinhaNavioSlug,
  type MarinhaTipo,
} from "@/lib/marinha";
import PrintButton from "./PrintButton";

const TIPO_BADGE: Record<MarinhaTipo, string> = {
  Fragata: "bg-sky-100 text-sky-700 ring-sky-200",
  Submarino: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  Corveta: "bg-teal-100 text-teal-700 ring-teal-200",
  "Navio-patrulha oceânico": "bg-cyan-100 text-cyan-700 ring-cyan-200",
  "Navio-patrulha": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Lancha rápida": "bg-amber-100 text-amber-700 ring-amber-200",
  "Navio hidrográfico": "bg-violet-100 text-violet-700 ring-violet-200",
  "Navio-escola": "bg-rose-100 text-rose-700 ring-rose-200",
  "Navio de apoio logístico": "bg-orange-100 text-orange-700 ring-orange-200",
  "Unidade auxiliar": "bg-slate-100 text-slate-700 ring-slate-200",
  "Embarcação salva-vidas": "bg-red-100 text-red-700 ring-red-200",
};

export function generateStaticParams() {
  return marinhaClasses.flatMap(classe =>
    classe.navios.map(navio => ({ slug: marinhaNavioSlug(navio) })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = marinhaNavioPorSlug(slug);
  if (!found) return { title: "Navio não encontrado · Marinha" };
  return {
    title: `${found.navio.nome} (${found.navio.numero}) · Marinha Portuguesa`,
    description: found.classe.resumo,
  };
}

export default async function MarinhaNavioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = marinhaNavioPorSlug(slug);
  if (!found) notFound();

  const { classe, navio } = found;
  const related = classe.navios.filter(item => item.numero !== navio.numero);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/marinha"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar à frota
        </Link>
        <PrintButton />
      </div>

      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ring-1 ${TIPO_BADGE[classe.tipo]}`}
            >
              {classe.tipo}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-100 ring-1 ring-white/15">
              {classe.nome}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-sky-200">
                {navio.numero}
              </p>
              <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">{navio.nome}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200">{classe.resumo}</p>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Anchor className="h-7 w-7" />
            </span>
          </div>
        </header>

        <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">
              <Ship className="h-4 w-4" />
              Identificação
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <InfoField label="Nº de amura / referência" value={navio.numero} strong />
              <InfoField label="Classe" value={classe.nome} />
              <InfoField label="Tipo" value={classe.tipo} />
              {navio.ano ? <InfoField label="Ao serviço desde" value={String(navio.ano)} /> : null}
              {navio.base ? <InfoField label="Base" value={navio.base} icon="map" /> : null}
              {navio.organizacao ? <InfoField label="Organização" value={navio.organizacao} icon="shield" /> : null}
              {navio.funcao ? <InfoField label="Função" value={navio.funcao} icon="info" /> : null}
            </dl>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">
              <Info className="h-4 w-4" />
              Especificações da classe
            </h2>
            <dl className="space-y-2">
              {classe.especificacoes.map(especificacao => (
                <div key={especificacao.label} className="rounded-xl bg-slate-50 px-4 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {especificacao.label}
                  </dt>
                  <dd className="text-sm font-semibold text-slate-700">{especificacao.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {navio.nota ? (
          <div className="mx-6 mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 sm:mx-8">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{navio.nota}</p>
            </div>
          </div>
        ) : null}

        {related.length > 0 ? (
          <section className="border-t border-slate-100 px-6 py-6 sm:px-8">
            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">
              Outras unidades da classe
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {related.map(item => (
                <Link
                  key={item.numero}
                  href={`/marinha/${marinhaNavioSlug(item)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-sm transition hover:border-sky-200 hover:bg-sky-50/50"
                >
                  <span className="font-bold text-slate-800">{item.nome}</span>
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black tracking-wide text-white">
                    {item.numero}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-xs text-slate-500 sm:px-8">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" />
            Ficha de referência da Marinha Portuguesa
          </span>
          <a
            href={MARINHA_FONTE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-800"
          >
            Fonte oficial
            <ExternalLink className="h-3 w-3" />
          </a>
        </footer>
      </article>
    </div>
  );
}

function InfoField({
  label,
  value,
  strong,
  icon,
}: {
  label: string;
  value: string;
  strong?: boolean;
  icon?: "map" | "shield" | "info";
}) {
  const Icon = icon === "map" ? MapPin : icon === "shield" ? Shield : icon === "info" ? Info : null;
  return (
    <div className="rounded-xl border border-slate-100 px-4 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 flex items-start gap-1.5 text-sm text-slate-800 ${strong ? "font-black" : "font-semibold"}`}>
        {Icon ? <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
        <span>{value}</span>
      </dd>
    </div>
  );
}
