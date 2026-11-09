type Inspection = { id: number; certificadoNumero: string; status: string; dataInspecao: string; dataProxInspecao: string | null };

export function isPortalInspectionCertified(inspection: Inspection) {
  const status = String(inspection.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return status === 'concluida' && Boolean(inspection.certificadoNumero?.trim()) &&
    Number.isFinite(Date.parse(inspection.dataInspecao)) &&
    Boolean(inspection.dataProxInspecao) && Number.isFinite(Date.parse(inspection.dataProxInspecao!)) &&
    Date.parse(inspection.dataProxInspecao!) >= Date.parse(inspection.dataInspecao);
}

export function portalInspectionMetadata(inspection: Inspection, latestId: number | undefined, referenceDate: string) {
  const certified = isPortalInspectionCertified(inspection);
  return {
    documentStatus: !certified ? 'indisponivel' : inspection.id !== latestId ? 'substituido'
      : inspection.dataProxInspecao!.slice(0, 10) < referenceDate ? 'expirado' : 'valido',
    referenceDate,
    downloadable: certified,
  };
}
