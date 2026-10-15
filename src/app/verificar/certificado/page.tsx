"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type VerifyCertificate = {
  certNumber?: string | null;
  serial?: string | null;
  inspectionDate?: string | null;
  shipName?: string | null;
  technician?: string | null;
  status?: string | null;
  aprovacaoWp?: unknown;
};

type VerifyResult = {
  valid: boolean | null;
  hash?: string;
  certificate?: VerifyCertificate;
  error?: string;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value || "—"}</span>
    </div>
  );
}

function VerificarCertificadoContent() {
  const params = useSearchParams();
  const serial = params.get("serial") || "";
  const hash = params.get("h") || "";
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serial) return;

    const qs = new URLSearchParams({ serial });
    if (hash) qs.set("h", hash);

    fetch(`/api/publico/certificado?${qs.toString()}`)
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as VerifyResult;
        if (!res.ok && !payload?.certificate) {
          throw new Error(payload?.error || "Não foi possível verificar o certificado.");
        }
        setResult(payload);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível verificar o certificado.");
      })
      .finally(() => setLoading(false));
  }, [serial, hash]);

  const missingSerial = !serial;
  const valid = result?.valid;
  const tone =
    valid === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : valid === false
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  const title =
    valid === true
      ? "Certificado autêntico"
      : valid === false
        ? "Certificado não corresponde aos dados atuais"
        : "Certificado encontrado";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Verificação de certificado</h1>
        <p className="mt-1 text-sm text-slate-500">OREY Açores · Liferaft inspection certificate</p>
      </div>

      {missingSerial ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          Link inválido: falta o número de série da jangada.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          A verificar...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          {error}
        </div>
      ) : result ? (
        <>
          <div className={`rounded-xl border p-6 text-center ${tone}`}>
            <p className="text-lg font-semibold">{title}</p>
            {valid === false ? (
              <p className="mt-1 text-xs">
                O hash do PDF não coincide com os dados atuais. Pode ter sido alterado ou reemitido.
              </p>
            ) : null}
            {result.hash ? (
              <p className="mt-2 text-xs opacity-80">Hash: {result.hash}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Row label="Certificado n.º" value={result.certificate?.certNumber} />
            <Row label="N.º série" value={result.certificate?.serial} />
            <Row label="Navio" value={result.certificate?.shipName} />
            <Row label="Data de inspeção" value={result.certificate?.inspectionDate} />
            <Row label="Técnico" value={result.certificate?.technician} />
            <Row label="Resultado WP" value={result.certificate?.aprovacaoWp as string | undefined} />
            <Row label="Estado" value={result.certificate?.status} />
          </div>
        </>
      ) : null}


    </main>
  );
}

export default function VerificarCertificadoPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl px-4 py-10 text-center text-sm text-slate-500">
          A carregar...
        </main>
      }
    >
      <VerificarCertificadoContent />
    </Suspense>
  );
}
