import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldX } from "lucide-react";
import prisma from "@/lib/prisma";
import { berLabel, parseChecklistJson } from "@/lib/fatos-imersao-service";
import { toDisplayMonth } from "@/lib/fato-date-utils";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  if (value instanceof Date) return value.toLocaleDateString("pt-PT");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
}

function statusLabel(value?: string | null): string {
  if (!value) return "—";
  const normalized = value.trim().toUpperCase();
  const map: Record<string, string> = {
    OK: "Conforme",
    C: "Conforme",
    CONFORME: "Conforme",
    F: "Não conforme",
    NAO_OK: "Não conforme",
    "NÃO OK": "Não conforme",
    NOK: "Não conforme",
    S: "Substituir",
    SUBSTITUIR: "Substituir",
    R: "Ressalva",
    RESSALVA: "Ressalva",
    N_A: "Não aplicável",
    NA: "Não aplicável",
  };
  return map[normalized] || value;
}

function statusTone(value?: string | null): string {
  const normalized = (value || "").trim().toUpperCase();
  if (["OK", "C", "CONFORME"].includes(normalized)) return "text-emerald-700";
  if (["F", "NAO_OK", "NÃO OK", "NOK"].includes(normalized)) return "text-rose-700";
  if (["S", "SUBSTITUIR"].includes(normalized)) return "text-amber-700";
  if (["R", "RESSALVA"].includes(normalized)) return "text-amber-700";
  return "text-slate-700";
}

