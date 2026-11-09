"use client";

import { useState } from 'react';
import { formatDateAuto } from '@/lib/date-utils';
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '@/lib/raft-document-rules';

export type PortalInspection = {
  id: number;
  certificadoNumero?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  documentStatus?: string;
  referenceDate?: string;
  downloadable?: boolean;
};

const labels: Record<string, string> = { valido: 'Valido', expirado: 'Expirado', substituido: 'Substituido', indisponivel: 'Indisponivel' };

export default function PortalInspectionDocuments({ jangadaId, inspecoes, raft }: { jangadaId: number; inspecoes: PortalInspection[]; raft?: { brand?: string; model?: string; serial?: string } }) {
  const sos = Boolean(raft && isSosDocumentRaft(raft));
  const [selectedId, setSelectedId] = useState(String(inspecoes[0]?.id || ''));
  const inspection = inspecoes.find(i => String(i.id) === selectedId);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function download(document: string, format: string) {
    if (!inspection?.downloadable || loading || (sos && document === 'quadro')) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ jangadaId: String(jangadaId), inspecaoId: String(inspection.id), document, format });
      const response = await fetch(`/api/portal/documentos?${params}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Documento indisponivel.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${document}-inspecao-${inspection.id}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao descarregar documento.');
    } finally {
      setLoading(false);
    }
  }

  if (!inspecoes.length) return <p>Sem inspecoes guardadas.</p>;
  return <section className="space-y-2 border-t border-slate-700 pt-3 text-xs">
    <label className="block">Inspecao exata
      <select className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2" value={selectedId} onChange={e => { setSelectedId(e.target.value); setError(''); }}>
        {inspecoes.map(i => <option key={i.id} value={i.id}>#{i.id} | {i.dataInspecao ? formatDateAuto(i.dataInspecao) : 'Sem data'} | {i.certificadoNumero || 'Sem certificado'}</option>)}
      </select>
    </label>
    {inspection && <>
      <p>Estado: <strong>{labels[inspection.documentStatus || 'indisponivel'] || 'Indisponivel'}</strong> | Referencia: {inspection.referenceDate ? formatDateAuto(inspection.referenceDate) : 'Sem data'}</p>
      <p>Validade: {inspection.dataProxInspecao ? formatDateAuto(inspection.dataProxInspecao) : 'Sem data'}</p>
      <div className="flex flex-wrap gap-2">
        {([['certificado', 'pdf', 'Certificado PDF'], ['quadro', 'pdf', 'Quadro PDF'], ['quadro', 'xlsx', 'Quadro XLSX']] as const).filter(([document]) => !sos || document === 'certificado').map(([document, format, label]) =>
          <button key={label} type="button" disabled={!inspection.downloadable || loading} onClick={() => void download(document, format)} className="rounded-lg border border-sky-700 px-3 py-2 text-sky-300 disabled:opacity-40">{label}</button>)}
      </div>
      {sos && <p className="text-sky-300">{SOS_DOCUMENT_NOTICE}</p>}
      <p className="text-slate-400">Reemissao de dados guardados. Historico inconsistente ou indisponivel bloqueia o download.</p>
    </>}
    {loading && <p role="status">A preparar documento...</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
