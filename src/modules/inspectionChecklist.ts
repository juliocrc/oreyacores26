// Estrutura do checklist digital baseado no quadro de inspeção
// Cada seção representa uma etapa do wizard

import { resolveFiringHeadDesignation } from '@/lib/firing-head';
import { isSosRaft } from '@/lib/raft-model-rules';
import {
  findMatchingArticleForPackItem,
  getMandatoryPackItemsForRaft,
  type MandatoryPackItem,
} from './rafts/mandatoryPack';

export type ChecklistSection = {
  title: string;
  englishTitle?: string;
  fields: ChecklistField[];
};

export type ChecklistField = {
  label: string;
  englishLabel?: string;
  name: string;
  type: 'text' | 'number' | 'checkbox' | 'date' | 'select';
  options?: string[];
  autoFillFromRaft?: string; // nome do campo do cadastro da jangada
  required?: boolean;
  packItem?: MandatoryPackItem;
  bulletinId?: string;
};

export type ChecklistRaftInput = {
  serial?: string;
  brand?: string;
  model?: string;
  capacity?: number;
  owner?: string;
  dataFabrico?: string;
  packType?: string;
  containerModel?: string;
  cylinderCabecaDisparoRef?: string;
  cylinderCabecaDisparoDescricao?: string;
  cylinderSistema?: string;
  tuboIdentificacao?: string;
  dataInspecao?: string;
  dataProxInspecao?: string;
  shipDetails?: unknown;
  shipNameManual?: string;
  cylinder?: {
    serial?: string;
    tara?: string;
    pesoBruto?: string;
    co2?: string;
    n2?: string;
    dataTeste?: string;
    dataProxTeste?: string;
    sistema?: string;
  };
  artigos?: Array<{
    name?: string;
    quantidade?: number;
    validade?: string;
    referencia?: string;
  }>;
  mandatoryPackItems?: MandatoryPackItem[];
  serviceBulletinsApplied?: Record<string, string>;
};

export type InspectionPlan = {
  wpRule: string;
  giDates: string[];
  fsNapDates: string[];
  nextGiDate: string;
  nextFsNapDate: string;
};

export const QUADRO_ARTIGOS_BASE = [
  'Pá de remo',
  'Esponja',
  'Apito',
  'Faca flutuante',
  'Kit de reparação',
  'Luz flutuante',
  'Luz interior',
  'Luz de localização',
  'Espelho de sinalização',
  'Bússola',
  'Saco de água',
  'Rações',
  'Água potável',
  'Saco de enjoo',
  'Manual de sobrevivência',
  'Manual de sinais',
  'Kit de primeiros socorros',
  'Fogos de mão',
  'Sinal fumígeno',
  'Sinal foguete',
  'Âncora flutuante',
  'Linha de amarração',
  'Linha de lançamento',
  'Caneca',
  'Cobertura térmica',
  'Bolsa de acessórios',
  'Balde',
  'Esponja absorvente',
  'Cordão de segurança',
  'Outros',
];

const CHECKLIST_VALIDITY_FIELD_BY_SOURCE: Record<string, string> = {
  luz_exterior_bateria: 'validade_luzes_exteriores',
  luz_interior_bateria: 'validade_bateria',
  bateria_litio: 'validade_bateria',
  pilhas_lanterna: 'validade_pilhas_lanterna',
  saco_agua: 'validade_agua',
  racoes_alimentares: 'validade_racoes',
  ambulancia: 'validade_farmacia',
  comprimidos_enjoo: 'validade_comprimidos',
  foguetoes_paraquedas: 'validade_paraquedas',
  fachos_mao: 'validade_fachos_mao',
  potes_fumo: 'validade_potes_fumo',
};

function slugifyName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolvePath(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((acc, part) => (acc == null ? undefined : (acc as Record<string, unknown>)[part]), source);
}

