import { findRaftTechnicalModel } from './raftModelData';

/**
 * Carga de suspensão/sobrecarga do teste DL (davit-launch): 1,1 × G.
 * G = massa da jangada em serviço (lotação × 75 kg/pessoa + massa própria).
 * Valores de referência dos manuais; fallback à fórmula A.761(18)/SOLAS.
 */

export type DlLoadReference = {
  capacity: number;
  minKg: number | null;
  maxKg: number | null;
  formulaKg: number | null;
  durationMinutes: number;
  source: { doc?: string; note?: string } | null;
};

const DSB_LR97_LOADS: Record<number, { min: number; max: number }> = {
  12: { min: 1000, max: 1000 },
  16: { min: 1325, max: 1325 },
  20: { min: 1650, max: 1650 },
  25: { min: 2075, max: 2075 },
};

const MKIV_SUSPENSION_LOADS: Record<number, { min: number; max: number }> = {
  12: { min: 1293, max: 1343 },
  16: { min: 1656, max: 1706 },
  20: { min: 2019, max: 2069 },
  25: { min: 2472, max: 2522 },
};

const MKIV_FAMILY_TOKENS = [
  'mk iv',
  'mkiv',
  'surviva mkiv',
  'lr07',
  'seafarer',
  'crewsaver',
  'oceanmaster',
  'silver ev',
  'elliot',
  'guardian',
];

function normalizeToken(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isMkivFamily(modelName: string) {
  const n = normalizeToken(modelName);
  return MKIV_FAMILY_TOKENS.some((token) => n.includes(token));
}

function boxed(capacity: number): number | null {
  if (!Number.isInteger(capacity) || capacity <= 0) return null;
  return capacity;
}

export function getDlLoadReference(args: {
  brand?: string | null;
  model?: string | null;
  capacity?: number | string | null;
}): DlLoadReference | null {
  const capacity = parseCapacity(args.capacity);
  if (!capacity) return null;

  const technicalModel = findRaftTechnicalModel(args.brand, args.model);
  const modelName = technicalModel?.name ?? '';

  const mkiv = isMkivFamily(modelName) ? MKIV_SUSPENSION_LOADS[capacity] : null;
  if (mkiv) {
    return {
      capacity,
      minKg: mkiv.min,
      maxKg: mkiv.max,
      formulaKg: null,
      durationMinutes: 5,
      source: {
        doc: 'Marine MK IV Service Manual (M269-02)',
        note: 'P1 min/max = peso combinado mínimo/máximo da pele + lastro, medido no anel de elevação (TABLEAU 502).',
      },
    };
  }

  const dsb = normalizeToken(modelName).includes('lr97') ? DSB_LR97_LOADS[capacity] : null;
  if (dsb) {
    return {
      capacity,
      minKg: dsb.min,
      maxKg: dsb.max,
      formulaKg: null,
      durationMinutes: 5,
      source: {
        doc: 'LR97/LR97 L Service Manual',
        note: 'Lotações × 75 kg × 1,1, arredondado aos 25 kg (manual, secção 3.3.7).',
      },
    };
  }

  return {
    capacity,
    minKg: null,
    maxKg: null,
    formulaKg: Math.round(1.1 * 75 * capacity),
    durationMinutes: 5,
    source: null,
  };
}

function parseCapacity(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return boxed(Math.round(value));
  const digits = String(value).replace(/[^0-9]/g, '');
  const parsed = parseInt(digits, 10);
  return boxed(parsed);
}