import { findRaftTechnicalModel } from "@/modules/rafts/raftModelData";
import { getBoletinsLibraryUrl } from "@/lib/external-tech-docs";
import type {
  ApplicableTechnicalBulletin,
  TechnicalBulletin,
  TechnicalBulletinRule,
} from "@/modules/rafts/types";

const EV_BULLETIN_FILE = "EV Leisure rafts – Replacement of PRV valve type VSP-EV_08.pdf";
const RFD_OTS65_BULLETIN_FILE = "RFD Marine - Liferafts_ Replace all OTS-65 PRV's after 10 year life.pdf";
const SURVITEC_MKIV_CANOPY_ZIPS_FILE = "Marine Mk IV liferafts — Canopy _ Inspect the canopy doorway zip sliders.pdf";
const SURVITEC_MULTI_LABEL_SHEETS_FILE = "Marine — Liferaft Container _  Introduction of multi-label sheets.pdf";
const SURVITEC_RL6_INTERNAL_LAMP_FILE = "Marine Surviva Mk IV & ISO 9650 — Liferaft _ Installation of RL6 internal lamp.pdf";
const SURVITEC_MK16_DRAIN_HOLES_FILE = "84_16 Marine Make drain holes in Mk 16 flat-pack containers (1).pdf";
const SURVITEC_MKIV_SERVICING_OPTIMISATION_FILE = "Marine Mk IV liferafts — Servicing _ Servicing optimisation (gasket seal, pyrotechnics valises, bellows valise, canopy zips).pdf";
const SURVITEC_SPARES_CONSOLIDATION_FILE = "Marine liferafts — Spare parts _ Consolidation of multiple branded part numbers.pdf";
const SURVITEC_EMERGENCY_PACK_PROTECTIVE_FOAM_FILE = "Marine liferafts — Emergency pack_ Position of protective foam.pdf";
const SURVITEC_DK99_OPERATING_HEAD_FILE = "Marine liferafts and MES — Inflation system _ Replace the Thanner DK99 operating head.pdf";
const RFD_DYMO_TAPE_DATA_LABELS_FILE = "Marine liferafts - Container _ Introduction of dymo tape on data labels.pdf";
const SURVITEC_26900_PRESSURE_CONVERSIONS_FILE = "Marine Service Manual_ Correction of pressure conversions in Manual 269-00.pdf";
const SURVITEC_LIFERAFT_CONDEMNATION_FILE = "Liferaft condemnation.pdf";
const SURVITEC_ADHESIVE_SEAMS_FILE = "Marine Liferafts_ Enhanced inspection of adhesive seams.pdf";

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function buildComparableTokens(value: unknown): string[] {
  const normalized = normalizeToken(value);
  if (!normalized) return [];
  const compact = normalized.replace(/\s+/g, "");
  return Array.from(new Set([normalized, compact]));
}

function includesComparable(haystack: string, needle: string): boolean {
  const hayTokens = buildComparableTokens(haystack);
  const needleTokens = buildComparableTokens(needle);
  return needleTokens.some((needleToken) => hayTokens.some((hayToken) => hayToken.includes(needleToken) || needleToken.includes(hayToken)));
}

function canonicalizeBrand(value: unknown): string {
  const normalized = normalizeToken(value);
  if (!normalized) return "";
  if (normalized === "EV" || normalized.includes("EUROVINIL")) return "EUROVINIL";
  if (normalized.includes("SURVITEC")) return "SURVITEC";
  if (normalized.includes("SEA SAFE")) return "SEA-SAFE";
  return normalized;
}

function extractMkFamilyAliases(model: string): string[] {
  const normalized = normalizeToken(model);
  if (!normalized) return [];

  const aliases: string[] = [];
  const mapping: Array<{ patterns: RegExp[]; canonical: string; technical?: string }> = [
    { patterns: [/\bMK\s*IV\b/, /\bMK4\b/], canonical: "SURVIVA MKIV", technical: "SURVIVA MKIV TO" },
    { patterns: [/\bMK\s*III\b/, /\bMK3\b/], canonical: "SURVIVA MKIII" },
    { patterns: [/\bMK\s*II\b/, /\bMK2\b/], canonical: "SURVIVA MKII" },
    { patterns: [/\bMK\s*I\b/, /\bMK1\b/], canonical: "SURVIVA MKIV TO", technical: "SURVIVA MKIV TO" },
  ];

  for (const entry of mapping) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      aliases.push(entry.canonical);
      if (entry.technical) aliases.push(entry.technical);
    }
  }

  return aliases;
}

function getDerivedModelAliases(brand: string, model: string): string[] {
  const normalizedBrand = canonicalizeBrand(brand);
  const normalizedModel = normalizeToken(model);
  const aliases: string[] = [];

  if (normalizedBrand === "EUROVINIL") {
    if (normalizedModel === "STD" || normalizedModel.startsWith("STD ") || normalizedModel.includes("ST INTL") || normalizedModel.includes("INTERNACIONAL") || normalizedModel.includes("INTERNATIONAL")) {
      aliases.push("SYNTESY INTERNACIONAL", "SYTETESY INTERNACIONAL", "ST-INTL", "STD");
    }
    if (normalizedModel.includes("ISO 9650 1") || normalizedModel.includes("ISO9650 1")) {
      aliases.push("SYNTESY ISO 9650-1 MK2", "EV ISO 9650-1");
    }
    if (normalizedModel.includes("ISO 9650 2") || normalizedModel.includes("ISO9650 2")) {
      aliases.push("SYNTESY ISO 9650-2 MK2", "EV ISO 9650-2");
    }
    if (normalizedModel.includes("SPAIN")) {
      aliases.push("EV ISO9650 (SPAIN)");
    }
    if (normalizedModel.includes("GREEK")) {
      aliases.push("ST-GREEK");
    }
    if (normalizedModel.includes("DM77") || normalizedModel.includes("ITA")) {
      aliases.push("ST-ITA DM77");
    }
    if (normalizedModel.includes("DM219")) {
      aliases.push("EV ISO 9650-1 (DM219)");
    }
  }

  if (normalizedBrand === "RFD") {
    aliases.push(...extractMkFamilyAliases(model));
  }

  return aliases;
}

function getModelCandidates(brand: unknown, model: unknown): string[] {
  const brandText = String(brand ?? "");
  const modelText = String(model ?? "");
  const candidates = new Set<string>();

  const technicalModel = findRaftTechnicalModel(brandText, modelText);
  [
    modelText,
    technicalModel?.name,
    ...(technicalModel?.aliases || []),
    ...getDerivedModelAliases(brandText, modelText),
  ]
    .filter(Boolean)
    .forEach((value) => candidates.add(String(value)));

  return Array.from(candidates);
}

export function parseManufactureYear(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const directYear = raw.match(/(?:19|20)\d{2}/);
  if (directYear) return Number(directYear[0]);

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) return Number(mmYyyy[2]);

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).getFullYear();

  return null;
}

function parseManufactureDateInfo(value: unknown): { date: Date; label: string; precision: "year" | "month" | "date" } | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      return {
        date: new Date(year, month - 1, 1),
        label: `${String(month).padStart(2, "0")}/${year}`,
        precision: "month",
      };
    }
  }

  const directYear = raw.match(/^(?:19|20)\d{2}$/);
  if (directYear) {
    const year = Number(directYear[0]);
    return {
      date: new Date(year, 0, 1),
      label: directYear[0],
      precision: "year",
    };
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return {
      date,
      label: `${day}/${month}/${year}`,
      precision: "date",
    };
  }

  const yearFromText = raw.match(/(?:19|20)\d{2}/);
  if (yearFromText) {
    const year = Number(yearFromText[0]);
    return {
      date: new Date(year, 0, 1),
      label: yearFromText[0],
      precision: "year",
    };
  }

  return null;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function formatMonthYear(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function parseCapacityValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const direct = raw.match(/\b(\d{1,3})\b/);
  if (direct) return Number(direct[1]);

  return null;
}

function resolveRaftCapacity(raft: { capacity?: unknown; model?: unknown }): number | null {
  const directCapacity = parseCapacityValue(raft.capacity);
  if (directCapacity !== null) return directCapacity;

  const modelText = String(raft.model ?? "");
  const embeddedCapacity = modelText.match(/\b(4|6|8|10|12|16|20|25|37|50)\s*P\b/i);
  if (embeddedCapacity) return Number(embeddedCapacity[1]);

  return null;
}

function parseMetersValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/,/g, ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  return Number(match[1]);
}

