import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { formatValidityDisplay } from '@/lib/date-display';
import { fmtPeso } from '@/lib/liferaft-diagram-helpers';
import type { Prisma, ArtigoJangada } from '@prisma/client';

type JangadaArtigoRow = Partial<ArtigoJangada> & {
  item?: string;
  qtd?: number | string;
  validity?: string;
};

type Jangada = Omit<
  Prisma.JangadaGetPayload<{
    include: {
      certificadoAtivo: { include: { validities: true } };
      certificadosExtraidos: { include: { validities: true } };
    };
  }>,
  'artigos'
> & {
  artigos?: string | JangadaArtigoRow[] | null;
  error?: string;
};

function normalizeCapacityValue(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

function formatCapacityValue(value: unknown): string {
  const normalized = normalizeCapacityValue(value);
  return normalized === null ? '-' : String(normalized);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ serial: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { serial: rawSerial } = await params;
  const serial = rawSerial.trim();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!serial) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-bold">Jangada não encontrada</h2>
        <p>O número de série está vazio.</p>
      </div>
    );
  }

  const jangada = (await prisma.jangada.findUnique({
    where: { serial },
    include: {
      certificadoAtivo: { include: { validities: true } },
      certificadosExtraidos: { include: { validities: true } },
    },
  })) as Jangada | null;

  if (!jangada) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-bold">Jangada não encontrada</h2>
        <p>Não existe nenhuma jangada com o serial {serial}.</p>
      </div>
    );
  }

  const startInspectionParam = resolvedSearchParams?.startInspection;
  const shouldStartInspection = Array.isArray(startInspectionParam)
    ? startInspectionParam[0] === '1'
    : startInspectionParam === '1';

  if (jangada?.id) {
    if (shouldStartInspection) {
      redirect(`/jangadas/${jangada.id}?startInspection=1&fromSerial=1`);
    }
    redirect(`/jangadas/${jangada.id}`);
  }

  const artigos: JangadaArtigoRow[] = (() => {
    try {
      const a = jangada.artigos;
      if (!a) return [];
      return typeof a === 'string' ? (JSON.parse(a) as JangadaArtigoRow[]) : a;
    } catch { return []; }
  })();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">Ficha Jangada — {jangada.serial}</h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><b>Marca / Modelo:</b> {jangada.brand} / {jangada.model}</div>
          <div><b>Lotação:</b> {formatCapacityValue(jangada.capacity)}</div>
          <div><b>Tipo Pack:</b> {jangada.packType}</div>
          <div><b>Proprietário:</b> {jangada.owner || '-'}</div>
          <div><b>Data Fabrico:</b> {formatValidityDisplay(jangada.dataFabrico)}</div>
          <div><b>Data Inspeção:</b> {formatValidityDisplay(jangada.dataInspecao)}</div>
          <div><b>Próx. Insp.:</b> {formatValidityDisplay(jangada.dataProxInspecao)}</div>
          <div><b>Navio:</b> {jangada.shipNameManual || '-'}</div>
        </div>

        <section className="mt-6">
          <h3 className="font-semibold">Cilindro</h3>
          <ul className="ml-4 list-disc text-sm">
            <li>Serial: {jangada.cylinderSerial || '-'}</li>
            <li>Tara: {fmtPeso(jangada.cylinderTara, " kg")}</li>
            <li>Peso Bruto: {fmtPeso(jangada.cylinderPesoBruto, " kg")}</li>
            <li>CO2: {fmtPeso(jangada.cylinderCo2, " kg")}</li>
            <li>N2: {fmtPeso(jangada.cylinderN2, " kg")}</li>
            <li>Data Teste: {formatValidityDisplay(jangada.cylinderDataTeste)}</li>
            <li>Próx. Teste: {formatValidityDisplay(jangada.cylinderDataProxTeste)}</li>
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold">Artigos</h3>
          <ul className="ml-4 list-disc text-sm">
            {artigos.length === 0 && <li>Nenhum artigo associado.</li>}
            {artigos.map((a, i) => (
              <li key={i}>{a.name || a.item || JSON.stringify(a)} — Qtd: {a.quantidade ?? a.qtd ?? '-'} — Validade: {formatValidityDisplay(a.validade instanceof Date ? a.validade.toISOString().slice(0, 10) : (a.validade ?? a.validity))}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold">Certificados extraídos</h3>
          <ul className="ml-4 list-disc text-sm">
            {(jangada.certificadosExtraidos || []).length === 0 && <li>Nenhum certificado extraído.</li>}
            {(jangada.certificadosExtraidos || []).map((c) => (
              <li key={c.id}>{c.fileName} — Inspecão: {formatValidityDisplay(c.dataInspecao)} — Validades: {c.validities?.length || 0}</li>
            ))}
          </ul>
        </section>

        <div className="mt-6 flex gap-2">
          <Link href="/jangadas" className="px-3 py-2 bg-gray-200 rounded">Voltar</Link>
          <button onClick={() => window.print()} className="px-3 py-2 bg-blue-600 text-white rounded">Imprimir</button>
        </div>
      </div>
    </div>
  );
}