export default async function CertificadoFatoImersaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fatoId = Number.parseInt(id, 10);
  if (!Number.isFinite(fatoId)) notFound();

  const fato = await prisma.fatoImersao.findUnique({
    where: { id: fatoId },
    include: {
      certificado: true,
      verificacoes: { orderBy: { dataVerificacao: "desc" }, take: 1 },
    },
  });
  if (!fato) notFound();

  const navio = fato.shipId
    ? await prisma.navio.findUnique({ where: { id: fato.shipId }, select: { nome: true, matricula: true } })
    : null;
  const verificacao = fato.verificacoes[0] ?? null;
  const certificado = fato.certificado;
  const checklist = parseChecklistJson(verificacao?.checklistJson);

  const checklistRows = [
    { label: "Tecido exterior", value: verificacao?.tecidoExterior ?? checklist.tecidoExterior },
    { label: "Costuras", value: verificacao?.costuras ?? checklist.costuras },
    { label: "Fecho", value: verificacao?.fecho ?? checklist.fecho },
    { label: "Fitas refletoras", value: verificacao?.fitasReflectoras ?? checklist.fitasReflectoras },
    { label: "Capuz", value: verificacao?.capuz ?? checklist.capuz },
    { label: "Botas", value: verificacao?.botas ?? checklist.botas },
    { label: "Luvas", value: verificacao?.luvas ?? checklist.luvas },
    { label: "Luz", value: verificacao?.luz ?? checklist.luz },
    { label: "Apito", value: verificacao?.apito ?? checklist.apito },
    { label: "Impermeabilidade", value: verificacao?.impermeabilidade ?? checklist.impermeabilidade },
  ];

  if (!certificado) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center p-6">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sem certificado emitido</h1>
          <p className="mt-2 text-sm text-slate-600">
            O fato de imersão <span className="font-semibold">{fato.serial}</span> ainda não tem certificado. Abra a ficha do
            equipamento e emita o certificado depois de concluir a verificação.
          </p>
          <Link
            href={`/fatos-imersao/${fato.id}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à ficha do fato
          </Link>
        </div>
      </div>
    );
  }

  const aprovado = certificado.resultado?.toLowerCase().startsWith("aprov");

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff !important; }
          .certificado-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="mx-auto mb-5 flex max-w-[820px] items-center justify-between gap-3 px-4 print:hidden">
        <Link
          href={`/fatos-imersao/${fato.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar à ficha
        </Link>
        <PrintButton />
      </div>

      <div className="certificado-sheet mx-auto max-w-[820px] rounded-2xl border border-slate-300 bg-white p-10 shadow-xl print:max-w-none print:rounded-none">
        <header className="flex items-start justify-between gap-6 border-b-4 border-cyan-700 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-700">Orey Azores</p>
            <h1 className="mt-1 text-3xl font-black uppercase tracking-tight text-slate-900">Certificado de Inspeção</h1>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Fato de Imersão</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nº do certificado</p>
            <p className="font-mono text-lg font-bold text-slate-900">{certificado.numeroCertificado}</p>
            <p className="mt-1 text-[11px] text-slate-500">Emitido em {fmtDate(certificado.dataCertificado)}</p>
          </div>
        </header>

        <div
          className={`mt-6 flex items-center justify-between rounded-xl border px-5 py-4 ${
            aprovado ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {aprovado ? (
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
            ) : (
              <ShieldX className="h-6 w-6 text-rose-700" />
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resultado da inspeção</p>
              <p className={`text-lg font-bold ${aprovado ? "text-emerald-800" : "text-rose-800"}`}>{certificado.resultado}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Válido até</p>
            <p className="text-lg font-bold text-slate-900">{fmtDate(certificado.dataValidade)}</p>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Identificação do equipamento</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Nº de série" value={fato.serial} strong />
            <Field label="Marca" value={fato.marca} />
            <Field label="Modelo" value={fato.modelo} />
            <Field label="Tamanho" value={fato.tamanho} />
            <Field label="Tipo" value={fato.tipo} />
            <Field label="Material" value={fato.material} />
            <Field label="Data de fabrico" value={toDisplayMonth(fato.dataFabrico) || "—"} />
            <Field label="Navio" value={navio?.nome} />
            <Field label="Matrícula" value={navio?.matricula} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Inspeção</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Data da inspeção" value={fmtDate(verificacao?.dataVerificacao ?? fato.dataInspecao)} />
            <Field label="Próxima inspeção" value={fmtDate(fato.dataProxInspecao)} />
            <Field label="Inspetor" value={verificacao?.inspectorNome} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Resultados da verificação</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Componente / Ensaio</th>
                  <th className="px-4 py-2 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {checklistRows.map((row, index) => (
                  <tr key={row.label} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="px-4 py-2 text-slate-700">{row.label}</td>
                    <td className={`px-4 py-2 font-semibold ${statusTone(row.value)}`}>{statusLabel(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {(verificacao?.leakMetodo || verificacao?.leakResultado) && (
          <section className="mt-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Ensaio de estanquidade</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              <Field label="Método" value={verificacao?.leakMetodo} />
              <Field label="Pressão inicial" value={verificacao?.leakPressaoInicial} />
              <Field label="Pressão final" value={verificacao?.leakPressaoFinal} />
              <Field label="Variação" value={verificacao?.leakDeltaP} />
              <Field label="Duração (min)" value={verificacao?.leakDuracaoMin} />
              <Field label="Resultado" value={verificacao?.leakResultado} />
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Componentes e consumíveis</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            <Field label="Luz — referência" value={fato.luzRef} />
            <Field label="Luz — lote" value={fato.luzLote} />
            <Field label="Luz — validade" value={fmtDate(fato.luzValidade)} />
            <Field label="Luz — estado" value={statusLabel(checklist.luz)} />
            <Field label="Apito — referência" value={fato.apitoRef} />
            <Field label="Apito — lote" value={fato.apitoLote} />
            <Field label="Apito — validade" value={fmtDate(fato.apitoValidade)} />
            <Field label="Fecho — tipo" value={fato.fechoTipo} />
          </div>
        </section>

        {fato.codigoBER && (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm">
            <span className="font-semibold text-amber-900">Código BER: </span>
            <span className="text-amber-900">{berLabel(fato.codigoBER)}</span>
          </section>
        )}

        {certificado.observacoes && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Observações</h2>
            <p className="whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{certificado.observacoes}</p>
          </section>
        )}

        <section className="mt-10 grid grid-cols-3 gap-6 text-center text-xs text-slate-600">
          <div>
            <div className="mx-auto mb-2 h-16 border-b border-slate-400" />
            <p className="font-semibold text-slate-800">Inspetor</p>
            <p>{verificacao?.inspectorNome || "—"}</p>
          </div>
          <div>
            <div className="mx-auto mb-2 h-16 border-b border-slate-400" />
            <p className="font-semibold text-slate-800">Responsável técnico</p>
            <p>{certificado.emitidoPor || "—"}</p>
          </div>
          <div>
            <div className="mx-auto mb-2 h-16 border-b border-slate-400" />
            <p className="font-semibold text-slate-800">Data de emissão</p>
            <p>{fmtDate(certificado.dataCertificado)}</p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-[10px] leading-relaxed text-slate-500">
          <p>
            Certificado {certificado.numeroCertificado} · Documento emitido eletronicamente pelo Sistema Orey Azores. A validade
            está sujeita à realização das inspeções periódicas previstas.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value?: string | null; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`${strong ? "font-bold" : "font-medium"} text-slate-900`}>{value || "—"}</p>
    </div>
  );
}