export function buildTechnicalBulletinUrl(fileName: string): string {
  return getBoletinsLibraryUrl();
}

export function formatTechnicalBulletinShortLabel(bulletin: {
  bulletinNumber?: string | null;
  shortDescription?: string | null;
  title?: string | null;
}): string {
  const bulletinNumber = String(bulletin.bulletinNumber || "").trim();
  const shortDescription = String(bulletin.shortDescription || "").trim();
  const title = String(bulletin.title || "").trim();

  if (bulletinNumber && shortDescription) return `${bulletinNumber} · ${shortDescription}`;
  return bulletinNumber || shortDescription || title || "—";
}

export const technicalBulletins: TechnicalBulletin[] = [
  {
    id: "ev-prv-vsp-ev-08",
    title: "EV Leisure rafts – Replacement of PRV valve type VSP-EV_08",
    bulletinNumber: "EV AT 20-01 Version 1",
    shortDescription: "Replacement of PRV",
    issueDate: "1st June 2020",
    fileName: EV_BULLETIN_FILE,
    manufacturer: "EUROVINIL",
    description: "Substituição da válvula de alívio PRV do tipo VSP-EV_08 nas jangadas Eurovinil afetadas.",
    appliesToBrands: ["EUROVINIL", "EV"],
    servicePeriodicity: "Aplicar quando o modelo e o ano de fabrico caem no intervalo do boletim.",
    notes: [
      "Regras baseadas na tabela do boletim validada pelo utilizador.",
      "Os modelos MK no ecossistema RFD são tratados como família SURVIVA (MKI, MKII, MKIII e MKIV).",
      "Nas jangadas Eurovinil legadas, o modelo STD deve ser tratado como SYNTESY INTERNACIONAL.",
    ],
    rules: [
      {
        label: "EV ISO 9650-1",
        canonicalModel: "SYNTESY ISO 9650-1 MK2",
        aliases: ["EV ISO 9650-1", "ISO 9650-1", "SYNTESY ISO 9650-1 MK2", "SYNTESY ISO9650-1 MK2"],
        technicalModels: ["SYNTESY ISO 9650-1 MK2"],
        yearFrom: 2009,
        yearTo: 2018,
      },
      {
        label: "EV ISO 9650-2",
        canonicalModel: "SYNTESY ISO 9650-2 MK2",
        aliases: ["EV ISO 9650-2", "ISO 9650-2", "SYNTESY ISO 9650-2 MK2", "SYNTESY ISO9650-2 MK2"],
        technicalModels: ["SYNTESY ISO 9650-2 MK2"],
        yearFrom: 2009,
        yearTo: 2018,
      },
      {
        label: "EV ISO 9650-1 (DM219)",
        canonicalModel: "SYNTESY ISO 9650-1 MK2",
        aliases: ["EV ISO 9650-1 (DM219)", "DM219", "ISO 9650-1 DM219"],
        technicalModels: ["SYNTESY ISO 9650-1 MK2"],
        yearFrom: 2008,
        yearTo: 2018,
      },
      {
        label: "EV ISO9650 (Spain)",
        canonicalModel: "EV ISO9650 (SPAIN)",
        aliases: ["EV ISO9650 (Spain)", "ISO9650 SPAIN", "SPAIN"],
        yearFrom: 2010,
        yearTo: 2020,
      },
      {
        label: "ST-INTL",
        canonicalModel: "SYNTESY INTERNACIONAL",
        aliases: ["ST-INTL", "STD", "SYNTESY INTERNACIONAL", "SYTETESY INTERNACIONAL", "SYNTESY INTERNATIONAL", "INTERNACIONAL"],
        technicalModels: ["SYNTESY INTERNACIONAL"],
        yearFrom: 2008,
        yearTo: 2018,
        notes: "Mapeamento explícito pedido pelo utilizador: EUROVINIL STD => SYNTESY INTERNACIONAL.",
      },
      {
        label: "ST-GREEK",
        canonicalModel: "ST-GREEK",
        aliases: ["ST-GREEK", "GREEK"],
        yearFrom: 2008,
        yearTo: 2018,
      },
      {
        label: "ST-ITA DM77",
        canonicalModel: "ST-ITA DM77",
        aliases: ["ST-ITA DM77", "DM77", "ITA DM77"],
        yearFrom: 2008,
        yearTo: 2018,
      },
      {
        label: "Coastal",
        canonicalModel: "COASTAL",
        aliases: ["COASTAL", "EUROVINIL COASTAL"],
        technicalModels: ["COASTAL"],
        yearFrom: 2009,
        yearTo: 2019,
      },
    ],
  },
  {
    id: "rfd-ots65-10-year-life",
    title: "RFD Marine - Liferafts: Replace all OTS-65 PRV's after 10 year life",
    bulletinNumber: "DSB SERVICE BULLETIN No. 10-2013 Ver.2",
    shortDescription: "Replace OTS-65 PRV after 10 years",
    issueDate: "Jan/2014",
    fileName: RFD_OTS65_BULLETIN_FILE,
    manufacturer: "RFD / DSB / SURVITEC",
    description: "Substituir as PRV Thanner OTS-65 das jangadas afetadas; operacionalmente no sistema estas jangadas ficam assinaladas independentemente do ano de fabrico.",
    appliesToBrands: ["RFD", "DSB", "SURVITEC"],
    servicePeriodicity: "Aplicação operacional ativa em todas as jangadas afetadas, independentemente do ano de fabrico registado na ficha.",
    notes: [
      "Boletim analisado do PDF na pasta de boletins: SB 10-2013 Ver.2.",
      "O boletim exige PRV Thanner OTS-65 com marcação de data de fabrico e substituição integral do conjunto, sem reutilizar componentes antigos.",
      "Por decisão operacional do utilizador, o sistema assinala estas jangadas independentemente do ano de fabrico registado.",
      "Peças de substituição indicadas no boletim: 00811400 (RED 3.5) e 00811410 (YELLOW 2.8), conforme o produto afetado.",
    ],
    rules: [
      {
        label: "RFD / DSB com PRV Thanner OTS-65",
        aliases: ["SURVIVA MKIII", "SURVIVA MKIV", "SURVIVA MKIV TO", "SEASAVA PLUS", "LR97", "LR 97", "DSL", "KOPAS", "HADAG", "SELANTIC", "CAT", "MINI"],
        technicalModels: ["SURVIVA MKIII", "SURVIVA MKIV TO", "SEASAVA PLUS"],
        inflationSystemAliases: ["THANNER", "THANNER DK99 / DK96", "ZODIAC / THANNER", "THANNER TYPE 5/60"],
        excludeInflationSystemAliases: ["LEAFIELD", "LEAF", "LEAFIELD GIST", "GIST"],
        valveAliases: ["OTS65", "OTS-65", "THANNER OTS65", "VAL-THAN-OTS65", "08152009", "00811410", "YELLOW 2.8", "00811400", "RED 3.5"],
        reasonSuffix: "aplicação operacional ativa independentemente do ano de fabrico",
        notes: "Regra baseada no sistema/válvula instalada; no sistema foi alargada para todas as jangadas afetadas independentemente do ano de fabrico.",
      },
    ],
  },
  {
    id: "survitec-rl6-internal-lamp-76-15",
    title: "Marine Surviva Mk IV & ISO 9650 – Liferaft: Installation of RL6 internal lamp",
    bulletinNumber: "SB 76/15 Ver.2",
    shortDescription: "Proteção da RL6 interna nas 4-8 pessoas",
    issueDate: "Apr/21",
    fileName: SURVITEC_RL6_INTERNAL_LAMP_FILE,
    manufacturer: "SURVITEC / RFD",
    description: "Aplicar uma folha de polietileno 600 × 300 mm sobre a RL6 interna nas jangadas afetadas para impedir que a hauling-in ladder encrave entre a luz e o arch tube, evitando insuflação incompleta do arco.",
    appliesToBrands: ["SURVITEC", "RFD"],
    servicePeriodicity: "Aplicar na próxima revisão programada das jangadas afetadas.",
    notes: [
      "Boletim analisado do PDF Marine Surviva Mk IV & ISO 9650 — Liferaft: Installation of RL6 internal lamp (SB 76/15, Ver.2 Apr/21).",
      "Problema identificado: nas 4/6/8 pessoas a hauling-in ladder pode prender entre a RL6 e o arch tube, impedindo a insuflação total do arco.",
      "A correção do boletim instala folha de polietileno 01999084 (600 × 300 mm) e fita preta 04834009 sobre a RL6 interna; no registo de serviço deve constar 'SB 76/15 Ver.2 APPLIED'.",
      "Como a ficha atual não guarda a posição do mounting patch da RL6, o sistema usa modelo + lotação 4/6/8 como proxy operacional para assinalar as jangadas que devem ser verificadas na próxima revisão.",
      "O próprio boletim indica que a incorporação já consta nos manuais M269-00 / M269-02; o alerta mantém-se útil para unidades em serviço sem evidência documental de embodiment.",
    ],
    rules: [
      {
        label: "Surviva Mk IV 4-8 persons",
        canonicalModel: "SURVIVA MKIV TO",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4"],
        technicalModels: ["SURVIVA MKIV TO"],
        capacities: [4, 6, 8],
        reasonSuffix: "lotação 4/6/8 abrangida; verificar/embodir proteção da RL6 interna na próxima revisão",
      },
      {
        label: "ISO 9650 4-8 persons (excluding SeaSava Plus)",
        canonicalModel: "SEASAVA PRO-ISO",
        aliases: ["SEASAVA PRO-ISO", "ISO 9650", "ISO9650", "ISO 9650 PU"],
        technicalModels: ["SEASAVA PRO-ISO"],
        capacities: [4, 6, 8],
        reasonSuffix: "lotação 4/6/8 abrangida; verificar/embodir proteção da RL6 interna na próxima revisão",
      },
    ],
  },
  {
    id: "survitec-mk16-drain-holes-84-16",
    title: "Marine: Make drain holes in Mk 16 flat-pack containers",
    bulletinNumber: "SB 84/16",
    shortDescription: "Furos de drenagem em contentores MK16",
    issueDate: "2016",
    fileName: SURVITEC_MK16_DRAIN_HOLES_FILE,
    manufacturer: "SURVITEC / RFD / DSB",
    description: "Aplicar o boletim SB 84/16 nos contentores flat-pack MK16, criando/verificando os furos de drenagem previstos pelo fabricante durante a próxima revisão programada.",
    appliesToBrands: ["SURVITEC", "RFD", "DSB"],
    servicePeriodicity: "Aplicar na próxima revisão programada das jangadas com contentor MK16; confirmar embodiment documental nas revisões seguintes.",
    notes: [
      "Boletim registado a pedido do utilizador a partir do ficheiro '84_16 Marine Make drain holes in Mk 16 flat-pack containers (1).pdf'.",
      "A lógica operacional cruza a família técnica da jangada com o modelo de contentor MK16; quando a ficha da jangada já tem `containerModel`, esse valor prevalece sobre o catálogo técnico para reduzir falsos positivos.",
      "As famílias técnicas atualmente mapeadas com contentor MK16 no catálogo são SURVIVA MKIV TO e DSB LR07.",
      "Como o projeto não guarda ainda um estado específico de embodiment por contentor, o alerta permanece ativo até o boletim ser marcado como aplicado na ficha da jangada.",
    ],
    rules: [
      {
        label: "Marine flat-pack container MK16",
        canonicalModel: "SURVIVA MKIV TO",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4", "LR07"],
        technicalModels: ["SURVIVA MKIV TO", "LR07"],
        containerAliases: ["MK16", "MK 16", "MK-16", "FLAT PACK MK16"],
        reasonSuffix: "contentor MK16 abrangido; executar/verificar os furos de drenagem do SB 84/16 na próxima revisão",
      },
    ],
  },
  {
    id: "survitec-mkiv-canopy-zip-sliders-12-21",
    title: "Marine Mk IV liferafts – Canopy: Inspect the canopy doorway zip sliders",
    bulletinNumber: "SB 12/21 Ver.1",
    shortDescription: "Inspeção dos zip sliders do canopy",
    issueDate: "Jul/21",
    fileName: SURVITEC_MKIV_CANOPY_ZIPS_FILE,
    manufacturer: "SURVITEC / RFD / RFDB / SSPI / SSS / EUROVINIL / DSB / DBC / TOYO / ZODIAC",
    description: "Inspecionar em cada revisão os zip sliders metálicos das portas do canopy das Mk IV e, se houver corrosão em qualquer um, substituir todos os sliders metálicos por sliders em resina 12750009.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC", "TOYO", "ZODIAC"],
    servicePeriodicity: "Aplicar a inspeção em cada revisão; se houver corrosão em qualquer slider metálico, substituir todos os sliders metálicos da jangada por resina na mesma intervenção.",
    notes: [
      "Boletim analisado do PDF SB 12/21 Ver.1 (Jul/21).",
      "Equipamento afetado: todas as Marine Mk IV liferafts, incluindo referências associadas aos manuais M269-00, M269-02, M271 e M275.",
      "Se existir slider metálico OPTI ou YKK com corrosão, todos os sliders metálicos do doorway canopy devem ser substituídos por resin zip sliders 12750009; não é uma troca parcial.",
      "Peças/consumíveis indicados: 02426001 (4 kgf thread), 08110009 (525 lbf cord, 500 mm) e 12750009 (resin zip slider).",
      "Ferramentas locais: cutting pliers, stitch picker e água/vinagre para remover corrosão antes da desmontagem do cursor metálico.",
      "O registo de serviço deve mencionar 'SB 12/21 Ver.1 APPLIED'.",
      "Este boletim é o procedimento detalhado referido na secção 6.G do SB 43/21 Ver.4 quando existem canopy zip pullers metálicos com dano/corrosão.",
    ],
    rules: [
      {
        label: "Marine Mk IV canopy doorway zips",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4", "SEASAVA PLUS", "SEASAVA PLUS R", "SEASAVA PRO-ISO", "EXTENDED SERVICE", "ESR", "TOYO"],
        technicalModels: ["SURVIVA MKIV TO", "SEASAVA PLUS", "SEASAVA PRO-ISO"],
        reasonSuffix: "inspeção obrigatória em cada revisão; se houver corrosão num slider metálico, substituir todos por resina 12750009",
      },
    ],
  },
  {
    id: "survitec-multi-label-sheets-46-21",
    title: "Marine — Liferaft Container: Introduction of multi-label sheets",
    bulletinNumber: "SB 46/21 Ver.2",
    shortDescription: "Folhas multi-etiquetas para contentores",
    issueDate: "Mar/23",
    fileName: SURVITEC_MULTI_LABEL_SHEETS_FILE,
    manufacturer: "SURVITEC / RFD / DSB / SURVITEC ZODIAC",
    description: "Substitui a rotulagem individual dos contentores por folhas multi-etiquetas, incluindo etiquetas 'do not cut' em substituição da fita, devendo ser aplicada na próxima revisão programada das jangadas/contentores abrangidos.",
    appliesToBrands: ["SURVITEC", "RFD", "DSB", "ZODIAC"],
    servicePeriodicity: "Aplicar na próxima revisão programada do equipamento afetado.",
    notes: [
      "Boletim analisado do PDF SB 46/21 Ver.2 (Mar/23).",
      "O objetivo do boletim é substituir as etiquetas soltas do contentor por uma folha multi-etiquetas e trocar a fita 'do not cut' por etiquetas dedicadas, reduzindo tempo de preparação e desperdício de plástico de uso único.",
      "Equipamento afetado indicado no PDF: Ferryman (M177), Ferryman Open Reversible Liferaft (M310), Means of Rescue (M236), Surviva Mk I (M090), Surviva Mk II (M245), Surviva Mk III (M251), Surviva Mk IV Annual Service (M269-00/M269-02) e Surviva Mk IV Extended Service (M271).",
      "Peças principais do boletim: item 1 annual-service multi-label sheet (RFD 53795001, Survitec Zodiac 53796001, DSB 53797001, Survitec 53819001), item 2 davit-launch add-on sheet 53801001, item 3 extended-service sheet 53800001, item 4 Ferryman sheet 53798001, item 5 Means of Rescue sheet 53799001.",
      "Nos contentores annual-service davit-launch o PDF manda usar a combinação item 1 + item 2; nos extended-service davit-launch manda usar item 2 + item 3.",
      "O registo de serviço deve mencionar exatamente 'SB 46/21 Ver.2 APPLIED'.",
      "O projeto não guarda de forma consistente toda a geometria/configuração do contentor (TO/DL/posição das etiquetas), por isso a aplicação no sistema é feita ao nível da família técnica da jangada; a escolha exata da folha e o esquema posicional continuam ancorados no PDF.",
      "As famílias DSB LR05/LR07/LR97 são tratadas como proxies operacionais das linhas Surviva annual-service cobertas pelos manuais DSB/Survitec equivalentes presentes no projeto.",
    ],
    rules: [
      {
        label: "Surviva annual-service families",
        canonicalModel: "SURVIVA MKIV TO",
        aliases: [
          "SURVIVA MK I", "SURVIVA MKI", "MK I", "MKI",
          "SURVIVA MK II", "SURVIVA MKII", "MK II", "MKII",
          "SURVIVA MK III", "SURVIVA MKIII", "MK III", "MKIII",
          "SURVIVA MK IV", "SURVIVA MKIV", "MK IV", "MKIV",
          "LR05", "LR07", "LR97", "LR97 L",
        ],
        technicalModels: ["SURVIVA MKII", "SURVIVA MKIII", "SURVIVA MKIV TO", "LR05", "LR07", "LR97", "LR97 L"],
        reasonSuffix: "na próxima revisão programada substituir etiquetas individuais e fita 'do not cut' pela folha multi-etiquetas correspondente; em contentores DL annual-service usar item 1 + item 2",
      },
      {
        label: "Surviva extended-service families",
        canonicalModel: "SEASAVA PLUS",
        aliases: ["SEASAVA PLUS", "SEASAVA PLUS R", "EXTENDED SERVICE", "ESR", "SURVIVA EXTENDED SERVICE"],
        technicalModels: ["SEASAVA PLUS"],
        reasonSuffix: "na próxima revisão programada aplicar a multi-label sheet de extended service (53800001); em contentores DL usar item 2 + item 3",
      },
      {
        label: "Ferryman liferafts",
        canonicalModel: "FERRYMAN",
        aliases: ["FERRYMAN"],
        technicalModels: ["FERRYMAN"],
        reasonSuffix: "na próxima revisão programada aplicar a Ferryman multi-label sheet 53798001 nos contentores throw-over abrangidos",
      },
      {
        label: "Ferryman open reversible liferafts",
        aliases: ["FERRYMAN OPEN REVERSIBLE", "OPEN REVERSIBLE"],
        technicalModels: [],
        reasonSuffix: "na próxima revisão programada confirmar a aplicação da multi-label sheet Ferryman conforme M310 / SB 46/21",
      },
      {
        label: "Means of Rescue containers",
        aliases: ["MEANS OF RESCUE", "MOR"],
        technicalModels: [],
        reasonSuffix: "na próxima revisão programada aplicar a Means of Rescue multi-label sheet 53799001 ao contentor abrangido",
      },
    ],
  },
  {
    id: "survitec-mkiv-servicing-optimisation-43-21",
    title: "Marine Mk IV liferafts – Servicing: Servicing optimisation (gasket seal, pyrotechnics valises, bellows valise, canopy zips)",
    bulletinNumber: "SB 43/21 Ver.4",
    shortDescription: "Otimização de servicing MKIV",
    issueDate: "Apr/26",
    fileName: SURVITEC_MKIV_SERVICING_OPTIMISATION_FILE,
    manufacturer: "SURVITEC / RFD / RFDB / SSPI / SSS / EUROVINIL / DSB / DBC / ZODIAC",
    description: "Atualiza o servicing das Marine Mk IV com novo gasket seal, valises reutilizáveis para pirotecnia, bellows valise obrigatória para bellows tipo pump e substituição de canopy zip pullers metálicos por resina quando houver corrosão ou dano.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC", "ZODIAC"],
    servicePeriodicity: "Desde 01/10/2021: 6.D em cada revisão programada; 6.E e 6.F na próxima revisão programada; 6.G quando necessário.",
    notes: [
      "Boletim analisado do PDF SB 43/21 Ver.4 (Apr/26), que atualiza a Ver.3 (Oct/24) e rescinde as emissões por marca 27/21 a 37/21.",
      "Equipamento afetado no boletim: Surviva Mk IV e Surviva Mk IV Extended Service liferafts com drop height de 36 metros ou menos (manuais M269-00/M269-02/M271).",
      "A referência 05606009 (IFS 7001008) mantém-se, mas o gasket seal usa adesivo revisto e deve ser substituído em cada revisão; o stock antigo continua utilizável.",
      "As novas valises 53769001 / 53770001 / 53771001 (IFS 7001001/7001002/7001003) e 53793001 (IFS 7001004) reduzem desperdício e tempo de inspeção; para bellows tipo pump (45201001/45201002) o uso da bellows valise é obrigatório e pillowflex/bubblewrap deixa de ser permitido; bellows tipo beehive (51784001) não precisa de packing adicional.",
      "Quando houver corrosão ou dano em um canopy zip puller metálico, todos os zip pullers da jangada devem ser substituídos por 12750009 (IFS 7001007) em resina; não misturar metal e resina.",
      "A Ver.4 remove a instrução de tirar os rocket pyros diretamente da valise e acrescenta três imagens (incluindo a Figura 706C, packing do contentor MK 10 com drop height ≤ 36 m): ao verificar datas de validade, puxar pela espuma (foam padding) e nunca pelo dispositivo, para evitar ativação acidental.",
      "O campo de registo no PDF pede a anotação exata 'SB 43/21 Ver.4 APPLIED'.",
      "A ficha atual usa `maxStowageHeight` como proxy operacional para o critério de drop height ≤ 36 m; quando esse valor falta, o sistema mantém o alerta nas famílias MKIV abrangidas para confirmação durante o servicing.",
    ],
    rules: [
      {
        label: "Surviva Mk IV ≤36 m drop height",
        canonicalModel: "SURVIVA MKIV TO",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4"],
        technicalModels: ["SURVIVA MKIV TO"],
        maxStowageHeightMeters: 36,
        reasonSuffix: "otimização ativa: gasket seal em cada revisão, pyro/bellows valises na próxima revisão e canopy zips em resina quando necessário",
      },
      {
        label: "Extended Service Mk IV ≤36 m drop height",
        canonicalModel: "SEASAVA PLUS",
        aliases: ["SEASAVA PLUS", "SEASAVA PLUS R", "EXTENDED SERVICE", "ESR"],
        technicalModels: ["SEASAVA PLUS"],
        maxStowageHeightMeters: 36,
        reasonSuffix: "proxy operacional para a família M271 Extended Service: gasket seal em cada revisão, pyro/bellows valises na próxima revisão e canopy zips em resina quando necessário",
      },
    ],
  },
  {
    id: "survitec-spare-parts-consolidation-12-24",
    title: "Marine liferafts – Spare parts: Consolidation of multiple branded part numbers",
    bulletinNumber: "SB 12/24 Ver.1",
    shortDescription: "Consolidação de referências de spare parts",
    issueDate: "27-May-2025",
    fileName: SURVITEC_SPARES_CONSOLIDATION_FILE,
    manufacturer: "SURVITEC / RFD / DSB / EUROVINIL / ZODIAC",
    description: "Consolida referências de comprimidos anti-enjoo, kits de primeiros socorros e luzes/baterias RL5/RL6/RB2; o stock existente continua utilizável até ficar inservível ou expirar, mas novas encomendas e substituições devem usar as referências consolidadas.",
    appliesToBrands: ["SURVITEC", "RFD", "DSB", "EUROVINIL", "EV", "ZODIAC"],
    servicePeriodicity: "Aplicar na encomenda/substituição dos componentes abrangidos; não exige remover peças ainda válidas em serviço.",
    notes: [
      "Boletim analisado do PDF SB 12/24 Ver.1, May/25.",
      "O boletim rescinde referências antigas por marca para tablets anti-enjoo, first aid kits e luzes/baterias RL5/RL6/RB2.",
      "O stock existente pode continuar em uso; a consolidação aplica-se à próxima substituição/encomenda.",
      "O cartão/registo de serviço deve mencionar 'SB 12/24 Ver.1 APPLIED'.",
    ],
    rules: [
      {
        label: "Anti-seasickness tablets / comprimidos de enjoo",
        aliases: [],
        equipmentAliases: ["SEASICKNESS TABLETS", "ANTI SEA SICKNESS TABLETS", "TABLET ANTI SEASICK"],
        referenceAliases: ["DSB00940350", "Z64514", "01174009", "Z7406"],
        reasonSuffix: "consolidação ativa para futuras substituições/encomendas",
      },
      {
        label: "First aid kits / kits de primeiros socorros",
        aliases: [],
        equipmentAliases: ["FIRST AID KIT", "KIT FIRST AID", "AMBULANCIA", "FIRST AID"],
        referenceAliases: ["15199001", "DSB00940220", "05886009", "30202050", "12865009", "11801009", "11802009", "11803009", "11804009", "Z63703", "06556009", "06484009", "12162009", "12874009"],
        reasonSuffix: "consolidação ativa para futuras substituições/encomendas",
      },
      {
        label: "RL5 / RL6 / RB2 lights and batteries",
        aliases: [],
        equipmentAliases: [
          "INSIDE LIGHT AND BATTERY",
          "TOP LIGHT AND BATTERY",
          "INTERNAL LAMP UNIT RL5",
          "EXTERNAL LAMP UNIT RL5",
          "RL6",
          "RB2",
          "LIGHT READING RL6",
          "LIGHT P I RL6",
          "POWER UNIT ASSY MARINE RB2",
          "DANIAMANT RL6 BATTERY",
          "RL6 LIGHT",
        ],
        referenceAliases: [
          "11785009", "11786009", "11787009", "11796009", "11797009", "12236009", "12866009",
          "11788009", "11790009", "11793009", "11798009", "11799009", "12235009", "12868009",
          "11791009", "11800009", "12867009", "11794009", "12875009",
          "08279009", "08402009", "11848009", "12869009",
          "08280009", "08403009", "11847009", "12870009", "08461009", "12871009",
          "06729009", "08195009", "12872009", "Z64186", "Z64228", "Z64233", "80913820",
        ],
        reasonSuffix: "consolidação ativa para futuras substituições/encomendas",
      },
    ],
  },
  {
    id: "survitec-emergency-pack-protective-foam-13-23",
    title: "Marine liferafts — Emergency pack: Position of protective foam",
    bulletinNumber: "SB 13/23 Ver.1",
    shortDescription: "Posicionamento de protective foam no emergency pack",
    issueDate: "2023",
    fileName: SURVITEC_EMERGENCY_PACK_PROTECTIVE_FOAM_FILE,
    manufacturer: "SURVITEC / ZODIAC / RFD / DSB",
    description: "Define o posicionamento correto das protective foams do emergency pack para evitar contacto indevido entre equipamento de emergência, cilindro e componentes de insuflação.",
    appliesToBrands: ["SURVITEC", "ZODIAC", "RFD", "DSB"],
    servicePeriodicity: "Aplicar na próxima revisão programada das jangadas afetadas e confirmar posicionamento em todas as revisões subsequentes.",
    notes: [
      "Boletim associado ao ficheiro 'Marine liferafts — Emergency pack_ Position of protective foam.pdf' existente na pasta de boletins.",
      "Regra operacional implementada por combinação de família técnica e referências de protective foam no inventário técnico da jangada.",
      "A validação no sistema usa referências de foam para reduzir falsos positivos em famílias não afetadas.",
    ],
    rules: [
      {
        label: "Survitec Zodiac TO / TO SR com protective foam do emergency pack",
        aliases: ["TO", "TO SR", "ZODIAC TO", "ZODIAC TO SR"],
        technicalModels: ["TO", "TO SR"],
        referenceAliases: ["Z63286", "Z63088", "Z63071", "Z2041"],
        reasonSuffix: "validar e corrigir o posicionamento das protective foams do emergency pack na próxima revisão",
      },
      {
        label: "Família Marine Mk IV / LR97 com protective foam de emergency pack",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4", "LR97", "LR97 L"],
        technicalModels: ["SURVIVA MKIV TO", "LR97", "LR97 L"],
        equipmentAliases: ["PROTECTIVE FOAM", "PROTECTION FOAM", "EMERGENCY PACK FOAM"],
        reasonSuffix: "validar e corrigir o posicionamento das protective foams do emergency pack na próxima revisão",
      },
    ],
  },
  {
    id: "survitec-dk99-operating-head-20-25-a",
    title: "Marine liferafts and MES — Inflation system: Replace the Thanner DK99 operating head",
    bulletinNumber: "SB 20/25-A",
    shortDescription: "Substituição da cabeça de disparo Thanner DK99",
    issueDate: "Jan/26",
    fileName: SURVITEC_DK99_OPERATING_HEAD_FILE,
    manufacturer: "SURVITEC / SURVITEC ZODIAC",
    description: "ALERTA: substituir as cabeças de disparo Thanner DK99 dos lotes afetados (part numbers 08969009, ZC30651, ZC30652 e kits Z63126/Z63127) cujo serial consta do Apêndice 1, devolvendo-as à Survitec Dunmurry (reembolso ou substituição gratuita); as cabeças de substituição são reparadas pelo OEM e vêm identificadas com etiqueta 'Q.C. PASSED'.",
    appliesToBrands: ["SURVITEC", "ZODIAC"],
    servicePeriodicity: "Stock/spares: aplicar de imediato (retirar do inventário e devolver a Survitec Dunmurry). Equipamento em serviço: na próxima revisão programada, ou mais cedo se praticável; se reparado/instalado após 01/05/2025 e a bordo, registar a substituição na próxima revisão.",
    notes: [
      "Boletim analisado do PDF 'Marine liferafts and MES — Inflation system: Replace the Thanner DK99 operating head' (ALERT SERVICE BULLETIN 20/25-A, Ver.1 Jan/26, 15-Jan-2026), aprovado pela Survitec Design Authority.",
      "Defeito: lote específico de cabeças Thanner DK99 com defeito menor que pode impedir a ativação correta; o boletim determina que TODAS as cabeças afetadas sejam identificadas, devolvidas e substituídas.",
      "Equipamento afetado (Tabela 1 do boletim): 08969009 (Thanner 99-023) HEAD OP'TING DK99S-1 VAC COMP. usado na Endura 35 TO/DL; ZC30651 (Thanner 99-021) HEAD BOTTLE DK99S 1SOR usado em múltiplas jangadas/slides/air-bags Survitec Zodiac e kits de serviço; ZC30652 (Thanner 99-160) CYLINDER VALVE DK99S 2SOR; Z63126 BOTTLE HEAD DK99S 1SOR TH (kit que inclui ZC30651); Z63127 BOTTLE HEADE DK99S 2SOR TH (kit que inclui ZC30652).",
      "A identificação é feita pelo serial listado no Apêndice 1 do boletim (part numbers ZC30652, ZC30651 e 08969009). Como a ficha da jangada não guarda o serial da cabeça, o sistema assinala operacionalmente as famílias que montam cabeças DK99 em sistema THANNER (Survitec Zodiac TO/TO SR, cujo catálogo inclui o kit Z63127) para que o técnico confirme o serial contra o Apêndice 1.",
      "Tarefas: A) stock — identificar, retirar do inventário e devolver; B) equipamento em serviço — remover a cabeça conforme o manual, devolver e instalar cabeça nova; C) reparado após 01/05/2025 a bordo — rever packing certificate/test & survey report, anotar substituição na próxima revisão e encomendar cabeça nova à Survitec; D) se C não for praticável, enviar cópias dos certificados para reporting.",
      "Reembolso ou substituição gratuita são assegurados; as cabeças de substituição são reparadas pelo OEM e identificadas com etiqueta 'Q.C. PASSED' (Figura 3).",
      "Registo: o boletim não exige anotação específica no serviço ('None required').",
      "Reporting: para cada equipamento onde foram aplicadas as tarefas, ou se o boletim não puder ser implementado, notificar corrective.actions@survitecgroup.com.",
      "A DSB LR97 usa a cabeça DK99 (08008009) apenas como alternativa opcional à DK94; como 08008009 não consta da Tabela 1 do boletim, a LR97 fica de fora do alerta automático — confirmar o serial se houver DK99 instalada.",
    ],
    rules: [
      {
        label: "Survitec Zodiac TO / TO SR com cabeça de disparo DK99 (Thanner)",
        aliases: ["TO", "TO SR", "ZODIAC TO", "ZODIAC TO SR", "SURVITEC ZODIAC TO", "50 TO", "TO 50"],
        technicalModels: ["TO", "TO SR"],
        inflationSystemAliases: ["THANNER"],
        equipmentAliases: ["DK99", "DK99 HEAD", "DK99S"],
        referenceAliases: ["Z63127", "Z63126", "ZC30651", "ZC30652", "08969009", "Z64766", "DK99-SERVICE-KIT"],
        reasonSuffix: "ALERTA SB 20/25-A: confirmar o serial da cabeça de disparo DK99 contra o Apêndice 1; se abrangido, devolver a cabeça à Survitec Dunmurry e instalar cabeça nova com etiqueta 'Q.C. PASSED' na próxima revisão",
      },
    ],
  },
  {
    id: "rfd-dymo-tape-data-labels-54-16",
    title: "Marine liferafts – Container: Introduction of dymo tape on data labels",
    bulletinNumber: "SB 54/16 Ver.1",
    shortDescription: "Fita dymo nas etiquetas de dados do contentor",
    issueDate: "Sep/16",
    fileName: RFD_DYMO_TAPE_DATA_LABELS_FILE,
    manufacturer: "SURVITEC / RFD / DSB",
    description: "A informação da data label (no exterior do contentor) deixa de ser escrita com tinta permanente e passa a ser exibida com fita dymo (fita adesiva com texto preto, cassete 6 mm TZe211 Brother, p/n 11845009), porque a tinta tende a desvanecer e torna a etiqueta ilegível.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC", "TOYO", "ZODIAC", "LALIZAS", "PLASTIMO", "VIKING", "OCEAN SAFETY", "ARIMAR", "SEAGO", "ALMAR", "FORWATER", "SEA-SAFE"],
    servicePeriodicity: "Aplicar na próxima revisão programada das jangadas afetadas; enquanto não aplicado, a informação da data label permanece em tinta permanente.",
    notes: [
      "Boletim analisado do PDF 'Marine liferafts — Container _ Introduction of dymo tape on data labels.pdf' (SB 54/16 Ver.1, RFD Beaufort Inc., Sep/16).",
      "Aplica-se a TODAS as Marine liferafts: a data label fica no exterior do contentor e a tinta permanente desvanece.",
      "Tarefas: copiar a informação de cada campo da data label para uma etiqueta dymo; limpar a data label com água quente e sabão e pano sem fiapos; secar com pano seco; colar cada etiqueta dymo na localização correta. Se a data label precisar de ser substituída, seguir o Service Manual.",
      "Peça indicada: Dymo tape cassette 6 mm TZe211 Brother tape, com texto preto — part number 11845009 (quantidade 'as required', obtida localmente).",
      "Ferramenta: Dymo labelmaker (obtida localmente).",
      "Registo: 'None required'; Reporting: 'None required'.",
      "Por decisão operacional, o boletim fica aplicável por defeito a todas as jangadas do sistema.",
    ],
    rules: [
      {
        label: "Todas as Marine liferafts",
        aliases: [],
        reasonSuffix: "implementado por defeito: reescrever a informação da data label do contentor em fita dymo (p/n 11845009, cassete TZe211 6 mm) na próxima revisão programada",
      },
    ],
  },
  {
    id: "survitec-26900-pressure-conversions-40-16",
    title: "Marine Service Manual: Correction of pressure conversions in Manual 269-00",
    bulletinNumber: "SB 40/16 Ver.1",
    shortDescription: "Correção das conversões de pressão do Manual M269-00",
    issueDate: "Sep/16",
    fileName: SURVITEC_26900_PRESSURE_CONVERSIONS_FILE,
    manufacturer: "SURVITEC / RFD / DSB",
    description: "Corrige as conversões de pressão do Manual M269-00 (Marine MK IV Family Version 5): hemispherical pressures de insuflação corrigidas para Throwover 2.8–3.2 psi / 1970–2250 mm WG / 193–221 mb e Davit-launch 3.5–4 psi / 2441–2814 mm WG / 239–276 mb.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC", "TOYO", "ZODIAC"],
    servicePeriodicity: "Atualização documental: usar as conversões corrigidas na próxima revisão programada das jangadas M269-00 (Marine MK IV Family Version 5).",
    notes: [
      "Boletim analisado do PDF 'Marine Service Manual_ Correction of pressure conversions in Manual 269-00.pdf' (SB 40/16 Ver.1, Survitec Group Dunmurry, Sep/16).",
      "É uma atualização documental apenas (section 6.2: 'Service Manual 269-00 will be updated and re-issued'), sem peças nem ferramentas requeridas.",
      "Correções (Section 5, página 510): 3.5 (b)(i) Throwover — inflamar os compartimentos entre 2.8 psi / 1970 mm WG / 193 mb e 3.2 psi / 2250 mm WG / 221 mb; 3.5 (b)(ii) Davit-launch — inflamar entre 3.5 psi / 2441 mm WG / 239 mb e 4 psi / 2814 mm WG / 276 mb; 3.5 (e)(ii) Davit-launch — 3.5 psi / 2441 mm WG / 239 mb (correção de 241 mb → 239 mb).",
      "As antigas instruções citavam '4907 mb' e '5605 mb' de forma incorreta (unidades mm WG a 1970/2250 respetivamente), agora corrigidas para mb real (193/221).",
      "Registo: usar o protocolo documental standard; Reporting: 'None required'.",
    ],
    rules: [
      {
        label: "Marine MK IV Family (Manual M269-00)",
        canonicalModel: "SURVIVA MKIV TO",
        aliases: ["SURVIVA MKIV", "SURVIVA MK IV", "MKIV", "MK IV", "MK4", "M269-00", "M269 00"],
        technicalModels: ["SURVIVA MKIV TO"],
        reasonSuffix: "atualização documental SB 40/16 Ver.1: usar as pressões corrigidas do M269-00 (Throwover 193–221 mb / 2.8–3.2 psi; Davit-launch 239–276 mb / 3.5–4 psi) na próxima revisão",
      },
    ],
  },
  {
    id: "survitec-liferaft-condemnation-57-2-2016",
    title: "Liferaft Condemnation",
    bulletinNumber: "SB 57-2 2016",
    shortDescription: "Critérios de condenação de jangadas",
    issueDate: "25 July 2016",
    fileName: SURVITEC_LIFERAFT_CONDEMNATION_FILE,
    manufacturer: "SURVITEC ZODIAC",
    description: "Define os critérios para condenar uma jangada: qualquer jangada ativada acidentalmente (no mar ou no cais), sujeita a fogo/calor intenso, a exposição anormal e prolongada a água, ou com falhas estruturais (NAP test/floor seam negativo, separação de costuras adesivas ou soldadas) ou reparação economicamente inviável, deve ser condenada.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC", "TOYO", "ZODIAC", "LALIZAS", "PLASTIMO", "VIKING", "OCEAN SAFETY", "ARIMAR", "SEAGO", "ALMAR", "FORWATER", "SEA-SAFE"],
    servicePeriodicity: "Aplicar quando ocorrer uma condição de condenação; a condenação deve ser registada na reinspição (tab 'Condemn a Liferaft').",
    notes: [
      "Boletim analisado do PDF 'Liferaft condemnation.pdf' (Service Bulletin n° 57-2 2016, Survitec Group, 25 July 2016).",
      "Obrigatório condenar: 1) qualquer jangada que tenha sido disparada acidentalmente (no mar ou no dockside) — mesmo que visualmente pareça em bom estado, o tecido foi submetido a esforços importantes que a retiram de serviço; 2) qualquer jangada com exposição anormal e prolongada à água doce ou salgada (ex.: armazenamento inadequado, lavagens pesadas).",
      "Outras razões de condenação: After ship wreck · Damaged by strong heat (fire on board or similar) · Vandalism · NAP test / Floor seam test negative · Separation of adhesive or welded seams · Beyond economical repair · Other.",
      "Deve ser executada no local de reinspição e registada no separador 'Condemn a Liferaft' do portal Survitec (apps2.survitecgroup.com).",
      "Contactos do boletim: Nadia Delaoutre-Pollato (General Manager) e Laura Clarin (Training and Network Manager); Survitec Zodiac, Route de Chatenet, 17210 Chevanceaux, França.",
    ],
    rules: [
      {
        label: "Todas as jangadas",
        aliases: [],
        reasonSuffix: "critérios de condenação SB 57-2 2016: ativação acidental, exposição anormal a água/fogo, falhas estruturais (NAP test / floor seam negativo, separação de costuras) ou reparação economicamente inviável — avaliar e condenar se aplicável",
      },
    ],
  },
  {
    id: "rfd-enhanced-inspection-adhesive-seams-18-08",
    title: "Marine – Liferafts: Enhanced inspection of adhesive seams",
    bulletinNumber: "SB 18/08 Marine Ver.2",
    shortDescription: "Inspeção reforçada das juntas adesivas (floor/buoyancy e lifting strap)",
    issueDate: "Mar/12",
    fileName: SURVITEC_ADHESIVE_SEAMS_FILE,
    manufacturer: "RFD BEAUFORT / SURVITEC / DSB",
    description: "Reforça a inspeção das juntas adesivas entre o piso (floor) e a câmara de flutuação (e, nas davit-launch, entre a cinta de elevação e o piso) nas jangadas Surviva / Seafarer / Seasava fabricadas antes de 2002; a cola degradada (castanho-escuro brilhante e quebradiça) implica a condenação da jangada.",
    appliesToBrands: ["SURVITEC", "RFD", "RFDB", "SSPI", "SSS", "EUROVINIL", "EV", "DSB", "DBC"],
    servicePeriodicity: "Aplicar em cada revisão programada das jangadas afetadas (DOM < 2002); a inspeção é feita em cada serviço, nas juntas ainda não inspecionadas.",
    notes: [
      "Boletim analisado do PDF 'Marine Liferafts_ Enhanced inspection of adhesive seams.pdf' (SB 18/08 Marine Ver.2, RFD Beaufort Limited, Dunmurry, Mar/12 — original Dec/08).",
      "Equipamento afetado: jangadas Surviva, Seafarer e Seasava com Data of Manufacture (DOM) anterior a 2002.",
      "As juntas afetadas localizam-se entre o piso (floor) e a câmara de flutuação (buoyancy tube); nas jangadas davit-launch pode também ser afetada a junta entre a cinta de elevação exterior e o piso. As restantes juntas adesivas não são afetadas.",
      "Inspeção: remover a jangada do contentor, insuflar e, com espátula, iniciar a separação das juntas nos cantos (distância de 50 mm, ou 100 mm se já marcada com patch de 50 mm); se necessário usar pistola de ar quente para soltar a junta. Não usar força excessiva.",
      "Cola degradada = aspeto castanho-escuro brilhante e quebradiça (dá para raspar com a unha); cola em bom estado = bege, tipo borracha, resistente à separação.",
      "Após inspeção, as zonas com cola em bom estado são reparadas conforme o service manual e marcadas com patch de tecido RFD 1015/1 de 50 mm de diâmetro (têxtil para fora); numa segunda reinspesão a separação aumenta para 100 mm e marca-se com um segundo patch de 50 mm.",
      "Registo obrigatório: anotar 'SB18/08 Ver 2' no cartão da jangada, no certificado de reinspesão (se aplicável) e no cartão 'Liferaft Service Record' (dentro do contentor).",
      "Reporting: jangadas com juntas adesivas degradadas devem ser condenadas no formulário online de condenação (secção 28, com a menção exata 'Liferaft condemned in accordance with SB18/08 Ver 2').",
      "Como o sistema usa `dataFabrico` como proxy do DOM, a regra aplica-se às famílias acima com ano de fabrico < 2002; sem ano de fabrico registado o alerta mantém-se para confirmação do técnico.",
    ],
    rules: [
      {
        label: "Surviva / Seafarer / Seasava com DOM < 2002",
        aliases: [
          "SURVIVA MK I", "SURVIVA MKI", "MK I", "MKI",
          "SURVIVA MK II", "SURVIVA MKII", "MK II", "MKII",
          "SURVIVA MK III", "SURVIVA MKIII", "MK III", "MKIII",
          "SURVIVA MK IV", "SURVIVA MKIV", "MK IV", "MKIV",
          "SEAFARER", "SEASAVA", "SEASAVA PLUS", "SEASAVA PLUS R", "SEASAVA PRO-ISO",
        ],
        technicalModels: ["SURVIVA MKII", "SURVIVA MKIII", "SURVIVA MKIV TO", "SEASAVA PLUS", "SEASAVA PRO-ISO"],
        yearTo: 2001,
        reasonSuffix: "SB 18/08 Ver.2: realizar a inspeção reforçada das juntas adesivas floor/buoyancy (e lifting strap nas davit-launch); cola degradada (castanho-escuro, quebradiça) => condenar",
      },
    ],
  },
];

