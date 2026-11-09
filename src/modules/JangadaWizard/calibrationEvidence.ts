import { parseFlexibleDateValue } from '@/lib/date-display';

/** Advisory only: missing or invalid dates must never look like valid calibration. */
export function calibrationEvidence(sensor: { nome?: string; referencia?: string; dataProxCalibracao?: string | null } | undefined, inspectionDate?: string | null): string | null {
  if (!sensor) return 'Não foi possível confirmar o equipamento selecionado nem a sua calibração.';
  const expires = parseFlexibleDateValue(sensor.dataProxCalibracao);
  const inspection = parseFlexibleDateValue(inspectionDate);
  if (!expires || !inspection) return `Calibração de "${sensor.nome || 'equipamento'}": data da inspeção ou da próxima calibração por confirmar.`;
  if (inspection > expires) return `O equipamento "${sensor.nome || 'selecionado'}"${sensor.referencia ? ` [Ref: ${sensor.referencia}]` : ''} está com calibração expirada desde ${expires.toLocaleDateString('pt-PT')}.`;
  return null;
}
