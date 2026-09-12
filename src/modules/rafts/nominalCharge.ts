import { findRaftTechnicalModel } from './raftModelData';
import type { RaftSpecification } from './types';

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
}): NominalChargeMatch | null {
  const capacity = parseCapacity(args.capacity);
  if (!capacity) return null;

  const technicalModel = findRaftTechnicalModel(args.brand, args.model);
  if (!technicalModel || !Array.isArray(technicalModel.specifications)) return null;

  const config = normalizeRaftConfig(args.launchType);
  const specs = technicalModel.specifications.filter(
    (spec) =>
      typeof spec.capacity === 'number' &&
      spec.capacity === capacity &&
      spec.cylinder &&
      typeof spec.cylinder.co2 === 'number'
  );
  if (specs.length === 0) return null;

  let matched: RaftSpecification | null = null;
  if (config) {
    matched = specs.find((spec) => normalizeRaftConfig(spec.configuration) === config) || null;
  }
  if (!matched) {
    matched = specs.find((spec) => !spec.configuration) || null;
  }
  if (!matched) {
    matched = specs[0];
  }

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