function bulletinMatchesBrand(bulletin: TechnicalBulletin, brand: unknown): boolean {
  const brandTokens = buildComparableTokens(canonicalizeBrand(brand));
  return bulletin.appliesToBrands.some((candidate) => {
    const candidateTokens = buildComparableTokens(candidate);
    return candidateTokens.some((token) => brandTokens.includes(token));
  });
}

function ruleMatchesModel(rule: TechnicalBulletinRule, modelCandidates: string[]): boolean {
  if (!rule.aliases.length && !rule.canonicalModel && !(rule.technicalModels || []).length) {
    return true;
  }

  return modelCandidates.some((candidate) =>
    rule.aliases.some((alias) => includesComparable(candidate, alias)) ||
    (rule.canonicalModel ? includesComparable(candidate, rule.canonicalModel) : false) ||
    (rule.technicalModels || []).some((technicalModel) => includesComparable(candidate, technicalModel))
  );
}

function getInstalledConfigurationCandidates(raft: {
  brand?: unknown;
  model?: unknown;
  cylinderSistema?: unknown;
  valvulasAlivio?: unknown;
}) {
  const technicalModel = findRaftTechnicalModel(String(raft.brand ?? ""), String(raft.model ?? ""));

  const inflationSystems = new Set<string>();
  const valves = new Set<string>();

  [
    raft.cylinderSistema,
    technicalModel?.keyTechnicalData?.inflationSystem,
    ...(technicalModel?.inflationSystem || []),
  ]
    .filter(Boolean)
    .forEach((value) => inflationSystems.add(String(value)));

  [
    raft.valvulasAlivio,
    technicalModel?.keyTechnicalData?.valves,
    ...(technicalModel?.valves || []),
    ...((technicalModel?.serviceItems || [])
      .filter((item) => includesComparable(item.name, "OTS65") || includesComparable(item.reference || "", "OTS65") || includesComparable(item.reference || "", "08152009"))
      .flatMap((item) => [item.name, item.reference, item.notes])
      .filter(Boolean) as string[]),
  ]
    .filter(Boolean)
    .forEach((value) => valves.add(String(value)));

  return {
    inflationSystems: Array.from(inflationSystems),
    valves: Array.from(valves),
  };
}

