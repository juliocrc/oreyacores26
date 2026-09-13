import { normalizeLooseText } from "@/lib/text-normalization";
import { normalizeStockCategory } from "@/lib/stock-categories";

const NON_EXPIRING_KEYWORDS = [
  // Pagaias / Remos
  'paddles',
  'padles',
  'paddle',
  'oars',
  'oar',
  'remos',
  'remo',
  'pagaias',
  'pagaia',
  // Fole / Bomba
  'bellows',
  'fole',
  'batedouro',
  'pump',
  'bomba de enchimento',
  // Esponjas / Balde
  'sponges',
  'sponge',
  'esponjas',
  'esponja',
  'bailer',
  'balde',
  // Copos
  'drinking cup',
  'graduated cup',
  'cup',
  'copo',
  'copo graduado',
  // Lanterna (o corpo da lanterna não expira — só as pilhas expiram)
  'waterproof torch',
  'torch',
  'lanterna impermeavel',
  'lanterna impermeável',
  'torch kit',
  'kit de lanterna',
  // Manuais / Instruções
  'immediate action instructions',
  'survival instructions',
  'instrucoes de acao imediata',
  'instrucoes de sobrevivencia',
  'manual sobrevivencia',
  'manual de sobrevivencia',
  'manual interno',
  'survival manual',
  // Fita refletora
  'reflective tape',
  'fita refletora',
  'fita reflectora',
  // Pegas
  'grab handles',
  'grab handle',
  'pegas',
  'pega',
  // Retenida / Linha
  'painter line',
  'painter',
  'retenida',
  // Faca
  'floating knife',
  'safety knife',
  'knife',
  'faca flutuante',
  'faca de seguranca',
  'faca',
  // Ajudas térmicas
  'thermal protective aid',
  'thermal protection aid',
  'ajudas termicas',
  'ajudas térmicas',
  // Estojo de pesca
  'fishing kit',
  'estojo de pesca',
  'kit de pesca',
  // Quadro / Tabela de sinais
  'rescue signal table',
  'rescue signal card',
  'quadro de sinais',
  'signalling table',
  // Âncora flutuante
  'sea anchor',
  'sea anchor with line',
  'drogue',
  'ancora flutuante',
  'ancora flutuante com linha',
  'âncora flutuante com linha',
  // Apito
  'whistle',
  'apito',
  // Abre-latas / Tesouras
  'tin opener',
  'tin openers',
  'abre latas',
  'abre-latas',
  'scissors',
  'tesouras',
  // Espelho / Heliógrafo
  'heliograph',
  'signal mirror',
  'mirror',
  'heliografo',
  'heliógrafo',
  // Anel salva-vidas
  'lifebuoy ring',
  'anel salva vidas',
  'anel de salvacao',
  // Jogo de reparação
  'repair kit',
  'jogo de reparacao',
  'jogo de reparação',
  // Sacos para enjoo (embalagem, não consumível com prazo)
  'sea sick bags',
  'seasickness bags',
  'bag seasickness',
  'sacos para enjoo',
  'sacos de enjoo',
  'saco de enjoo',
];

// Artigos que SEMPRE têm validade, independentemente da categoria
const EXPIRING_KEYWORDS = [
  // Pirotécnicos
  'parachute rocket',
  'parachute rockets',
  'flare parachute',
  'paraquedas',
  'foguetes',
  'foguetão',
  'fogueteao',
  'foguetao',
  'red hand flare',
  'hand flare',
  'handflare',
  'facho',
  'fachos',
  'floating smoke',
  'smoke signal',
  'pote de fumo',
  'potes de fumo',
  'sinal fumigeno',
  'sinais fumigenos',
  // Águas / Rações
  'drinking water',
  'water sachet',
  'agua potavel',
  'água potável',
  'saco de agua',
  'saco de água',
  'saco agua',
  'food rations',
  'food ration',
  'racoes alimentares',
  'rações alimentares',
  'racoes',
  'rações',
  'racao',
  'ração',
  // Primeiros socorros
  'first aid kit',
  'farmacia',
  'farmácia',
  'ambulancia',
  'ambulância',
  'kit de primeiros socorros',
  'estojo de primeiros socorros',
  // Comprimidos
  'seasickness tablets',
  'seasickness tablet',
  'comprimidos',
  'comprimidos anti enjoo',
  'comprimidos p enjoo',
  // Pilhas / Baterias
  'torch batteries',
  'batteries for torch',
  'pilhas para lanterna',
  'pilhas lanterna',
  'pilhas suplentes',
  'pilhas',
  'bateria de litio',
  'bateria de lítio',
  'lithium battery',
  'bateria de lithium',
  'luz interior e bateria',
  'luz exterior e bateria',
  'luz de cupula e bateria',
  'luz interior',
  'luz exterior',
  'bateria litio',
];

// Categorias que podem ter validade (fallback quando não encontrar por keyword) —
// restrito à lista branca do utilizador (só estas famílias têm prazo).
const CATEGORIES_WITH_VALIDITY = [
  'PRIMEIROS SOCORROS',    // farmácias, comprimidos
  'PIROTÉCNICOS',          // foguetes, fachos, fumos
  'ILUMINAÇÃO',            // baterias de lítio e pilhas
];

function normalizeText(value: unknown) {
  return normalizeLooseText(value ?? '');
}

// Palavras vazias de significado (conectores) ignoradas no matching de keywords.
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'sem', 'e', 'c', 'p']);

function splitTokens(value: string) {
  return value.split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// True se todas as palavras da keyword existirem como palavras COMPLETAS no texto.
// Nunca casa por substring, para que "racao" não corresponda a "reparacao".
function keywordMatches(haystack: string, keyword: string) {
  if (!keyword) return false;
  const haystackTokens = new Set(splitTokens(normalizeText(haystack)));
  const keywordTokens = splitTokens(normalizeText(keyword));
  return keywordTokens.length > 0 && keywordTokens.every((t) => haystackTokens.has(t));
}

export function stockItemSupportsValidity(input: {
  nome?: unknown;
  descricao?: unknown;
  categoria?: unknown;
  codigoFabricante?: unknown;
  referencia?: unknown;
  observacoes?: unknown;
}) {
  const haystack = normalizeText([
    input?.nome,
    input?.descricao,
    input?.codigoFabricante,
    input?.referencia,
    input?.observacoes,
  ].filter(Boolean).join(' '));

  // 1. Se contém palavras de artigos SEM validade → retorna false imediatamente
  if (NON_EXPIRING_KEYWORDS.some((keyword) => keywordMatches(haystack, keyword))) {
    return false;
  }

  // 2. Se contém palavras de artigos COM validade → retorna true imediatamente
  if (EXPIRING_KEYWORDS.some((keyword) => keywordMatches(haystack, keyword))) {
    return true;
  }

  // 3. Fallback: verifica a categoria
  const normalizedCategory = normalizeStockCategory(input?.categoria, input?.descricao);
  return CATEGORIES_WITH_VALIDITY.includes(normalizedCategory);
}

export function normalizeStockValidityValue(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  }

  const yyyyMm = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (yyyyMm) {
    const year = Number(yyyyMm[1]);
    const month = Number(yyyyMm[2]);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) {
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  }

  return null;
}
