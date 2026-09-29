"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { selecionarTecnico, type SelecaoState } from "./actions";

type Tecnico = {
  id: number;
  nome: string;
  email: string;
  userId: number;
};

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Botao({ nome, email, id }: Tecnico) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="tecnicoId"
      value={String(id)}
      disabled={pending}
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
        <span className="block truncate text-xs text-ink-subtle">{email}</span>
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
  );
}

export function SelecionarTecnicoForm({
  tecnicos,
  callbackUrl,
}: {
  tecnicos: Tecnico[];
  callbackUrl: string;
}) {
  const [estado, formAction] = useActionState<SelecaoState, FormData>(selecionarTecnico, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {tecnicos.map((tecnico) => (
        <Botao key={tecnico.userId} {...tecnico} />
      ))}

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