function getContainerCandidates(raft: {
  brand?: unknown;
  model?: unknown;
  containerModel?: unknown;
}) {
  const technicalModel = findRaftTechnicalModel(String(raft.brand ?? ""), String(raft.model ?? ""));

  const containers = new Set<string>();
  const explicitContainerModel = String(raft.containerModel ?? "").trim();

  if (explicitContainerModel) {
    containers.add(explicitContainerModel);
  } else if (technicalModel?.containerModel) {
    containers.add(String(technicalModel.containerModel));
  }

  return Array.from(containers);
}

function getTechnicalInventoryCandidates(raft: {
  brand?: unknown;
  model?: unknown;
}) {
  const technicalModel = findRaftTechnicalModel(String(raft.brand ?? ""), String(raft.model ?? ""));

  const equipment = new Set<string>();
  const references = new Set<string>();

  const addItem = (item?: { name?: string; reference?: string; notes?: string }) => {
    if (!item) return;
    if (item.name) equipment.add(String(item.name));
    if (item.reference) references.add(String(item.reference));
    if (item.notes) equipment.add(String(item.notes));
  };

  (technicalModel?.packEquipment || []).forEach((pack) => pack.items.forEach((item) => addItem(item)));
  (technicalModel?.serviceItems || []).forEach((item) => addItem(item));
  (technicalModel?.spareParts || []).forEach((item) => addItem(item));
  (technicalModel?.lights || []).forEach((value) => equipment.add(String(value)));
  if (technicalModel?.battery) equipment.add(String(technicalModel.battery));

  return {
    equipment: Array.from(equipment),
    references: Array.from(references),
  };
}

