import { isPortalEquipmentDate } from './portal-equipment-date';

export const PORTAL_EQUIPMENT_TYPES = ['jangada', 'colete', 'fato', 'epirb', 'extintor'] as const;
export type PortalEquipmentType = typeof PORTAL_EQUIPMENT_TYPES[number];
type Field = { key: string; label: string; type?: 'date' | 'month' | 'number'; required?: boolean };
const common: Field[] = [{ key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }];
const inspection: Field = { key: 'dataInspecao', label: 'Ultima inspecao', type: 'date' };
const manufacture: Field = { key: 'dataFabrico', label: 'Data de fabrico', type: 'month' };
const notes: Field = { key: 'observacoes', label: 'Observacoes' };

// Basic creation fields from the existing equipment forms. Ownership and state are server-controlled.
export const PORTAL_EQUIPMENT_FIELDS: Record<PortalEquipmentType, Field[]> = {
  jangada: [
    { key: 'brand', label: 'Marca', required: true }, { key: 'model', label: 'Modelo', required: true },
    { key: 'capacity', label: 'Capacidade (pessoas)', type: 'number', required: true },
    { ...manufacture, required: true }, { key: 'packType', label: 'Tipo de pack', required: true },
    { key: 'launchType', label: 'Tipo de lancamento' }, { key: 'containerModel', label: 'Modelo do contentor' },
    { key: 'painterLength', label: 'Comprimento da retenida' }, { key: 'maxStowageHeight', label: 'Altura maxima de estiva' }, inspection,
  ],
  colete: [...common, { key: 'tamanho', label: 'Tamanho' }, manufacture, inspection, notes],
  fato: [...common, { key: 'tamanho', label: 'Tamanho' }, { key: 'tipo', label: 'Tipo' }, { key: 'material', label: 'Material' }, manufacture, inspection, notes],
  epirb: [...common, { key: 'tipo', label: 'Tipo' }, { key: 'hexId', label: 'Hex ID' },
    { key: 'dataValidadeBateria', label: 'Validade da bateria', type: 'month' }, inspection, notes],
  extintor: [...common, { key: 'capacidadeKg', label: 'Capacidade (kg)', type: 'number' },
    { key: 'tipoAgente', label: 'Agente extintor' }, { key: 'localizacao', label: 'Localizacao a bordo' }, manufacture,
    { key: 'dataUltimaRecarga', label: 'Ultima recarga', type: 'date' },
    { key: 'dataTesteHidraulico', label: 'Teste hidraulico', type: 'date' },
    { key: 'dataProxTesteHidraulico', label: 'Proximo teste hidraulico', type: 'date' }, notes],
};

export type PortalAssociationItem = {
  tipoEquipamento: PortalEquipmentType;
  serial: string;
  dataProxInspecao: string;
  novoEquipamento?: Record<string, string | number>;
};
export type SavedPortalAssociationItem = PortalAssociationItem & {
  modo: 'novo' | 'existente';
  existente?: { id: number; shipId: number | null; updatedAt: string };
};

export class PortalEquipmentError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_EQUIPMENT') { super(message); }
}

export function parsePortalNewEquipment(tipo: PortalEquipmentType, raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PortalEquipmentError('Preencha a ficha do novo equipamento.', 400, 'EQUIPMENT_DETAILS_REQUIRED');
  const fields = PORTAL_EQUIPMENT_FIELDS[tipo];
  if (Object.keys(raw).some(key => !fields.some(field => field.key === key))) throw new PortalEquipmentError('A ficha contem campos nao permitidos.');
  const data: Record<string, string | number> = {};
  for (const field of fields) {
    const value = (raw as Record<string, unknown>)[field.key];
    if (value === undefined || value === '') {
      if (field.required) throw new PortalEquipmentError(`Campo obrigatorio: ${field.label}.`);
      continue;
    }
    if (typeof value !== 'string' && !(field.type === 'number' && typeof value === 'number')) throw new PortalEquipmentError(`Campo invalido: ${field.label}.`);
    const text = String(value).trim();
    if (!text || text.length > (field.key === 'observacoes' ? 4000 : 200)) throw new PortalEquipmentError(`Campo invalido: ${field.label}.`);
    if (field.type === 'number') {
      const number = Number(text);
      if (!Number.isSafeInteger(number) || number <= 0 || number > 2147483647) throw new PortalEquipmentError(`Indique um inteiro positivo: ${field.label}.`);
      data[field.key] = number;
    } else {
      if (field.type === 'date' && !isPortalEquipmentDate(text)) throw new PortalEquipmentError(`Data invalida: ${field.label}.`);
      if (field.type === 'month' && (!/^\d{4}-\d{2}$/.test(text) || !isPortalEquipmentDate(`${text}-01`))) throw new PortalEquipmentError(`Mes invalido: ${field.label}.`);
      if (field.key === 'hexId' && !/^(?:[0-9a-f]{15}|[0-9a-f]{23})$/i.test(text)) throw new PortalEquipmentError('Hex ID invalido (15 ou 23 caracteres hexadecimais).');
      data[field.key] = field.key === 'hexId' ? text.toUpperCase() : text;
    }
  }
  return data;
}

export function parsePortalAssociationItems(raw: unknown): PortalAssociationItem[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw new PortalEquipmentError('Indique entre 1 e 50 equipamentos.');
  const seen = new Set<string>();
  return raw.map(item => {
    if (!item || typeof item !== 'object' || !PORTAL_EQUIPMENT_TYPES.includes(item.tipoEquipamento)
      || typeof item.serial !== 'string' || !item.serial.trim() || item.serial.trim().length > 200
      || !isPortalEquipmentDate(item.dataProxInspecao)) throw new PortalEquipmentError('Indique o tipo, serial e uma data real de proxima inspecao (AAAA-MM-DD).');
    const key = `${item.tipoEquipamento}:${item.serial.trim()}`;
    if (seen.has(key)) throw new PortalEquipmentError('Equipamento repetido na proposta.');
    seen.add(key);
    return { tipoEquipamento: item.tipoEquipamento, serial: item.serial.trim(), dataProxInspecao: item.dataProxInspecao,
      ...(item.novoEquipamento !== undefined ? { novoEquipamento: parsePortalNewEquipment(item.tipoEquipamento, item.novoEquipamento) } : {}) };
  });
}

export function parseSavedPortalAssociationItems(raw: unknown): SavedPortalAssociationItem[] {
  const items = parsePortalAssociationItems(raw);
  return items.map((item, index) => {
    const saved = (raw as SavedPortalAssociationItem[])[index];
    const snapshot = saved.existente;
    if (saved.modo === 'novo' && item.novoEquipamento !== undefined && !snapshot) return { ...item, modo: 'novo' };
    if (saved.modo === 'existente' && !item.novoEquipamento && snapshot && Number.isSafeInteger(snapshot.id) && snapshot.id > 0
      && (snapshot.shipId === null || (Number.isSafeInteger(snapshot.shipId) && snapshot.shipId > 0))
      && typeof snapshot.updatedAt === 'string' && Number.isFinite(Date.parse(snapshot.updatedAt))) return { ...item, modo: 'existente', existente: snapshot };
    throw new PortalEquipmentError('A proposta esta incompleta ou desatualizada. Solicite uma nova proposta.');
  });
}
