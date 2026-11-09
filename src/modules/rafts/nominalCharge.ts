import { findRaftTechnicalModel } from './raftModelData';

/**
 * Carga nominal de gás (CO2/N2) de um cilindro de insuflação, obtida da tabela
 * técnica do manual do fabricante para a marca/modelo/capacidade/configuração.
 * Fonte primária: tabelas de gas charges dos manuais DSB LR97/LR97L e RFD Surviva MKIII.
 */

export type NominalChargeMatch = {
  co2: number;
  n2: number;
  totalKg: number;
  capacity: number;
  configuration: 'TO' | 'DL' | null;
  modelName: string;
  codRef?: string;
  source: { doc?: string; revision?: string; note?: string } | null;
};

function normalizeRaftConfig(value?: string | null): 'TO' | 'DL' | null {
  const text = (value || '').toUpperCase().replace(/[._-]/g, ' ');
  if (text.includes('DAVIT') || /(^|\s)DL(\s|$)/.test(text)) return 'DL';
  if (text.includes('THROW') || text === 'TO' || text.startsWith('TO ')) return 'TO';
  if (text === 'DL' || text.startsWith('DL ')) return 'DL';
  return null;
}

export function resolveNominalCharge(args: {
  brand?: string | null;
  model?: string | null;
  capacity?: number | string | null;
  launchType?: string | null;
  packType?: string | null;
}): NominalChargeMatch | null {
  const capacity = parseCapacity(args.capacity);
  if (!capacity) return null;

  const technicalModel = findRaftTechnicalModel(args.brand, args.model);
  if (!technicalModel || !Array.isArray(technicalModel.specifications)) return null;

  // Partial model matches are useful for searching, but not for gas charges.
  const normalize = (value?: string | null) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizeModel = (value?: string | null) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9<>]/g, '');
  const requestedModel = normalizeModel(args.model);
  if (![technicalModel.name, ...(technicalModel.aliases || [])].some(name => normalizeModel(name) === requestedModel)) return null;
  // Generic Eurovinil model names can refer to different generations.
  if (normalize(args.brand) === 'EUROVINIL' && !/M14|SYNTESY/.test(requestedModel)) return null;

  const config = normalizeRaftConfig(args.launchType);
  const specs = technicalModel.specifications.filter(
    (spec) =>
      typeof spec.capacity === 'number' &&
      spec.capacity === capacity &&
      spec.cylinder &&
      typeof spec.cylinder.co2 === 'number'
  );
  if (specs.length === 0) return null;

  if (args.launchType?.trim() && !config) return null;
  const pack = normalize(args.packType);
  const candidates = specs.filter(spec => {
    const specConfig = normalizeRaftConfig(spec.configuration);
    if (spec.configuration && !specConfig) return false;
    if (config && specConfig && config !== specConfig) return false;
    if (spec.pack && pack && normalize(spec.pack) !== pack) return false;
    if (spec.pack && !pack && normalize(args.brand) === 'EUROVINIL') return false;
    return true;
  });
  // No first-row fallback: multiple rows may differ in pack, configuration or source.
  if (candidates.length !== 1) return null;
  const matched = candidates[0];
  // Syntesy catalogue values attributed to packing tables are not verified gas-charge data.
  if (normalize(args.brand) === 'EUROVINIL' && matched.source?.doc?.includes('Syntesy')) return null;

  const co2 = matched.cylinder?.co2 ?? 0;
  const n2 = matched.cylinder?.n2 ?? 0;

  return {
    co2,
    n2,
    totalKg: round(co2 + n2),
    capacity,
    configuration: normalizeRaftConfig(matched.configuration),
    modelName: technicalModel.name,
    codRef: matched.codRef,
    source: matched.source
      ? {
          doc: matched.source.doc,
          revision: matched.source.revision,
          note: matched.source.note,
        }
      : null,
  };
}

function parseCapacity(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const digits = String(value).replace(/[^0-9]/g, '');
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