function matchesCandidateAliases(candidates: string[], aliases?: string[]): boolean {
  if (!aliases || aliases.length === 0) return true;
  return candidates.some((candidate) => aliases.some((alias) => includesComparable(candidate, alias)));
}

function matchesForbiddenCandidateAliases(candidates: string[], aliases?: string[]): boolean {
  if (!aliases || aliases.length === 0) return false;
  return candidates.some((candidate) => aliases.some((alias) => includesComparable(candidate, alias)));
}

function matchesTechnicalInventory(
  inventory: ReturnType<typeof getTechnicalInventoryCandidates>,
  rule: TechnicalBulletinRule,
): boolean {
  if ((!rule.equipmentAliases || rule.equipmentAliases.length === 0) && (!rule.referenceAliases || rule.referenceAliases.length === 0)) {
    return true;
  }

  const equipmentOk = matchesCandidateAliases(inventory.equipment, rule.equipmentAliases);
  const referencesOk = matchesCandidateAliases(inventory.references, rule.referenceAliases);

  if (rule.equipmentAliases?.length && rule.referenceAliases?.length) return equipmentOk || referencesOk;
  if (rule.equipmentAliases?.length) return equipmentOk;
  return referencesOk;
}

function getLifeLimitMatch(rule: TechnicalBulletinRule, manufactureDateInfo: ReturnType<typeof parseManufactureDateInfo>) {
  if (!rule.lifeLimitYears || !manufactureDateInfo) return null;

  const dueDate = addYears(manufactureDateInfo.date, rule.lifeLimitYears);
  const dueWindowEnd = addMonths(new Date(), rule.dueWithinNextServiceMonths ?? 12);
  const applies = dueDate.getTime() <= dueWindowEnd.getTime();

  return {
    applies,
    dueDate,
    dueWindowEnd,
  };
}

