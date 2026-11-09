"use client";
import { useEffect, useRef, useState } from 'react';

export type InspectionDocumentPreviewProps = {
  jangadaId: number | null;
  inspecaoId: number | null;
  inspectionDate?: string;
  draftPayload?: Record<string, unknown>;
  documents?: ReadonlyArray<'certificado' | 'quadro'>;
};

export default function InspectionDocumentPreview({ jangadaId, inspecaoId, inspectionDate, draftPayload, documents = ['certificado', 'quadro'] }: InspectionDocumentPreviewProps) {
  const [source, setSource] = useState<'draft' | 'saved'>(draftPayload ? 'draft' : 'saved');
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  // A displayed PDF must never silently describe a different inspection or draft.
  useEffect(() => {
    request.current?.abort();
    setPreview(null);
    setLoading(false);
  }, [jangadaId, inspecaoId, draftPayload, source]);

  async function open(document: 'certificado' | 'quadro') {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const response = await fetch('/api/documentos/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ document, source, jangadaId, inspecaoId,
          ...(source === 'draft' ? { payload: draftPayload } : {}) }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `Erro HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const date = response.headers.get('X-Inspection-Date') || inspectionDate || 'sem data';
      const id = response.headers.get('X-Inspection-Id') || inspecaoId;
      setPreview({ url: URL.createObjectURL(blob),
        label: `${document === 'certificado' ? 'Certificado OREY' : 'Quadro'} | ${source === 'saved' ? 'Guardada no servidor' : 'Rascunho atual (nao guardado)'} | Inspecao ${id ? `#${id}` : 'sem ID'} | ${date}` });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Erro no preview.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <section className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Pre-visualizacao de documentos">
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-sm font-bold text-slate-800">Pre-visualizar sem emitir</h3>
      <label className="text-xs text-slate-600">Origem{' '}
        <select aria-label="Origem do preview" value={source} onChange={event => setSource(event.target.value as 'draft' | 'saved')} className="rounded border p-2">
          {draftPayload && <option value="draft">Rascunho atual</option>}
          <option value="saved" disabled={!inspecaoId || !jangadaId}>Inspecao guardada</option>
        </select>
      </label>
      {documents.map(document => <button key={document} type="button"
        disabled={loading || (source === 'saved' && (!inspecaoId || !jangadaId))}
        onClick={() => void open(document)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-50">
        Ver {document === 'certificado' ? 'certificado' : 'quadro'}
      </button>)}
      {preview && <button type="button" onClick={() => setPreview(null)} className="text-xs font-bold">Fechar preview</button>}
    </div>
    <p className="mt-2 text-xs text-slate-500">Inspecao {inspecaoId ? `#${inspecaoId}` : 'sem ID'} | {inspectionDate || 'sem data'}. Consulta sem gravacao, sincronizacao ou pedido de pasta. Nao constitui emissao.</p>
    {loading && <p role="status" className="mt-3 text-sm">A preparar pre-visualizacao...</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {preview && <div className="mt-4">
      <p className="mb-2 text-xs font-bold text-slate-700">{preview.label} | PREVIEW, nao emitido</p>
      <iframe title={preview.label} src={preview.url} className="h-[70vh] min-h-80 w-full rounded border bg-white" />
    </div>}
  </section>;
}
