"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { selecionarTecnico, type SelecaoState } from "./actions";

type Tecnico = {
  tecnicoId: number;
  nome: string;
  email: string;
  estacao: string | null;
  estacaoId: number | null;
};

type Estacao = {
  id: number;
  codigo: string;
  nome: string;
  localizacao: string | null;
  empresa: string | null;
};

type EstacaoEscolhida = number | "todas";

function subscribeNoop() {
  return () => undefined;
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Botao({ nome, email, estacao, tecnicoId, pronto, showPassword, onSelect }: Tecnico & { pronto: boolean; showPassword: boolean; onSelect: (id: number) => void }) {
  const { pending } = useFormStatus();

  const handleClick = () => {
    onSelect(tecnicoId);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || !pronto}
        className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5
                   text-left transition-all duration-200
                   hover:-translate-y-0.5 hover:border-brand-line hover:shadow-lift
                   active:translate-y-0 active:shadow-card
                   disabled:pointer-events-none disabled:opacity-50"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full
                     bg-brand-soft text-base font-bold text-brand-ink ring-1 ring-brand-line
                     transition-colors group-hover:bg-brand group-hover:text-white group-hover:ring-brand"
        >
          {iniciais(nome)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold text-ink">{nome}</span>
          <span className="block truncate text-xs text-ink-subtle">
            {estacao ? `${estacao} · ${email}` : email}
          </span>
        </span>

        {pending ? (
          <Loader2 size={18} aria-hidden className="shrink-0 animate-spin text-brand" />
        ) : (
          <ArrowRight
            size={18}
            aria-hidden
            className="shrink-0 text-ink-subtle transition-all duration-200
                       group-hover:translate-x-0.5 group-hover:text-brand"
          />
        )}
      </button>
      {showPassword && (
        <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-surface/80 p-4">
          <input
            type="password"
            name="password"
            placeholder="Palavra-passe"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            required
            autoFocus
          />
          <button
            type="submit"
            name="tecnicoId"
            value={String(tecnicoId)}
            disabled={pending || !pronto}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            Entrar
          </button>
        </div>
      )}
    </>
  );
}

export function SelecionarTecnicoForm({
  tecnicos,
  estacoes,
  estacaoInicialId,
  callbackUrl,
}: {
  tecnicos: Tecnico[];
  estacoes: Estacao[];
  estacaoInicialId: number | null;
  callbackUrl: string;
}) {
  const [estado, formAction] = useActionState<SelecaoState, FormData>(selecionarTecnico, {});
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [estacaoId, setEstacaoId] = React.useState<EstacaoEscolhida>(estacaoInicialId ?? "todas");

  const hidratado = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  React.useEffect(() => {
    if (!estado.ok) return;
    router.replace(callbackUrl);
    router.refresh();
  }, [estado.ok, callbackUrl, router]);

  const visiveis = React.useMemo(
    () => (estacaoId === "todas" ? tecnicos : tecnicos.filter((t) => t.estacaoId === estacaoId)),
    [estacaoId, tecnicos],
  );

  const escolherEstacao = (id: EstacaoEscolhida) => {
    setEstacaoId(id);
    setSelectedId(null);
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <input type="hidden" name="stationId" value={estacaoId === "todas" ? "" : String(estacaoId)} />

      {estacoes.length > 0 ? (
        <div className="mb-1">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            <MapPin size={13} aria-hidden />
            Estação de serviço
          </p>
          <div className="flex flex-wrap gap-2">
            {estacoes.map((estacao) => {
              const ativa = estacaoId === estacao.id;
              return (
                <button
                  key={estacao.id}
                  type="button"
                  onClick={() => escolherEstacao(estacao.id)}
                  aria-pressed={ativa}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    ativa
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-surface text-ink-muted hover:border-brand-line hover:text-ink"
                  }`}
                >
                  {estacao.codigo ? `${estacao.codigo} · ${estacao.nome}` : estacao.nome}
                </button>
              );
            })}
            {estacoes.length > 1 ? (
              <button
                type="button"
                onClick={() => escolherEstacao("todas")}
                aria-pressed={estacaoId === "todas"}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  estacaoId === "todas"
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink-muted hover:border-brand-line hover:text-ink"
                }`}
              >
                Todas
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          Sem técnicos nesta estação. Escolhe outra estação ou &quot;Todas&quot;.
        </p>
      ) : (
        visiveis.map((tecnico) => (
          <Botao
            key={tecnico.tecnicoId}
            {...tecnico}
            pronto={hidratado}
            showPassword={selectedId === tecnico.tecnicoId}
            onSelect={(id) => setSelectedId(id)}
          />
        ))
      )}

      {estado.erro ? (
        <p
          role="alert"
          className="ds-animate-pop rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