export function getTechnicalBulletinsForBrand(brand: unknown): TechnicalBulletin[] {
  return technicalBulletins.filter((bulletin) => bulletinMatchesBrand(bulletin, brand));
}

export function getMatchingBulletinRulesForModel(brand: unknown, model: unknown) {
  const modelCandidates = getModelCandidates(brand, model);
  return getTechnicalBulletinsForBrand(brand)
    .map((bulletin) => ({
      bulletin,
      rules: bulletin.rules.filter((rule) => ruleMatchesModel(rule, modelCandidates)),
    }))
    .filter((entry) => entry.rules.length > 0);
}

export function getApplicableServiceBulletinsForRaft(raft: {
  brand?: unknown;
  model?: unknown;
  containerModel?: unknown;
  capacity?: unknown;
  maxStowageHeight?: unknown;
  dataFabrico?: unknown;
  cylinderSistema?: unknown;
  valvulasAlivio?: unknown;
}): ApplicableTechnicalBulletin[] {
  const matchedBrand = canonicalizeBrand(raft.brand);
  const matchedModelCandidates = getModelCandidates(raft.brand, raft.model);
  const matchedCapacity = resolveRaftCapacity(raft);
  const matchedMaxStowageHeight = parseMetersValue(raft.maxStowageHeight);
  const manufactureYear = parseManufactureYear(raft.dataFabrico);
  const manufactureDateInfo = parseManufactureDateInfo(raft.dataFabrico);
  const installedConfiguration = getInstalledConfigurationCandidates(raft);
  const containerCandidates = getContainerCandidates(raft);
  const technicalInventory = getTechnicalInventoryCandidates(raft);
  if (!matchedBrand || matchedModelCandidates.length === 0) return [];

  const rawMatches = getTechnicalBulletinsForBrand(raft.brand).flatMap((bulletin) =>
    bulletin.rules.flatMap((rule) => {
      if (!ruleMatchesModel(rule, matchedModelCandidates)) return [];
      if (rule.capacities?.length) {
        if (matchedCapacity === null || !rule.capacities.includes(matchedCapacity)) return [];
      }
      if (typeof rule.maxStowageHeightMeters === "number" && matchedMaxStowageHeight !== null && matchedMaxStowageHeight > rule.maxStowageHeightMeters) return [];
      if (!matchesCandidateAliases(containerCandidates, rule.containerAliases)) return [];
      if (!matchesCandidateAliases(installedConfiguration.inflationSystems, rule.inflationSystemAliases)) return [];
      if (matchesForbiddenCandidateAliases(installedConfiguration.inflationSystems, rule.excludeInflationSystemAliases)) return [];
      if (!matchesCandidateAliases(installedConfiguration.valves, rule.valveAliases)) return [];
      if (matchesForbiddenCandidateAliases(installedConfiguration.valves, rule.excludeValveAliases)) return [];
      if (!matchesTechnicalInventory(technicalInventory, rule)) return [];
      if (typeof rule.yearFrom === "number") {
        if (manufactureYear === null || manufactureYear < rule.yearFrom) return [];
      }
      if (typeof rule.yearTo === "number") {
        if (manufactureYear === null || manufactureYear > rule.yearTo) return [];
      }

      const lifeLimitMatch = getLifeLimitMatch(rule, manufactureDateInfo);
      if (lifeLimitMatch && !lifeLimitMatch.applies) return [];

      const matchedModel = rule.canonicalModel || matchedModelCandidates[0] || String(raft.model || "");
      const matchedContainer = rule.containerAliases?.find((alias) =>
        containerCandidates.some((candidate) => includesComparable(candidate, alias))
      ) || containerCandidates[0] || null;
      const intervalText = [rule.yearFrom, rule.yearTo].filter((value) => typeof value === "number").join("–");
      const capacityText = rule.capacities?.length && matchedCapacity !== null
        ? `${matchedCapacity} pessoas`
        : null;
      const maxStowageText = typeof rule.maxStowageHeightMeters === "number"
        ? matchedMaxStowageHeight !== null
          ? `altura máx. ${matchedMaxStowageHeight} m`
          : `altura máx. não registada (proxy ≤ ${rule.maxStowageHeightMeters} m)`
        : null;
      const containerText = rule.containerAliases?.length
        ? `contentor ${rule.containerAliases[0]}`
        : null;
      const configurationText = [
        containerText,
        installedConfiguration.inflationSystems[0],
        installedConfiguration.valves[0],
      ].filter(Boolean).join(" · ");
      const proxyText = manufactureDateInfo
        ? manufactureDateInfo.precision === "year"
          ? `fabrico ${manufactureDateInfo.label} usado como proxy da data da PRV`
          : `fabrico ${manufactureDateInfo.label} usado como proxy da data da PRV`
        : "data da PRV não registada";
      const lifeLimitReason = lifeLimitMatch
        ? `${rule.label} · ${configurationText || "OTS-65 identificado"} · substituição até ${formatMonthYear(lifeLimitMatch.dueDate)} (próximo anual, ${proxyText})`
        : null;
      const compatibilityReason = configurationText
        ? `${rule.label}${capacityText ? ` · ${capacityText}` : ""}${maxStowageText ? ` · ${maxStowageText}` : ""} · ${configurationText} · ${rule.reasonSuffix || "compatibilidade técnica confirmada"}`
        : `${rule.label}${capacityText ? ` · ${capacityText}` : ""}${maxStowageText ? ` · ${maxStowageText}` : ""} · compatibilidade técnica confirmada · ${rule.reasonSuffix || "aplicação validada pela ficha técnica"}`;

      return [{
        id: bulletin.id,
        title: bulletin.title,
        bulletinNumber: bulletin.bulletinNumber,
        shortDescription: bulletin.shortDescription,
        issueDate: bulletin.issueDate,
        manufacturer: bulletin.manufacturer,
        description: bulletin.description,
        fileName: bulletin.fileName,
        fileUrl: buildTechnicalBulletinUrl(bulletin.fileName),
        matchedBrand,
        matchedModel,
        matchedContainer,
        matchedRuleLabel: rule.label,
        manufactureYear,
        yearFrom: rule.yearFrom,
        yearTo: rule.yearTo,
        reason: lifeLimitReason || (intervalText
          ? `${rule.label} · fabrico ${manufactureYear} dentro do intervalo ${intervalText}`
          : compatibilityReason),
      } satisfies ApplicableTechnicalBulletin];
    })
  );

  const byBulletinId = new Map<string, ApplicableTechnicalBulletin>();
  const labelsByBulletinId = new Map<string, Set<string>>();
  const reasonsByBulletinId = new Map<string, Set<string>>();

  for (const match of rawMatches) {
    if (!byBulletinId.has(match.id)) {
      byBulletinId.set(match.id, match);
    }

    if (!labelsByBulletinId.has(match.id)) labelsByBulletinId.set(match.id, new Set<string>());
    if (!reasonsByBulletinId.has(match.id)) reasonsByBulletinId.set(match.id, new Set<string>());

    labelsByBulletinId.get(match.id)!.add(String(match.matchedRuleLabel || '').trim());
    reasonsByBulletinId.get(match.id)!.add(String(match.reason || '').trim());
  }

  return Array.from(byBulletinId.values()).map((entry) => {
    const labels = Array.from(labelsByBulletinId.get(entry.id) || []).filter(Boolean);
    const reasons = Array.from(reasonsByBulletinId.get(entry.id) || []).filter(Boolean);

    return {
      ...entry,
      matchedRuleLabel: labels.join(' · '),
      reason: reasons.join(' · '),
    };
  });
}