function normalizeChecklistComparable(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlastimoChecklistRaft(raft?: ChecklistRaftInput) {
  const brand = normalizeChecklistComparable(raft?.brand);
  const model = normalizeChecklistComparable(raft?.model);
  return brand.includes('plastimo') || model.includes('plastimo');
}

function isSurvivaMkivChecklistRaft(raft?: ChecklistRaftInput) {
  const brand = normalizeChecklistComparable(raft?.brand);
  const model = normalizeChecklistComparable(raft?.model);
  const packType = normalizeChecklistComparable(raft?.packType);
  const containerModel = normalizeChecklistComparable(raft?.containerModel);
  const brandModel = `${brand} ${model}`.trim();

  return (
    brandModel.includes('mkiv') ||
    brandModel.includes('mk iv') ||
    brandModel.includes('mk4') ||
    brandModel.includes('lr07') ||
    brandModel.includes('lr 07') ||
    packType.includes('mkiv') ||
    packType.includes('mk iv') ||
    containerModel.includes('mk16')
  );
}

function isSurvivaMkiiiChecklistRaft(raft?: ChecklistRaftInput) {
  const brand = normalizeChecklistComparable(raft?.brand);
  const model = normalizeChecklistComparable(raft?.model);
  const packType = normalizeChecklistComparable(raft?.packType);
  const containerModel = normalizeChecklistComparable(raft?.containerModel);
  const brandModel = `${brand} ${model}`.trim();

  if (isSurvivaMkivChecklistRaft(raft)) return false;

  return (
    brandModel.includes('mkiii') ||
    brandModel.includes('mk iii') ||
    brandModel.includes('mk3') ||
    brandModel.includes('mk 3') ||
    brandModel.includes('lr97') ||
    brandModel.includes('lr 97') ||
    brandModel.includes('lr35') ||
    brandModel.includes('lr 35') ||
    packType.includes('mkiii') ||
    packType.includes('mk iii') ||
    containerModel.includes('mkiii') ||
    containerModel.includes('mk iii') ||
    (brandModel.includes('surviva') && !brandModel.includes('mkiv') && !brandModel.includes('mk iv') && !brandModel.includes('mk4'))
  );
}

function isMk16ChecklistContainer(raft?: ChecklistRaftInput) {
  const containerModel = normalizeChecklistComparable(raft?.containerModel);
  return containerModel.includes('mk16') || containerModel.includes('mk 16');
}

function isValiseChecklistContainer(raft?: ChecklistRaftInput) {
  const containerModel = normalizeChecklistComparable(raft?.containerModel);
  return containerModel.includes('valise') || containerModel.includes('bag') || containerModel.includes('saco');
}

function buildPackagingModelField(raft?: ChecklistRaftInput): ChecklistField {
  return isValiseChecklistContainer(raft)
    ? {
        label: 'Modelo do Saco / Valise',
        englishLabel: 'Bag / Valise Model',
        name: 'container_model',
        type: 'text',
        autoFillFromRaft: 'containerModel',
      }
    : {
        label: 'Modelo do Contentor',
        englishLabel: 'Container Model',
        name: 'container_model',
        type: 'text',
        autoFillFromRaft: 'containerModel',
      };
}

function buildPackagingChecklistSection(raft?: ChecklistRaftInput): ChecklistSection {
  const isValise = isValiseChecklistContainer(raft);

  return {
    title: isValise ? 'Saco / Valise' : 'Contentor',
    englishTitle: isValise ? 'Bag / Valise' : 'Container',
    fields: [
      ...(isValise
        ? [{ label: 'Fecho da Valise', englishLabel: 'Valise Closure', name: 'fecho_valise_ok', type: 'checkbox' as const }]
        : [{ label: 'Cinta de Fecho', englishLabel: 'Bursting Band / Tape', name: 'cinta_fecho', type: 'checkbox' as const }]),
      { label: 'Saco de Retenida', englishLabel: 'Painter Line Bag', name: 'saco_retenida', type: 'checkbox' },
      { label: 'Comprimento da Retenida', englishLabel: 'Length Painter Line', name: 'comprimento_retenida', type: 'text' },
      {
        label: isValise ? 'Marcas da Valise / Invólucro' : 'Marcas do Invólucro',
        englishLabel: isValise ? 'Markings on Valise / Cover' : 'Markings on Container',
        name: 'marcas_involucro',
        type: 'checkbox',
      },
    ],
  };
}

function isSmallMkivChecklistCapacity(raft?: ChecklistRaftInput) {
  const capacity = Number(raft?.capacity || 0);
  return [4, 6, 8].includes(capacity);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mmYyyyToIso(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  const mmYy = raw.match(/^(\d{1,2})\/(\d{2})$/);
  const mmDashYyyy = raw.match(/^(\d{1,2})-(\d{4})$/);
  const mmDashYy = raw.match(/^(\d{1,2})-(\d{2})$/);

  let month: number | null = null;
  let year: number | null = null;

  if (mmYyyy) {
    month = parseInt(mmYyyy[1], 10);
    year = parseInt(mmYyyy[2], 10);
  } else if (mmYy) {
    month = parseInt(mmYy[1], 10);
    year = 2000 + parseInt(mmYy[2], 10);
  } else if (mmDashYyyy) {
    month = parseInt(mmDashYyyy[1], 10);
    year = parseInt(mmDashYyyy[2], 10);
  } else if (mmDashYy) {
    month = parseInt(mmDashYy[1], 10);
    year = 2000 + parseInt(mmDashYy[2], 10);
  }

  if (month == null || year == null) return null;
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// Maps validade_* checklist fields to article name keywords for auto-fill
const ARTIGO_VALIDADE_FIELD_KEYWORDS: Array<{ field: string; tokens: string[] }> = [
  { field: 'validade_luzes_exteriores', tokens: ['luz exteriore', 'luzes exteriore', 'exterior light', 'luz exterior', 'luzes exterior'] },
  { field: 'validade_bateria', tokens: ['bateria', 'battery'] },
  { field: 'validade_pilhas_lanterna', tokens: ['torch batterie', 'torch batteries', 'pilhas para lanterna', 'pilhas lanterna'] },
  { field: 'validade_fachos_mao', tokens: ['facho', 'fogo de mao', 'handflare', 'hand flare'] },
  { field: 'validade_agua', tokens: ['agua potavel', 'agua potável', 'potable water', 'drinking water', 'agua'] },
  { field: 'validade_racoes', tokens: ['racao', 'racoes', 'ration', 'alimento', 'food'] },
  { field: 'validade_paraquedas', tokens: ['paraquedas', 'parachute signal', 'rocket parachute', 'foguete'] },
  { field: 'validade_potes_fumo', tokens: ['fumo', 'fumigeno', 'smoke signal', 'pote de fumo', 'potes de fumo'] },
  { field: 'validade_farmacia', tokens: ['farmacia', 'first aid', 'kit de primeiros', 'primeiros socorros', 'ambulancia', 'ambulância'] },
  { field: 'validade_comprimidos', tokens: ['comprimido', 'pastilha', 'enjoo', 'seasick', 'tablet'] },
];

function parseInputDate(value?: string) {
  if (!value) return null;
  const iso = mmYyyyToIso(value);
  const parsed = new Date(iso ?? value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function addYears(baseDate: Date, years: number) {
  const next = new Date(baseDate);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function buildInspectionPlanFromFabricationDate(
  dataFabrico?: string,
  options?: { yearsAhead?: number; referenceDate?: string | Date },
): InspectionPlan {
  const fabricationDate = parseInputDate(dataFabrico);
  if (!fabricationDate) {
    return {
      wpRule: 'WP: aplica-se a todas as inspeções.',
      giDates: [],
      fsNapDates: [],
      nextGiDate: '',
      nextFsNapDate: '',
    };
  }

  const yearsAhead = options?.yearsAhead ?? 25;
  const referenceDate = typeof options?.referenceDate === 'string'
    ? parseInputDate(options.referenceDate)
    : (options?.referenceDate || new Date());
  const ref = referenceDate || new Date();

  const giDates: string[] = [];
  const fsNapDates: string[] = [];

  for (let yearOffset = 5; yearOffset <= yearsAhead; yearOffset += 5) {
    giDates.push(toIsoDate(addYears(fabricationDate, yearOffset)));
  }

  for (let yearOffset = 10; yearOffset <= yearsAhead; yearOffset += 1) {
    fsNapDates.push(toIsoDate(addYears(fabricationDate, yearOffset)));
  }

  const nextGiDate =
    giDates.find((date) => new Date(date).getTime() >= ref.getTime()) ||
    giDates[giDates.length - 1] ||
    '';

  const nextFsNapDate =
    fsNapDates.find((date) => new Date(date).getTime() >= ref.getTime()) ||
    fsNapDates[fsNapDates.length - 1] ||
    '';

  return {
    wpRule: 'WP: aplica-se a todas as inspeções.',
    giDates,
    fsNapDates,
    nextGiDate,
    nextFsNapDate,
  };
}

const STATIC_EMERGENCY_FIELDS: ChecklistField[] = [
  { label: 'Saco de Água', englishLabel: 'Drinking Water', name: 'saco_agua', type: 'checkbox' },
  { label: 'Validade Água', englishLabel: 'Drinking Water Validity', name: 'validade_agua', type: 'date' },
  { label: 'Copo Graduado', englishLabel: 'Drinking Cup', name: 'copo_graduado', type: 'checkbox' },
  { label: 'Rações Alimentares 0,5 Kg', englishLabel: 'Food Rations 0,5 Kg', name: 'racoes_alimentares', type: 'checkbox' },
  { label: 'Validade Rações', englishLabel: 'Food Rations Validity', name: 'validade_racoes', type: 'date' },
  { label: 'Ajudas Térmicas', englishLabel: 'Thermal Protective Aids', name: 'ajudas_termicas', type: 'checkbox' },
  { label: 'Farmácia Solas', englishLabel: 'First Aid Kit', name: 'ambulancia', type: 'checkbox' },
  { label: 'Validade Farmácia Solas', englishLabel: 'First Aid Validity', name: 'validade_farmacia', type: 'date' },
  { label: 'Comprimidos p/ Enjoo', englishLabel: 'Seasickness Tablets', name: 'comprimidos_enjoo', type: 'checkbox' },
  { label: 'Validade Comprimidos', englishLabel: 'Seasickness Validity', name: 'validade_comprimidos', type: 'date' },
  { label: 'Foguetes Paraquedas', englishLabel: 'Parachute Rockets', name: 'foguetoes_paraquedas', type: 'checkbox' },
  { label: 'Validade Paraquedas', englishLabel: 'Parachute Rockets Validity', name: 'validade_paraquedas', type: 'date' },
  { label: 'Fachos de Mão', englishLabel: 'Red Hand Flares', name: 'fachos_mao', type: 'checkbox' },
  { label: 'Validade Fachos de Mão', englishLabel: 'Red Hand Flares Validity', name: 'validade_fachos_mao', type: 'date' },
  { label: 'Potes de Fumo', englishLabel: 'Floating Smoke Signals', name: 'potes_fumo', type: 'checkbox' },
  { label: 'Validade Potes de Fumo', englishLabel: 'Floating Smoke Signals Validity', name: 'validade_potes_fumo', type: 'date' },
  { label: 'Lanterna', englishLabel: 'Torch with Spares', name: 'lanterna', type: 'checkbox' },
  { label: 'Pilhas para Lanterna', englishLabel: 'Torch Batteries', name: 'pilhas_lanterna', type: 'checkbox' },
  { label: 'Validade Pilhas Lanterna', englishLabel: 'Torch Batteries Validity', name: 'validade_pilhas_lanterna', type: 'date' },
  { label: 'Apito', englishLabel: 'Whistle', name: 'apito', type: 'checkbox' },
  { label: 'Estojo de Pesca', englishLabel: 'Fishing Kit', name: 'estojo_pesca', type: 'checkbox' },
  { label: 'Esponjas', englishLabel: 'Sponges', name: 'esponjas', type: 'checkbox' },
  { label: 'Abre-Latas', englishLabel: 'Tin Openers', name: 'abre_latas', type: 'checkbox' },
  { label: 'Tesouras', englishLabel: 'Scissors', name: 'tesouras', type: 'checkbox' },
  { label: 'Sacos para Enjoo', englishLabel: 'Seasickness Bags', name: 'sacos_enjoo', type: 'checkbox' },
  { label: 'Heliógrafo', englishLabel: 'Signalling Mirror', name: 'heliografo', type: 'checkbox' },
  { label: 'Manual de Sobrevivência', englishLabel: 'Survival Manual', name: 'manual_sobrevivencia', type: 'checkbox' },
  { label: 'Quadro de Sinais', englishLabel: 'Signalling Table', name: 'quadro_sinais', type: 'checkbox' },
];

const STATIC_EQUIPMENT_FIELDS: ChecklistField[] = [
  { label: 'Pagaias', englishLabel: 'Paddles', name: 'pagaias', type: 'checkbox' },
  { label: 'Fole', englishLabel: 'Bellows', name: 'fole', type: 'checkbox' },
  { label: 'Jogo de Reparação', englishLabel: 'Repair Kit', name: 'jogo_reparacao', type: 'checkbox' },
  { label: 'Âncora Flutuante com Linha', englishLabel: 'Sea Anchor with Line', name: 'ancora_flutuante_linha', type: 'checkbox' },
  { label: 'Batedouro', englishLabel: 'Bailer', name: 'batedouro', type: 'checkbox' },
  { label: 'Reflector de Radar', englishLabel: 'Radar Reflector', name: 'reflector_radar', type: 'checkbox' },
];

type PackChecklistSection = 'emergency' | 'equipment';

const EMERGENCY_PRIORITY_FIELD_ORDER: string[] = [
  'validade_fachos_mao',
  'validade_paraquedas',
  'validade_farmacia',
  'validade_comprimidos',
  'validade_agua',
  'validade_racoes',
];

type KnownQuadroChecklistField = {
  section: PackChecklistSection;
  field: ChecklistField;
  validityField?: ChecklistField;
};

type ResolvedQuadroChecklistEntry = {
  section: PackChecklistSection;
  dedupeKey: string;
  fields: ChecklistField[];
};

const KNOWN_QUADRO_CHECKLIST_FIELDS: KnownQuadroChecklistField[] = [
  ...STATIC_EMERGENCY_FIELDS.filter((field) => field.type === 'checkbox').map((field) => ({
    section: 'emergency' as const,
    field,
    validityField: STATIC_EMERGENCY_FIELDS.find((candidate) => candidate.name === CHECKLIST_VALIDITY_FIELD_BY_SOURCE[field.name]),
  })),
  ...STATIC_EQUIPMENT_FIELDS.filter((field) => field.type === 'checkbox').map((field) => ({
    section: 'equipment' as const,
    field,
  })),
];

const PLASTIMO_WORKSHEET_FIELDS: ChecklistField[] = [
  { label: 'Nº Estação Plastimo', englishLabel: 'Plastimo Station Number', name: 'plastimo_station_number', type: 'text' },
  { label: 'Dealer', englishLabel: 'Dealer', name: 'plastimo_dealer', type: 'text' },
  { label: 'Observações de Serviço', englishLabel: 'Service Remarks', name: 'plastimo_service_remarks', type: 'text' },
  { label: 'Controlo Cabeça de Disparo', englishLabel: 'Firing Head Control', name: 'plastimo_firing_head_control', type: 'checkbox' },
  { label: 'Data Prova/Ensaio', englishLabel: 'Proof Test Date', name: 'plastimo_proof_test_date', type: 'date' },
  { label: 'Peso na Pesagem (kg)', englishLabel: 'Weight when Weighed', name: 'plastimo_weight_when_weighed', type: 'number' },
  { label: 'Teste Pressão - Hora Início', englishLabel: 'Pressure Test Start Time', name: 'plastimo_pressure_test_start_time', type: 'text' },
  { label: 'Teste Pressão - Hora Fim', englishLabel: 'Pressure Test End Time', name: 'plastimo_pressure_test_end_time', type: 'text' },
  { label: 'Pressão Câmara Superior Inicial', englishLabel: 'Upper Chamber Initial Pressure', name: 'plastimo_pressure_sup_init', type: 'number' },
  { label: 'Pressão Câmara Superior Final', englishLabel: 'Upper Chamber Final Pressure', name: 'plastimo_pressure_sup_final', type: 'number' },
  { label: 'Pressão Câmara Inferior Inicial', englishLabel: 'Lower Chamber Initial Pressure', name: 'plastimo_pressure_inf_init', type: 'number' },
  { label: 'Pressão Câmara Inferior Final', englishLabel: 'Lower Chamber Final Pressure', name: 'plastimo_pressure_inf_final', type: 'number' },
  { label: 'Temperatura Inicial', englishLabel: 'Initial Temperature', name: 'plastimo_temp_init', type: 'number' },
  { label: 'Temperatura Final', englishLabel: 'Final Temperature', name: 'plastimo_temp_final', type: 'number' },
  { label: 'Ajuste de Temperatura', englishLabel: 'Temperature Adjustment', name: 'plastimo_temp_adjustment', type: 'number' },
  { label: 'Ajustamento Total', englishLabel: 'Total Adjustment', name: 'plastimo_total_adjustment', type: 'number' },
  { label: 'Tubos A/B/C', englishLabel: 'Tubes A/B/C', name: 'plastimo_tubes_abc', type: 'checkbox' },
  { label: 'Válvulas de Insuflação A/B/C', englishLabel: 'Inflation Valves A/B/C', name: 'plastimo_inflation_valves_abc', type: 'checkbox' },
  { label: 'Válvulas de Alívio A/B/C', englishLabel: 'Pressure Relief Valves A/B/C', name: 'plastimo_relief_valves_abc', type: 'checkbox' },
  { label: 'Piso Duplo', englishLabel: 'Double Floor', name: 'plastimo_double_floor', type: 'checkbox' },
  { label: 'Costuras', englishLabel: 'Seaming', name: 'plastimo_seaming', type: 'checkbox' },
  { label: 'Fechos/Cremalheiras', englishLabel: 'Zippers and Fasteners', name: 'plastimo_zippers_fasteners', type: 'checkbox' },
  { label: 'Escadas', englishLabel: 'Ladders', name: 'plastimo_ladders', type: 'checkbox' },
  { label: 'Tenda/Canópia', englishLabel: 'Tent / Canopy', name: 'plastimo_tent', type: 'checkbox' },
  { label: 'Fitas Refletoras de Radar', englishLabel: 'Radar Reflective Tapes', name: 'plastimo_radar_reflective_tapes', type: 'checkbox' },
  { label: 'Bolsas de Lastro', englishLabel: 'Ballast Pockets', name: 'plastimo_ballast_pockets', type: 'checkbox' },
  { label: 'Estado da Colagem', englishLabel: 'Gluing', name: 'plastimo_gluing', type: 'checkbox' },
  { label: 'Equipamento Seguro/Fixado', englishLabel: 'Secure the Equipment', name: 'plastimo_secure_equipment', type: 'checkbox' },
  { label: 'Válvulas de Alívio Operacionais', englishLabel: 'Pressure Relief Valves Operational', name: 'plastimo_relief_valves_operational', type: 'checkbox' },
  { label: 'Válvulas de Insuflação Fechadas', englishLabel: 'Inflation Valves Closed', name: 'plastimo_inflation_valves_closed', type: 'checkbox' },
  { label: 'Aperto Válvula Arco (torque)', englishLabel: 'Tighten Arch Valve (Torque)', name: 'plastimo_tighten_arch_valve', type: 'checkbox' },
  { label: 'Fitas adesivas em posição', englishLabel: 'All Adhesive Tape in Place', name: 'plastimo_all_adhesive_tape_in_place', type: 'checkbox' },
  { label: 'Apertar união T (5 porcas)', englishLabel: 'Tighten T-Union (5 Nuts)', name: 'plastimo_tighten_t_union_5_nuts', type: 'checkbox' },
  { label: 'Fixar escadas com fita', englishLabel: 'Fasten Ladders with Adhesive Tape', name: 'plastimo_fasten_ladders_tape', type: 'checkbox' },
  { label: 'Dobragem conforme manual', englishLabel: 'Folding per Technical Manual', name: 'plastimo_folding_per_manual', type: 'checkbox' },
  { label: 'Remover anel de segurança', englishLabel: 'Remove Safety Ring', name: 'plastimo_remove_safety_ring', type: 'checkbox' },
  { label: 'Fixar arco ao tubo superior', englishLabel: 'Fasten Arch to Upper Tube', name: 'plastimo_fasten_arch_upper_tube', type: 'checkbox' },
  { label: 'Embalagem a vácuo', englishLabel: 'Vacuum Packing', name: 'plastimo_vacuum_packing', type: 'checkbox' },
  { label: 'Nó retenida / lanyard disparo', englishLabel: 'Knot Painter Line / Firing Lanyard', name: 'plastimo_knot_painter_lanyard', type: 'checkbox' },
  { label: 'Selar fio de quebra (chumbo)', englishLabel: 'Seal Breaking Thread with Lead Seal', name: 'plastimo_seal_breaking_thread', type: 'checkbox' },
  { label: 'Handle da retenida no velcro', englishLabel: 'Fit Painter Handle in Velcro', name: 'plastimo_fit_painter_handle_velcro', type: 'checkbox' },
  { label: 'Retenida no tubo PVC', englishLabel: 'Place Painter Line in PVC Tube', name: 'plastimo_place_painter_line_pvc_tube', type: 'checkbox' },
  { label: 'Posição da porca de latão', englishLabel: 'Brass Nut Position', name: 'plastimo_brass_nut_position', type: 'checkbox' },
  { label: 'Cintar Contentor', englishLabel: 'Strap Container', name: 'plastimo_strap_container', type: 'checkbox' },
  { label: 'Selar contentor com fita', englishLabel: 'Seal Container with Tape', name: 'plastimo_seal_container_tape', type: 'checkbox' },
  { label: 'Inserir tampão estanque', englishLabel: 'Insert Waterproof Container Plug', name: 'plastimo_insert_waterproof_plug', type: 'checkbox' },
  { label: 'Serviço válido até', englishLabel: 'Service Valid Until', name: 'plastimo_service_valid_until', type: 'date' },
  { label: 'Nome técnico licenciado', englishLabel: 'Licensed Technician Name', name: 'plastimo_licensed_technician_name', type: 'text' },
  { label: 'Carimbo estação de serviço', englishLabel: 'Service Station Stamp', name: 'plastimo_service_station_stamp', type: 'checkbox' },
];

function resolveKnownQuadroChecklistField(articleName: string) {
  const normalizedArticle = normalizeChecklistComparable(articleName);
  if (!normalizedArticle) return null;

  return KNOWN_QUADRO_CHECKLIST_FIELDS.find(({ field }) => {
    const labels = [field.label, field.englishLabel].filter(Boolean) as string[];
    return labels.some((label) => {
      const normalizedLabel = normalizeChecklistComparable(label);
      return normalizedLabel === normalizedArticle
        || normalizedLabel.includes(normalizedArticle)
        || normalizedArticle.includes(normalizedLabel);
    });
  }) || null;
}

function buildQuadroArticleChecklistEntries(raft?: ChecklistRaftInput): ResolvedQuadroChecklistEntry[] {
  if (!Array.isArray(raft?.artigos) || raft.artigos.length === 0) return [];

  const mandatoryItems = Array.isArray(raft?.mandatoryPackItems)
    ? raft.mandatoryPackItems
    : getMandatoryPackItemsForRaft({
        brand: raft?.brand,
        model: raft?.model,
        packType: raft?.packType,
        capacity: raft?.capacity,
      });
  const seenKeys = new Set<string>();
  const entries: ResolvedQuadroChecklistEntry[] = [];

  for (const article of raft.artigos) {
    const articleName = String(article?.name || '').trim();
    if (!articleName) continue;

    const matchedMandatoryItem = mandatoryItems.find((item) => findMatchingArticleForPackItem(item, [article]));
    if (matchedMandatoryItem) {
      if (seenKeys.has(matchedMandatoryItem.checklistName)) continue;
      seenKeys.add(matchedMandatoryItem.checklistName);

      entries.push({
        section: matchedMandatoryItem.section === 'equipment' ? 'equipment' : 'emergency',
        dedupeKey: matchedMandatoryItem.checklistName,
        fields: [
          {
            label: matchedMandatoryItem.label,
            englishLabel: matchedMandatoryItem.englishLabel,
            name: matchedMandatoryItem.checklistName,
            type: 'checkbox',
            packItem: matchedMandatoryItem,
          },
          ...(matchedMandatoryItem.validityFieldName ? [{
            label: `Validade ${matchedMandatoryItem.label}`,
            englishLabel: `${matchedMandatoryItem.englishLabel} Validity`,
            name: matchedMandatoryItem.validityFieldName,
            type: 'date' as const,
            packItem: matchedMandatoryItem,
          }] : []),
        ],
      });
      continue;
    }

    const knownQuadroField = resolveKnownQuadroChecklistField(articleName);
    if (knownQuadroField) {
      if (seenKeys.has(knownQuadroField.field.name)) continue;
      seenKeys.add(knownQuadroField.field.name);

      entries.push({
        section: knownQuadroField.section,
        dedupeKey: knownQuadroField.field.name,
        fields: [
          knownQuadroField.field,
          ...(knownQuadroField.validityField ? [knownQuadroField.validityField] : []),
        ],
      });
      continue;
    }

    const genericField = {
      label: articleName,
      name: `artigo_${slugifyName(articleName)}`,
      type: 'checkbox' as const,
    };
    const genericKey = normalizeChecklistComparable(articleName);
    if (!genericKey || seenKeys.has(genericKey)) continue;
    seenKeys.add(genericKey);

    entries.push({
      section: 'emergency',
      dedupeKey: genericKey,
      fields: [genericField],
    });
  }

  return entries;
}

function buildMandatoryPackChecklistFields(
  raft: ChecklistRaftInput | undefined,
  section: PackChecklistSection,
): ChecklistField[] {
  const mandatoryItems = (Array.isArray(raft?.mandatoryPackItems)
    ? raft.mandatoryPackItems
    : getMandatoryPackItemsForRaft({
        brand: raft?.brand,
        model: raft?.model,
        packType: raft?.packType,
        capacity: raft?.capacity,
      })
  ).filter((item) => (item.section === 'equipment' ? 'equipment' : 'emergency') === section);

  const staticFields = mandatoryItems.length > 0
    ? mandatoryItems.flatMap((item) => [
        {
          label: item.label,
          englishLabel: item.englishLabel,
          name: item.checklistName,
          type: 'checkbox' as const,
          packItem: item,
        },
        ...(item.validityFieldName ? [{
          label: `Validade ${item.label}`,
          englishLabel: `${item.englishLabel} Validity`,
          name: item.validityFieldName,
          type: 'date' as const,
          packItem: item,
        }] : []),
      ])
    : section === 'emergency'
      ? STATIC_EMERGENCY_FIELDS
      : STATIC_EQUIPMENT_FIELDS;

  const dynamicFields = buildQuadroArticleChecklistEntries(raft)
    .filter((entry) => entry.section === section)
    .flatMap((entry) => entry.fields);

  const seenNames = new Set<string>();
  const seenSemantics = new Set<string>();
  const merged: ChecklistField[] = [];

  for (const field of [...staticFields, ...dynamicFields]) {
    const normalizedLabel = normalizeChecklistComparable(field.label);
    const normalizedEnglishLabel = normalizeChecklistComparable(field.englishLabel);
    const semanticBase = normalizedLabel || normalizedEnglishLabel || normalizeChecklistComparable(field.name);
    const semanticKey = `${field.type}:${semanticBase}`;

    if (seenNames.has(field.name)) continue;
    if (semanticBase && seenSemantics.has(semanticKey)) continue;

    seenNames.add(field.name);
    if (semanticBase) seenSemantics.add(semanticKey);
    merged.push(field);
  }

  if (section === 'emergency') {
    const priorityIndex = new Map(EMERGENCY_PRIORITY_FIELD_ORDER.map((name, idx) => [name, idx]));
    return [...merged].sort((a, b) => {
      const aPriority = priorityIndex.get(a.name);
      const bPriority = priorityIndex.get(b.name);

      if (aPriority != null && bPriority != null) return aPriority - bPriority;
      if (aPriority != null) return -1;
      if (bPriority != null) return 1;
      return 0;
    });
  }

  return merged;
}

function buildMkivBulletinChecklistFields(raft?: ChecklistRaftInput): ChecklistField[] {
  return [
    {
      label: 'SB 12/21 · Zip sliders do canopy inspecionados e substituídos por resina quando necessário',
      englishLabel: 'SB 12/21 · Canopy zip sliders inspected and converted to resin when required',
      name: 'sb_12_21_canopy_zip_sliders',
      type: 'checkbox',
      bulletinId: 'survitec-mkiv-canopy-zip-sliders-12-21',
    },
    {
      label: 'SB 43/21 · Gasket seal, valises de pirotecnia e bellows valise confirmados na revisão',
      englishLabel: 'SB 43/21 · Gasket seal, pyrotechnics valises and bellows valise confirmed during service',
      name: 'sb_43_21_servicing_optimisation',
      type: 'checkbox',
      bulletinId: 'survitec-mkiv-servicing-optimisation-43-21',
    },
    {
      label: 'SB 46/21 · Multi-etiquetas / “do not cut” do contentor confirmadas',
      englishLabel: 'SB 46/21 · Multi-label sheet / do-not-cut marking confirmed on container',
      name: 'sb_46_21_multi_label_sheet',
      type: 'checkbox',
      bulletinId: 'survitec-multi-label-sheets-46-21',
    },
    {
      label: 'SB 12/24 · Consolidação de referências RL5/RL6/RB2, farmácia e anti-enjoo verificada',
      englishLabel: 'SB 12/24 · RL5/RL6/RB2, first aid and seasickness parts consolidation verified',
      name: 'sb_12_24_spare_parts_consolidation',
      type: 'checkbox',
      bulletinId: 'survitec-spare-parts-consolidation-12-24',
    },
    ...(isSmallMkivChecklistCapacity(raft)
      ? [{
          label: 'SB 76/15 · Proteção da RL6 interna confirmada para lotação 4/6/8',
          englishLabel: 'SB 76/15 · RL6 internal lamp protection confirmed for 4/6/8 person rafts',
          name: 'sb_76_15_rl6_internal_lamp',
          type: 'checkbox' as const,
          bulletinId: 'survitec-rl6-internal-lamp-76-15',
        }]
      : []),
    ...(isMk16ChecklistContainer(raft)
      ? [{
          label: 'SB 84/16 · Furos de drenagem do contentor MK16 verificados/aplicados',
          englishLabel: 'SB 84/16 · MK16 container drain holes verified/applied',
          name: 'sb_84_16_mk16_drain_holes',
          type: 'checkbox' as const,
          bulletinId: 'survitec-mk16-drain-holes-84-16',
        }]
      : []),
    {
      label: 'Observações dos boletins / evidência documental',
      englishLabel: 'Bulletin observations / documentary evidence',
      name: 'mkiv_bulletins_notes',
      type: 'text',
    },
  ];
}

function buildMkiiiBulletinChecklistFields(): ChecklistField[] {
  return [
    {
      label: 'SB MKIII · Verificação de canópia, fechos e costuras estruturais concluída',
      englishLabel: 'MKIII SB · Canopy, fasteners and structural seams verification completed',
      name: 'sb_mkiii_canopy_and_structural_seams',
      type: 'checkbox',
      bulletinId: 'survitec-mkiii-canopy-structural-seams',
    },
    {
      label: 'SB MKIII · Sistema de insuflação e cabeça de disparo revistos conforme manual',
      englishLabel: 'MKIII SB · Inflation system and firing head revised as per manual',
      name: 'sb_mkiii_inflation_and_firing_head',
      type: 'checkbox',
      bulletinId: 'survitec-mkiii-inflation-firing-head',
    },
    {
      label: 'SB MKIII · Folding / acondicionamento final e selagem do contentor verificados',
      englishLabel: 'MKIII SB · Final folding/packing and container sealing verified',
      name: 'sb_mkiii_folding_and_container_sealing',
      type: 'checkbox',
      bulletinId: 'survitec-mkiii-folding-container-sealing',
    },
    {
      label: 'Observações dos boletins / evidência documental',
      englishLabel: 'Bulletin observations / documentary evidence',
      name: 'mkiii_bulletins_notes',
      type: 'text',
    },
  ];
}

function buildMkivChecklistSections(raft?: ChecklistRaftInput, brandModel?: string): ChecklistSection[] {
  return [
    {
      title: 'Dados Gerais',
      englishTitle: 'General Data',
      fields: [
        { label: 'Jangada (Nº Série)', englishLabel: 'Liferaft Serial Number', name: 'serial', type: 'text', autoFillFromRaft: 'serial' },
        { label: 'Navio', englishLabel: 'Ship', name: 'ship', type: 'text', autoFillFromRaft: 'shipNameManual' },
        { label: 'Marca/Modelo', englishLabel: 'Brand / Model', name: 'brand_model', type: 'text', autoFillFromRaft: brandModel ? undefined : 'brand' },
        { label: 'Capacidade', englishLabel: 'Capacity', name: 'capacity', type: 'number', autoFillFromRaft: 'capacity' },
        { label: 'Proprietário', englishLabel: 'Owner', name: 'owner', type: 'text', autoFillFromRaft: 'owner' },
        { label: 'Data Fabrico', englishLabel: 'Date of Manufacture', name: 'dataFabrico', type: 'date', autoFillFromRaft: 'dataFabrico' },
        { label: 'Tipo de Pack', englishLabel: 'Emergency Pack Type', name: 'packType', type: 'text', autoFillFromRaft: 'packType' },
        buildPackagingModelField(raft),
        { label: 'Sistema de Insuflação', englishLabel: 'Inflation System', name: 'inflation_system', type: 'text', autoFillFromRaft: 'cylinder.sistema' },
      ],
    },
    {
      title: 'Exterior da Jangada',
      englishTitle: 'Liferaft - External',
      fields: [
        { label: 'Cobertura Exterior', englishLabel: 'Canopy External', name: 'cobertura_exterior', type: 'checkbox' },
        { label: 'Saída de Antena', englishLabel: 'Aerial Outlet', name: 'saida_antena', type: 'checkbox' },
        { label: 'Refletores', englishLabel: 'Reflective Tape', name: 'refletores', type: 'checkbox' },
        { label: 'Tubo de Identificação', englishLabel: 'Identification Card / Tube', name: 'tubo_identificacao', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protecting Tapes', name: 'costuras_juntas', type: 'checkbox' },
        { label: 'Câmara e Fundo', englishLabel: 'Buoyancy Tubes and Floor', name: 'camara_fundos', type: 'checkbox' },
        { label: 'Sistema de Endireitar', englishLabel: 'Righting System', name: 'sistema_endireitar', type: 'checkbox' },
        { label: 'Bolsas de Estabilização', englishLabel: 'Stabilizing Pockets', name: 'bolsas_estabilizacao', type: 'checkbox' },
        { label: 'Luz Exterior e Bateria', englishLabel: 'Top Light and Battery', name: 'luz_exterior_bateria', type: 'checkbox' },
        { label: 'Rampa ou Escada', englishLabel: 'Boarding Ramp or Ladder', name: 'escada_borda', type: 'checkbox' },
        { label: 'Grinalda e Espelhos', englishLabel: 'Grabline and Patches', name: 'grinalda_espelhos', type: 'checkbox' },
        { label: 'Alça da Retenida e Espelhos', englishLabel: 'Crowfoot Bridle and Patches', name: 'alca_retenida_espelhos', type: 'checkbox' },
      ],
    },
    {
      title: 'Interior da Jangada',
      englishTitle: 'Liferaft - Internal',
      fields: [
        { label: 'Escada de Entrada', englishLabel: 'Entrance Ladder', name: 'escada_entrada', type: 'checkbox' },
        { label: 'Grinalda Interior', englishLabel: 'Grabline Internal', name: 'grinalda_interior', type: 'checkbox' },
        { label: 'Anel com Linha', englishLabel: 'Quoit with Line', name: 'anel_linha', type: 'checkbox' },
        { label: 'Facas de Segurança', englishLabel: 'Safety Knives', name: 'faca_seguranca', type: 'checkbox' },
        { label: 'Cobertura Interior', englishLabel: 'Canopy Internal', name: 'cobertura_interior', type: 'checkbox' },
        { label: 'Fecho da Cobertura', englishLabel: 'Closure for Canopy', name: 'fecho_cobertura', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protective Tapes', name: 'protectores_juntas_interior', type: 'checkbox' },
        { label: 'Colectores de Água', englishLabel: 'Rainwater Collectors', name: 'colectores_agua', type: 'checkbox' },
        { label: 'Manual de Instruções', englishLabel: 'Instructions Manual', name: 'manual_instrucoes', type: 'checkbox' },
        { label: 'Tecido de Câmara e Fundo', englishLabel: 'Tubes and Floor Fabric', name: 'tecido_camara_fundo', type: 'checkbox' },
        { label: 'Fecho do Saco de Emergência', englishLabel: 'Fastening for Emergency Pack', name: 'fecho_saco_emergencia', type: 'checkbox' },
        { label: 'Luz Interior e Bateria', englishLabel: 'Inside Light and Battery', name: 'luz_interior_bateria', type: 'checkbox' },
        { label: 'Válvulas de Insuflação', englishLabel: 'Inflation Valves', name: 'valvulas_insuflacao', type: 'checkbox' },
        { label: 'Válvulas de Atestar', englishLabel: 'Topping Up Valves', name: 'valvulas_atestar_interior', type: 'checkbox' },
        { label: 'Suporte de Antena', englishLabel: 'Aerial Support', name: 'suporte_antena', type: 'checkbox' },
        { label: 'Arco e Cinta de Remate', englishLabel: 'Arch and Rubber Band', name: 'arco_cinta_remate', type: 'checkbox' },
      ],
    },
    {
      title: 'Sistema de Insuflação e Válvulas',
      englishTitle: 'Inflation System and Valves',
      fields: [
        { label: 'Tubos de Alta Pressão', englishLabel: 'High Pressure Hoses', name: 'tubos_alta_pressao', type: 'checkbox' },
        { label: 'Cilindro CO2', englishLabel: 'Cylinder CO2', name: 'cilindro_co2', type: 'text', autoFillFromRaft: 'cylinder.serial' },
        { label: 'Cabeça de Disparo', englishLabel: 'Operating Head', name: 'cabeca_disparo', type: 'text', autoFillFromRaft: 'cylinderCabecaDisparoRef' },
        { label: 'Cabo de Disparo', englishLabel: 'Operating Wire', name: 'cabo_disparo', type: 'checkbox' },
        { label: 'Válvulas Segurança e Tampões', englishLabel: 'Relief Valves and Stoppers', name: 'valvulas_seguranca', type: 'checkbox' },
        { label: 'União Banjo - Câmara Superior', englishLabel: 'Banjo Bolt - Upper Tube', name: 'uniao_banjo_superior', type: 'checkbox' },
        { label: 'União Banjo - Câmara Inferior', englishLabel: 'Banjo Bolt - Lower Tube', name: 'uniao_banjo_inferior', type: 'checkbox' },
        { label: 'Capa do Sistema de Insuflação', englishLabel: 'Cover for Inflation System', name: 'capa_sistema_insuflacao', type: 'checkbox' },
        { label: 'Bolsa do Cilindro', englishLabel: 'Cylinder Pocket', name: 'bolsa_cilindro', type: 'checkbox' },
      ],
    },
    {
      title: 'Fecho e Acondicionamento MKIV',
      englishTitle: 'MKIV Folding and Packing',
      fields: [
        { label: 'Tampão / válvula do coletor de água confirmado', englishLabel: 'Rainwater collecting system plug valve confirmed', name: 'mkiv_rainwater_collector_plug', type: 'checkbox' },
        { label: 'Bolsa de reparação preparada e posicionada', englishLabel: 'Repair bag packed and positioned', name: 'mkiv_repair_bag_packed', type: 'checkbox' },
        { label: 'Equipamento interior seguro e corretamente distribuído', englishLabel: 'Internal equipment secured and correctly distributed', name: 'mkiv_equipment_secured', type: 'checkbox' },
        { label: 'Escadas / meios de embarque arrumados para o folding', englishLabel: 'Boarding ladders arranged for folding', name: 'mkiv_ladders_secured_for_folding', type: 'checkbox' },
        { label: 'Zip / fechos da canópia conferidos antes de fechar', englishLabel: 'Canopy zips / fasteners checked before closing', name: 'mkiv_canopy_fasteners_checked', type: 'checkbox' },
        { label: 'Dobragem executada conforme manual', englishLabel: 'Folding carried out according to manual', name: 'mkiv_folding_per_manual', type: 'checkbox' },
        { label: 'Retenida / painter preparada para o acondicionamento final', englishLabel: 'Painter line prepared for final packing', name: 'mkiv_painter_prepared', type: 'checkbox' },
        { label: 'Fecho do contentor / invólucro concluído sem anomalias', englishLabel: 'Container closure completed without defects', name: 'mkiv_container_closed_without_defects', type: 'checkbox' },
        { label: 'Etiquetas / marcações de serviço atualizadas para a estação dos Açores', englishLabel: 'Service labels / markings updated for Azores station', name: 'mkiv_service_labels_updated', type: 'checkbox' },
      ],
    },
    {
      title: 'Boletins de Serviço MKIV',
      englishTitle: 'MKIV Service Bulletins',
      fields: buildMkivBulletinChecklistFields(raft),
    },
    buildPackagingChecklistSection(raft),
  ];
}

function buildMkiiiChecklistSections(raft?: ChecklistRaftInput, brandModel?: string): ChecklistSection[] {
  return [
    {
      title: 'Dados Gerais',
      englishTitle: 'General Data',
      fields: [
        { label: 'Jangada (Nº Série)', englishLabel: 'Liferaft Serial Number', name: 'serial', type: 'text', autoFillFromRaft: 'serial' },
        { label: 'Navio', englishLabel: 'Ship', name: 'ship', type: 'text', autoFillFromRaft: 'shipNameManual' },
        { label: 'Marca/Modelo', englishLabel: 'Brand / Model', name: 'brand_model', type: 'text', autoFillFromRaft: brandModel ? undefined : 'brand' },
        { label: 'Capacidade', englishLabel: 'Capacity', name: 'capacity', type: 'number', autoFillFromRaft: 'capacity' },
        { label: 'Proprietário', englishLabel: 'Owner', name: 'owner', type: 'text', autoFillFromRaft: 'owner' },
        { label: 'Data Fabrico', englishLabel: 'Date of Manufacture', name: 'dataFabrico', type: 'date', autoFillFromRaft: 'dataFabrico' },
        { label: 'Tipo de Pack', englishLabel: 'Emergency Pack Type', name: 'packType', type: 'text', autoFillFromRaft: 'packType' },
        buildPackagingModelField(raft),
      ],
    },
    {
      title: 'Exterior da Jangada',
      englishTitle: 'Liferaft - External',
      fields: [
        { label: 'Cobertura Exterior', englishLabel: 'Canopy External', name: 'cobertura_exterior', type: 'checkbox' },
        { label: 'Refletores', englishLabel: 'Reflective Tape', name: 'refletores', type: 'checkbox' },
        { label: 'Tubo de Identificação', englishLabel: 'Identification Card / Tube', name: 'tubo_identificacao', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protecting Tapes', name: 'costuras_juntas', type: 'checkbox' },
        { label: 'Câmara e Fundo', englishLabel: 'Buoyancy Tubes and Floor', name: 'camara_fundos', type: 'checkbox' },
        { label: 'Sistema de Endireitar', englishLabel: 'Righting System', name: 'sistema_endireitar', type: 'checkbox' },
        { label: 'Bolsas de Estabilização', englishLabel: 'Stabilizing Pockets', name: 'bolsas_estabilizacao', type: 'checkbox' },
        { label: 'Luz Exterior e Bateria', englishLabel: 'Top Light and Battery', name: 'luz_exterior_bateria', type: 'checkbox' },
        { label: 'Validade Luz Exterior', englishLabel: 'Top Light Validity', name: 'validade_luzes_exteriores', type: 'date' },
        { label: 'Rampa ou Escada', englishLabel: 'Boarding Ramp or Ladder', name: 'escada_borda', type: 'checkbox' },
        { label: 'Grinalda e Espelhos', englishLabel: 'Grabline and Patches', name: 'grinalda_espelhos', type: 'checkbox' },
        { label: 'Alça da Retenida e Espelhos', englishLabel: 'Crowfoot Bridle and Patches', name: 'alca_retenida_espelhos', type: 'checkbox' },
      ],
    },
    {
      title: 'Interior da Jangada',
      englishTitle: 'Liferaft - Internal',
      fields: [
        { label: 'Escada de Entrada', englishLabel: 'Entrance Ladder', name: 'escada_entrada', type: 'checkbox' },
        { label: 'Grinalda Interior', englishLabel: 'Grabline Internal', name: 'grinalda_interior', type: 'checkbox' },
        { label: 'Anel com Linha', englishLabel: 'Quoit with Line', name: 'anel_linha', type: 'checkbox' },
        { label: 'Facas de Segurança', englishLabel: 'Safety Knives', name: 'faca_seguranca', type: 'checkbox' },
        { label: 'Cobertura Interior', englishLabel: 'Canopy Internal', name: 'cobertura_interior', type: 'checkbox' },
        { label: 'Fecho da Cobertura', englishLabel: 'Closure for Canopy', name: 'fecho_cobertura', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protective Tapes', name: 'protectores_juntas_interior', type: 'checkbox' },
        { label: 'Colectores de Água', englishLabel: 'Rainwater Collectors', name: 'colectores_agua', type: 'checkbox' },
        { label: 'Manual de Instruções', englishLabel: 'Instructions Manual', name: 'manual_instrucoes', type: 'checkbox' },
        { label: 'Tecido de Câmara e Fundo', englishLabel: 'Tubes and Floor Fabric', name: 'tecido_camara_fundo', type: 'checkbox' },
        { label: 'Fecho do Saco de Emergência', englishLabel: 'Fastening for Emergency Pack', name: 'fecho_saco_emergencia', type: 'checkbox' },
        { label: 'Luz Interior e Bateria', englishLabel: 'Inside Light and Battery', name: 'luz_interior_bateria', type: 'checkbox' },
        { label: 'Válvulas de Insuflação', englishLabel: 'Inflation Valves', name: 'valvulas_insuflacao', type: 'checkbox' },
        { label: 'Válvulas de Atestar', englishLabel: 'Topping Up Valves', name: 'valvulas_atestar_interior', type: 'checkbox' },
      ],
    },
    {
      title: 'Sistema de Insuflação e Válvulas',
      englishTitle: 'Inflation System and Valves',
      fields: [
        { label: 'Tubos de Alta Pressão', englishLabel: 'High Pressure Hoses', name: 'tubos_alta_pressao', type: 'checkbox' },
        { label: 'Cilindro CO2', englishLabel: 'Cylinder CO2', name: 'cilindro_co2', type: 'text', autoFillFromRaft: 'cylinder.serial' },
        { label: 'Cabeça de Disparo', englishLabel: 'Operating Head', name: 'cabeca_disparo', type: 'text', autoFillFromRaft: 'cylinderCabecaDisparoRef' },
        { label: 'Cabo de Disparo', englishLabel: 'Operating Wire', name: 'cabo_disparo', type: 'checkbox' },
        { label: 'Válvulas Segurança e Tampões', englishLabel: 'Relief Valves and Stoppers', name: 'valvulas_seguranca', type: 'checkbox' },
        { label: 'Capa do Sistema de Insuflação', englishLabel: 'Cover for Inflation System', name: 'capa_sistema_insuflacao', type: 'checkbox' },
        { label: 'Bolsa do Cilindro', englishLabel: 'Cylinder Pocket', name: 'bolsa_cilindro', type: 'checkbox' },
      ],
    },
    {
      title: 'Equipamento Jangada',
      englishTitle: 'Raft Equipment',
      fields: [
        { label: 'Tipo de Equipamento', englishLabel: 'Emergency Pack Type', name: 'equip_pack_type', type: 'text', autoFillFromRaft: 'packType' },
        ...buildMandatoryPackChecklistFields(raft, 'equipment'),
      ],
    },
    {
      title: 'Equip. de Emergência',
      englishTitle: 'Emergency Pack',
      fields: buildMandatoryPackChecklistFields(raft, 'emergency'),
    },
    {
      title: 'Fecho e Acondicionamento MKIII',
      englishTitle: 'MKIII Folding and Packing',
      fields: [
        { label: 'Tampão / válvula do coletor de água confirmado', englishLabel: 'Rainwater collecting system plug valve confirmed', name: 'mkiii_rainwater_collector_plug', type: 'checkbox' },
        { label: 'Equipamento interior seguro e corretamente distribuído', englishLabel: 'Internal equipment secured and correctly distributed', name: 'mkiii_equipment_secured', type: 'checkbox' },
        { label: 'Escadas / meios de embarque arrumados para o folding', englishLabel: 'Boarding ladders arranged for folding', name: 'mkiii_ladders_secured_for_folding', type: 'checkbox' },
        { label: 'Fechos da canópia conferidos antes de fechar', englishLabel: 'Canopy fasteners checked before closing', name: 'mkiii_canopy_fasteners_checked', type: 'checkbox' },
        { label: 'Dobragem executada conforme manual', englishLabel: 'Folding carried out according to manual', name: 'mkiii_folding_per_manual', type: 'checkbox' },
        { label: 'Retenida / painter preparada para o acondicionamento final', englishLabel: 'Painter line prepared for final packing', name: 'mkiii_painter_prepared', type: 'checkbox' },
        { label: 'Fecho do contentor / invólucro concluído sem anomalias', englishLabel: 'Container closure completed without defects', name: 'mkiii_container_closed_without_defects', type: 'checkbox' },
      ],
    },
    {
      title: 'Boletins de Serviço MKIII',
      englishTitle: 'MKIII Service Bulletins',
      fields: buildMkiiiBulletinChecklistFields(),
    },
    buildPackagingChecklistSection(raft),
  ];
}

export function buildInspectionChecklistFromQuadro(raft?: ChecklistRaftInput): ChecklistSection[] {
  const brandModel = [raft?.brand, raft?.model].filter(Boolean).join(' ').trim();
  const plastimoWorksheetSections: ChecklistSection[] = !isSosRaft(raft || {}) && isPlastimoChecklistRaft(raft)
    ? [{
      title: 'Formulário Plastimo (Worksheet)',
      englishTitle: 'Plastimo Servicing Worksheet',
      fields: PLASTIMO_WORKSHEET_FIELDS,
    }]
    : [];

  if (isSurvivaMkivChecklistRaft(raft)) {
    return buildMkivChecklistSections(raft, brandModel).filter((section) => section.fields.length > 0);
  }

  if (isSurvivaMkiiiChecklistRaft(raft)) {
    return buildMkiiiChecklistSections(raft, brandModel).filter((section) => section.fields.length > 0);
  }

  const sections: ChecklistSection[] = [
    {
      title: 'Dados Gerais',
      englishTitle: 'General Data',
      fields: [
        { label: 'Jangada (Nº Série)', englishLabel: 'Liferaft Serial Number', name: 'serial', type: 'text', autoFillFromRaft: 'serial' },
        { label: 'Navio', englishLabel: 'Ship', name: 'ship', type: 'text', autoFillFromRaft: 'shipNameManual' },
        { label: 'Marca/Modelo', englishLabel: 'Brand / Model', name: 'brand_model', type: 'text', autoFillFromRaft: brandModel ? undefined : 'brand' },
        { label: 'Capacidade', englishLabel: 'Capacity', name: 'capacity', type: 'number', autoFillFromRaft: 'capacity' },
        { label: 'Proprietário', englishLabel: 'Owner', name: 'owner', type: 'text', autoFillFromRaft: 'owner' },
        { label: 'Data Fabrico', englishLabel: 'Date of Manufacture', name: 'dataFabrico', type: 'date', autoFillFromRaft: 'dataFabrico' },
        { label: 'Tipo de Pack', englishLabel: 'Emergency Pack Type', name: 'packType', type: 'text', autoFillFromRaft: 'packType' },
      ],
    },
    {
      title: 'Exterior da Jangada',
      englishTitle: 'Liferaft - External',
      fields: [
        { label: 'Cobertura Exterior', englishLabel: 'Canopy External', name: 'cobertura_exterior', type: 'checkbox' },
        { label: 'Saída de Antena', englishLabel: 'Aerial Outlet', name: 'saida_antena', type: 'checkbox' },
        { label: 'Refletores', englishLabel: 'Reflective Tape', name: 'refletores', type: 'checkbox' },
        { label: 'Tubo de Identificação', englishLabel: 'Identification Card / Tube', name: 'tubo_identificacao', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protecting Tapes', name: 'costuras_juntas', type: 'checkbox' },
        { label: 'Câmara e Fundo', englishLabel: 'Buoyancy Tubes and Floor', name: 'camara_fundos', type: 'checkbox' },
        { label: 'Sistema de Endireitar', englishLabel: 'Righting System', name: 'sistema_endireitar', type: 'checkbox' },
        { label: 'Bolsas de Estabilização', englishLabel: 'Stabilizing Pockets', name: 'bolsas_estabilizacao', type: 'checkbox' },
        { label: 'Luz Exterior e Bateria', englishLabel: 'Top Light and Battery', name: 'luz_exterior_bateria', type: 'checkbox' },
        { label: 'Validade Luz Exterior', englishLabel: 'Top Light Validity', name: 'validade_luzes_exteriores', type: 'date' },
        { label: 'Rampa ou Escada', englishLabel: 'Boarding Ramp or Ladder', name: 'escada_borda', type: 'checkbox' },
        { label: 'Válvulas Segurança e Tampões', englishLabel: 'Relief Valves and Stoppers', name: 'valvulas_seguranca', type: 'checkbox' },
        { label: 'União Banjo - Câmara Superior', englishLabel: 'Banjo Bolt - Upper Tube', name: 'uniao_banjo_superior', type: 'checkbox' },
        { label: 'União Banjo - Câmara Inferior', englishLabel: 'Banjo Bolt - Lower Tube', name: 'uniao_banjo_inferior', type: 'checkbox' },
        { label: 'Grinalda e Espelhos', englishLabel: 'Grabline and Patches', name: 'grinalda_espelhos', type: 'checkbox' },
        { label: 'Alça da Retenida e Espelhos', englishLabel: 'Crowfoot Bridle and Patches', name: 'alca_retenida_espelhos', type: 'checkbox' },
        { label: 'Tubos de Alta Pressão', englishLabel: 'High Pressure Hoses', name: 'tubos_alta_pressao', type: 'checkbox' },
        { label: 'Cilindro CO2', englishLabel: 'Cylinder CO2', name: 'cilindro_co2', type: 'text', autoFillFromRaft: 'cylinder.serial' },
        { label: 'Cabeça de Disparo', englishLabel: 'Operating Head', name: 'cabeca_disparo', type: 'text', autoFillFromRaft: 'cylinderCabecaDisparoRef' },
        { label: 'Cabo de Disparo', englishLabel: 'Operating Wire', name: 'cabo_disparo', type: 'checkbox' },
        { label: 'Capa do Sistema de Insuflação', englishLabel: 'Cover for Inflation System', name: 'capa_sistema_insuflacao', type: 'checkbox' },
        { label: 'Bolsa do Cilindro', englishLabel: 'Cylinder Pocket', name: 'bolsa_cilindro', type: 'checkbox' },
      ],
    },
    {
      title: 'Interior da Jangada',
      englishTitle: 'Liferaft - Internal',
      fields: [
        { label: 'Escada de Entrada', englishLabel: 'Entrance Ladder', name: 'escada_entrada', type: 'checkbox' },
        { label: 'Grinalda Interior', englishLabel: 'Grabline Internal', name: 'grinalda_interior', type: 'checkbox' },
        { label: 'Anel com Linha', englishLabel: 'Quoit with Line', name: 'anel_linha', type: 'checkbox' },
        { label: 'Facas de Segurança', englishLabel: 'Safety Knifes', name: 'faca_seguranca', type: 'checkbox' },
        { label: 'Cobertura Interior', englishLabel: 'Canopy Internal', name: 'cobertura_interior', type: 'checkbox' },
        { label: 'Fecho da Cobertura', englishLabel: 'Closure for Canopy', name: 'fecho_cobertura', type: 'checkbox' },
        { label: 'Protectores de Juntas', englishLabel: 'Seam Protective Tapes', name: 'protectores_juntas_interior', type: 'checkbox' },
        { label: 'Colectores de Água', englishLabel: 'Water Collectors', name: 'colectores_agua', type: 'checkbox' },
        { label: 'Manual de Instruções', englishLabel: 'Instructions Manual', name: 'manual_instrucoes', type: 'checkbox' },
        { label: 'Tecido de Câmara e Fundo', englishLabel: 'Tubes and Floor Fabric', name: 'tecido_camara_fundo', type: 'checkbox' },
        { label: 'Fecho do Saco de Emergência', englishLabel: 'Fastening for Emergency Pack', name: 'fecho_saco_emergencia', type: 'checkbox' },
        { label: 'Luz Interior e Bateria', englishLabel: 'Inside Light and Battery', name: 'luz_interior_bateria', type: 'checkbox' },
        { label: 'Bateria de Lítio', englishLabel: 'Lithium Battery', name: 'bateria_litio', type: 'checkbox' },
        { label: 'Validade Bateria', englishLabel: 'Battery Validity', name: 'validade_bateria', type: 'date' },
        { label: 'Válvulas de Insuflação', englishLabel: 'Inflation Valves', name: 'valvulas_insuflacao', type: 'checkbox' },
        { label: 'Válvulas de Atestar', englishLabel: 'Topping Up Valves', name: 'valvulas_atestar_interior', type: 'checkbox' },
        { label: 'Suporte de Antena', englishLabel: 'Aerial Support', name: 'suporte_antena', type: 'checkbox' },
        { label: 'Arco e Cinta de Remate', englishLabel: 'Arch and Rubber Band', name: 'arco_cinta_remate', type: 'checkbox' },
      ],
    },
    {
      title: 'Equipamento Jangada',
      englishTitle: 'Raft Equipment',
      fields: [
        { label: 'Tipo de Equipamento', englishLabel: 'Emergency Pack Type', name: 'equip_pack_type', type: 'text', autoFillFromRaft: 'packType' },
        ...buildMandatoryPackChecklistFields(raft, 'equipment'),
      ],
    },
    {
      title: 'Equip. de Emergência',
      englishTitle: 'Emergency Pack',
      fields: buildMandatoryPackChecklistFields(raft, 'emergency'),
    },
    buildPackagingChecklistSection(raft),
    ...plastimoWorksheetSections,
  ];

  return sections.filter((section) => section.fields.length > 0);
}

export function getBooleanChecklistCompletionErrors(sections: ChecklistSection[], values: Record<string, unknown>): string[] {
  return sections.flatMap(section => section.fields)
    .filter(field => field.type === 'checkbox' && values[field.name] !== true &&
      !(values[field.name] === false && String(values[`${field.name}_justificacaoNaoSubstituicao`] || '').trim()))
    .map(field => `${field.label}: ${values[field.name] === false ? 'falha por resolver: falta justificação de não substituição' : 'por verificar'}`);
}

export function resolveChecklistArticleValidity(values: Record<string, unknown>, field: string | undefined, replacement?: { validade?: string | null } | null, article?: { validade?: string | null } | null): string {
  // An explicit blank is a correction too; never resurrect the installed date.
  if (field && Object.prototype.hasOwnProperty.call(values, field)) return String(values[field] ?? '');
  return String((replacement ? replacement.validade : article?.validade) || '');
}

export function buildChecklistInitialValues(
  checklist: ChecklistSection[],
  raft?: ChecklistRaftInput,
) {
  const initialValues: Record<string, string | number | boolean> = {};

  checklist.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === 'checkbox') {
        // Empty string is unassessed; false remains an explicitly recorded failure.
        initialValues[field.name] = field.bulletinId && raft?.serviceBulletinsApplied?.[field.bulletinId] === 'APLICADO'
          ? true
          : '';
        return;
      }

      if (!field.autoFillFromRaft || !raft) {
        initialValues[field.name] = '';
        return;
      }

      if ((field.name === 'packType' || field.name === 'equip_pack_type') && isSosRaft(raft)) {
        initialValues[field.name] = '';
        return;
      }

      const resolved = field.name === 'cabeca_disparo'
        ? resolveFiringHeadDesignation({ ...raft, cylinderSistema: raft.cylinder?.sistema || raft.cylinderSistema })
        : resolvePath(raft as unknown as Record<string, unknown>, field.autoFillFromRaft);
      if (resolved === undefined || resolved === null) {
        initialValues[field.name] = '';
      } else if (field.type === 'date' && typeof resolved === 'string') {
        initialValues[field.name] = mmYyyyToIso(resolved) ?? resolved;
      } else {
        initialValues[field.name] = resolved as string | number;
      }
    });
  });

  if (raft?.brand || raft?.model) {
    initialValues.brand_model = [raft.brand, raft.model].filter(Boolean).join(' ');
  }

  // Auto-fill validity dates from raft articles (pack obrigatório)
  if (Array.isArray(raft?.artigos)) {
    for (const { field, tokens } of ARTIGO_VALIDADE_FIELD_KEYWORDS) {
      if (initialValues[field] && initialValues[field] !== '') continue; // already set
      const nfcNorm = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const match = (raft!.artigos as Array<{ name?: string; validade?: string }>).find((a) => {
        const norm = nfcNorm(String(a?.name || ''));
        return tokens.some((t) => norm.includes(nfcNorm(t)));
      });
      if (match?.validade) {
        const iso =
          mmYyyyToIso(match.validade) ??
          (match.validade.match(/^\d{4}-\d{2}-\d{2}$/) ? match.validade : null);
        if (iso) initialValues[field] = iso;
      }
    }

    const packFields = checklist
      .flatMap((section) => section.fields)
      .filter((field) => field.packItem);

    for (const field of packFields) {
      const packItem = field.packItem;
      if (!packItem) continue;

      const matched = findMatchingArticleForPackItem(packItem, raft.artigos || []);
      if (!matched) continue;

      if (field.type === 'date' && (!initialValues[field.name] || initialValues[field.name] === '') && matched.validade) {
        const iso = mmYyyyToIso(String(matched.validade))
          ?? (String(matched.validade).match(/^\d{4}-\d{2}-\d{2}$/) ? String(matched.validade) : null);
        if (iso) initialValues[field.name] = iso;
      }

      if (packItem.validityFieldName && (!initialValues[packItem.validityFieldName] || initialValues[packItem.validityFieldName] === '') && matched.validade) {
        const iso = mmYyyyToIso(String(matched.validade))
          ?? (String(matched.validade).match(/^\d{4}-\d{2}-\d{2}$/) ? String(matched.validade) : null);
        if (iso) initialValues[packItem.validityFieldName] = iso;
      }
    }
  }

  if (isSosRaft(raft || {})) return initialValues;
  const dataFabricoIso = raft?.dataFabrico ? (mmYyyyToIso(raft.dataFabrico) ?? raft.dataFabrico) : undefined;
  const inspectionPlan = buildInspectionPlanFromFabricationDate(dataFabricoIso);
  initialValues.wp_rule = inspectionPlan.wpRule;
  initialValues.next_gi_date = inspectionPlan.nextGiDate;
  initialValues.next_fs_nap_date = inspectionPlan.nextFsNapDate;
  initialValues.gi_rule = 'GI de 5 em 5 anos desde a data de fabrico.';
  initialValues.fs_nap_rule = 'FS e NAP ao 10º ano e depois anualmente.';

  return initialValues;
}

export const inspectionChecklist: ChecklistSection[] = buildInspectionChecklistFromQuadro();
