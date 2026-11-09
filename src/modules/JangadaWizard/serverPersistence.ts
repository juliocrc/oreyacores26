import type { InspectionData } from './types';

export type ServerSection = 'data' | 'review' | 'signatures';
export type ServerBaseline = Record<ServerSection, string | null>;

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
    }
    return entry;
  });
}

export function serverFingerprints(input: InspectionData): Record<ServerSection, string> {
  const { signatureBase64, clienteAssinaturaBase64, clienteNomeAssinatura,
    orcamento, ...data } = input;
  const persistedData = Object.fromEntries(Object.entries(data)
    .filter(([key]) => !['globalStock', 'applicableServiceBulletins', 'shipDetails'].includes(key)));
  const { certificadoRevisao, ...budget } = orcamento || {};
  return {
    data: fingerprint({ ...persistedData, orcamento: { linhas: [], valorMaoObra: 0, valorDesconto: 0, isIsentoIva: false, ...budget } }),
    review: fingerprint(certificadoRevisao || { status: 'pendente' }),
    signatures: fingerprint({ signatureBase64: signatureBase64 || '',
      clienteAssinaturaBase64: clienteAssinaturaBase64 || '', clienteNomeAssinatura: clienteNomeAssinatura || '' }),
  };
}

export function serverChanges(data: InspectionData, baseline: ServerBaseline) {
  const current = serverFingerprints(data);
  return Object.fromEntries((Object.keys(current) as ServerSection[])
    .map(key => [key, current[key] !== baseline[key]])) as Record<ServerSection, boolean>;
}
