"use client";

import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { buildCertificatePayload } from './buildCertificatePayload';
import InspectionDocumentPreview from '@/components/jangadas/InspectionDocumentPreview';
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '@/lib/raft-document-rules';

/** Final review is read-only. Only the layout's final button persists the inspection. */
export default function Step9_Certificados() {
  const { inspectionData, jangadaId, inspecaoId, hasServerChanges } = useJangadaWizardStore();
  const draftPayload = useMemo(
    () => buildCertificatePayload(inspectionData, jangadaId, null),
    [inspectionData, jangadaId],
  );
  const sos = isSosDocumentRaft(inspectionData);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <FileText className="text-indigo-600" /> Pré-visualização dos documentos
        </h2>
        <p className="text-sm text-slate-600">
          Reveja os documentos da jangada {inspectionData.serial || 'sem identificação'} antes de registar a inspeção.
          A pré-visualização não guarda, não emite certificados e não movimenta stock.
        </p>
      </header>

      <p role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
        {inspecaoId && !hasServerChanges
          ? 'Esta inspeção já tem uma versão guardada. Pode comparar os documentos guardados com o rascunho atual.'
          : 'Está a rever um rascunho. Quando terminar a revisão, use “Guardar e finalizar inspeção” no rodapé.'}
        {' '}A emissão oficial fica disponível na ficha ou no histórico após a confirmação da gravação no servidor.
      </p>

      {sos && <p className="text-sm text-indigo-700">{SOS_DOCUMENT_NOTICE}</p>}
      <InspectionDocumentPreview
        jangadaId={jangadaId}
        inspecaoId={inspecaoId}
        inspectionDate={inspectionData.dataInspecao}
        draftPayload={draftPayload}
        documents={sos ? ['certificado'] : ['certificado', 'quadro']}
      />
    </div>
  );
}
