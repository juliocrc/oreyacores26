/**
 * Configuração de artigos obrigatórios por tipo de pack conforme normas SOLAS e ISO
 * Quantidades baseadas em normativas internacionais para jangadas salva-vidas
 */

export type PackType = 'SOLAS A' | 'SOLAS B' | 'ISO-RAFT' | 'ISO 9650-1' | 'ISO 9650-1 +24h' | 'ISO 9650-1 -24h' | 'ISO 9650-1 Liferaft' | 'ISO 9650-1 Gran flag +24h' | 'ISO 9650-1 ITALY' | 'ISO 9650-1 ITALY Gran bag' | 'ISO 9650-2 COASTAL' | 'ISO 9650 ESP' | 'COASTAL' | 'OFFSHORE' | 'E' | 'R' | 'STD' | 'SIMPLIFICADO MÍNIMO' | 'STD AR' | 'STD GR' | 'STD I' | 'STD UK' | 'STD IT' | 'CRUISER STANDARD' | 'CRUISER ORC' | 'CRUISER ORC+' | 'COASTAL ISO' | 'BICA' | 'TRANSOCEAN ORC' | 'TRANSOCEAN ORC+';

export const PACK_ARTICLE_CATEGORIES = [
  'SINALIZAÇÃO',
  'ILUMINAÇÃO',
  'SOBREVIVÊNCIA',
  'PRIMEIROS SOCORROS',
  'EQUIPAMENTO',
  'CONSUMÍVEIS',
  'CILINDROS',
] as const;

export type PackArticleCategory = (typeof PACK_ARTICLE_CATEGORIES)[number];

export type ArtigoTemplate = {
  nome: string;
  quantidadeBase?: number; // quantidade fixa
  quantidadePorPessoa?: number; // multiplicar pela capacidade
  quantidadePercentual?: number; // percentual da capacidade (ex: 0.1 = 10%)
  minimo?: number; // quantidade mínima
  maximo?: number; // quantidade máxima (cap regulatório)
  obrigatorio: boolean;
  categoria: PackArticleCategory;
  observacoes?: string;
  // Para cálculo de embalagens comerciais
  unidadePorEmbalagem?: number; // quantas unidades vêm numa embalagem comercial
  tipoUnidade?: 'unidades' | 'litros' | 'gramas'; // tipo de medida
  // Escalas por faixa de capacidade (regra de tiers)
  escalas?: Array<{ minCapacidade: number; quantidade: number }>;
};

const RAFT_MANAGED_PACK_ARTICLE_NAMES = new Set([
  'INSIDE LIGHT AND BATTERY',
  'TOP LIGHT AND BATTERY',
  'LUZ INTERIOR E BATERIA',
  'LUZ EXTERIOR E BATERIA',
  'LUZ DE CUPULA E BATERIA',
  'LUZ DE CÚPULA E BATERIA',
]);

export function isRaftManagedPackArticleName(value?: string | null) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  return RAFT_MANAGED_PACK_ARTICLE_NAMES.has(normalized);
}

const TORCH_TEMPLATE: ArtigoTemplate = {
  nome: 'Lanterna',
  quantidadeBase: 1,
  obrigatorio: true,
  categoria: 'ILUMINAÇÃO',
  observacoes: 'Regra operacional: todas as jangadas com pack levam lanterna, exceto jangadas SOS.',
};

const TORCH_BATTERIES_TEMPLATE: ArtigoTemplate = {
  nome: 'Pilhas para Lanterna',
  quantidadeBase: 4,
  obrigatorio: true,
  categoria: 'ILUMINAÇÃO',
  observacoes: 'Regra operacional: 4 pilhas por jangada; substituição em todas as inspeções e com validade controlada.',
};

export const PACK_TEMPLATES: Record<PackType, ArtigoTemplate[]> = {
  'SOLAS A': [
    // Sinalização Pirotécnica (SOLAS LSA Code MSC.404(96))
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, maximo: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS A: 4 paraquedas (mín. 2 para jangadas ≤25P)' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS A: 6 fachos de mão' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS A: 2 potes de fumo' },
    
    // Iluminação
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    
    // Primeiros Socorros e Saúde
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    
    // Proteção Térmica (SOLAS: 10% da capacidade, mín. 2)
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, maximo: 25, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mínimo 2, máximo 25 (SOLAS)' },
    
    // Consumíveis — escala por capacidade
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'SOLAS A: 1 ração (500g/10.000kJ) por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'SOLAS A: 3 embalagens de água (0.5L) por pessoa = 1.5L/pessoa', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    
    // Equipamento de Sobrevivência
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    
    // Equipamento Operacional (SOLAS: mínimo 2 pagaias, 1 batedouro, etc.)
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Âncora flutuante (SOLAS: mín. 2)' },
    { nome: 'Pagaias', quantidadeBase: 2, maximo: 4, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'SOLAS: mín. 2 pagaias' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Faca flutuante (SOLAS: mín. 2)' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'SOLAS B': [
    // Sinalização Pirotécnica — SOLAS B: menos foguetes e sinalizadores
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS B: 2 unidades (vs 4 no SOLAS A)' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS B: 3 unidades (vs 6 no SOLAS A)' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'SOLAS B: 1 unidade' },

    // Iluminação — sem duplicatas (usar templates)
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização (SOLAS)' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },

    // Primeiros socorros e saúde
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: '1 saco por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },

    // Proteção térmica
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mínimo 2' },

    // Consumíveis
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },

    // Equipamento de sobrevivência
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },

    // Equipamento operacional
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'SOLAS B: 2 âncoras flutuantes' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole de enchimento' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Faca flutuante (SOLAS: mín. 2)' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO-RAFT': [
    // Sinalização Pirotécnica - REDUZIDA (ISO 9650-2)
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 0, obrigatorio: false, categoria: 'SINALIZAÇÃO', observacoes: '2 se capacidade > 12 pessoas' },
    
    // Primeiros Socorros
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },

    // Iluminação operacional
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    
    // Equipamento básico
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
  ],
  
  'COASTAL': [
    // Pack costeiro Eurovinil / Zodiac Coastal / equivalentes
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Anel de borracha com retenida flutuante de 30m.' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Remos flutuantes.' },
    { nome: 'Abre-Latas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Pack COASTAL: 2 paraquedas.' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização.' },
    { nome: 'Quadro de Sinais', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Código de sinais.' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Saco de Água', quantidadePorPessoa: 0.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'Pack COASTAL: 1 embalagem de água (0.5L) por pessoa', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'Pack COASTAL: 6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: '1 saco por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
  ],
  
  'OFFSHORE': [
    // Pack offshore (>24h, mais completo que COASTAL)
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'OFFSHORE: 4 paraquedas (mín. 2 para ≤25P)' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, maximo: 25, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mínimo 2, máximo 25 (SOLAS)' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'OFFSHORE: 3 embalagens de água (0.5L) por pessoa = 1.5L/pessoa', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: '1 saco por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: '2 âncoras flutuantes' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Faca flutuante (SOLAS: mín. 2)' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

'E': [
    // Pack E / pesca local-costeira (reintroduzido como pack canónico distinto)
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Pack E: 2 paraquedas.' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Pack E: 3 fachos de mão.' },
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'Pack E: 6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 0.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'Pack E: 0.5L de água (1 embalagem de 0.5L) por pessoa', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ação Imediata', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Quadro de Sinais', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'R': [
    // Pack reduzido/simplificado para navegação costeira (R / legado ORC)
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
  ],

  'STD': [
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: '1 saco por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
  ],

  'SIMPLIFICADO MÍNIMO': [
    // Pack mínimo simplificado para navegação de curta distância
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
  ],

  'ISO 9650-1': [
    // Pack ISO 9650-1 (jangadas maiores, offshore)
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: '1 saco por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'ISO 9650 ESP': [
    // Pack ISO 9650 ESP (Espanha, variante regional)
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'ISO 9650 ESP: 6 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'STD AR': [
    // Pack STD AR (Argentina, variante regional)
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fachos de Mão', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 4, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'STD AR: 4 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 2, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'STD AR: 2 sacos por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'STD GR': [
    // Pack STD GR (Grécia, variante regional)
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fachos de Mão', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Abre-Latas', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 4, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'STD GR: 4 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 2, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'STD GR: 2 sacos por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'STD I': [
    // Pack STD I (Itália, variante regional)
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ação Imediata', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'STD UK': [
    // Pack STD UK (Reino Unido, variante regional)
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ação Imediata', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'STD IT': [
    // Pack STD IT (Itália padrão, mais amplo)
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Abre-Latas', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 4, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'STD IT: 4 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Sacos de Enjoo', quantidadePorPessoa: 2, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'STD IT: 2 sacos por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ação Imediata', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'CRUISER STANDARD': [
    // Plastimo Cruiser Standard (ORC/ISO recomendações)
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: '2 âncoras flutuantes' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.15, minimo: 2, maximo: 6, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '15% da capacidade, mín. 2, máx. 6' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Cintas de Endireitamento', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 4, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '4 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização (SOLAS)' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Bastões de Luz Química', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: '500 grs' },
    { nome: 'Fitas Retrorrefletoras na Tenda', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: '300 grs' },
    { nome: 'Lanterna Estanque', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
  ],

  'CRUISER ORC': [
    // ORC alinhado com a matriz Eurovinil partilhada pelo utilizador
    { nome: 'Anel Salva-Vidas com Cabo', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'ORC: 6 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],

  'CRUISER ORC+': [
    // Plastimo Cruiser ORC+ (versão melhorada do ORC)
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: '2 âncoras flutuantes' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.15, minimo: 2, maximo: 6, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '15% da capacidade, mín. 2, máx. 6' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Cintas de Endireitamento', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 4, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '4 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização (SOLAS)' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Lanterna Estanque', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
  ],

  'COASTAL ISO': [
    // Plastimo Coastal ISO (<24h, navegação costeira)
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, maximo: 6, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mín. 2, máx. 6' },
    { nome: 'Pagaias', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Cintas de Endireitamento', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Lanterna Estanque', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
  ],

  'BICA': [
    // Plastimo BICA
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Número de Identidade', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fitas Retrorrefletoras de Sinalização na Tenda', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: '300 grs' },
    { nome: 'Fita Retrorrefletora de Sinalização no Fundo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: '900 grs' },
    { nome: 'Lanterna Estanque', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
  ],

  'TRANSOCEAN ORC': [
    // Plastimo Transocean ORC (offshore, >24h)
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, maximo: 10, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mín. 2, máx. 10' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Lanterna Estanque', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
  ],

  'TRANSOCEAN ORC+': [
    // Plastimo Transocean ORC+ (versão ampliada offshore)
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: '3 âncoras flutuantes' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.15, minimo: 3, maximo: 12, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '15% da capacidade, mín. 3, máx. 12' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Heliógrafo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Lanterna Estanque', quantidadeBase: 2, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
  ],
  
  // ISO 9650-1 variantes com duração de 24h+ ou 24h-
  'ISO 9650-1 +24h': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '10% da capacidade, mínimo 2' },
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'pack +24h: 1 embalagem de ração por pessoa', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', observacoes: 'pack +24h: 3 embalagens de água (0.5L) por pessoa = 1.5L/pessoa', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Âncora flutuante' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Bomba/Fole' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO', observacoes: 'Faca flutuante' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-1 -24h': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, minimo: 12, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: '6 doses por pessoa, mín. 12 para packs <24h', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.05, minimo: 1, maximo: 12, obrigatorio: true, categoria: 'SOBREVIVÊNCIA', observacoes: '5% da capacidade, mínimo 1 (pack <24h)' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-1 Liferaft': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-1 Gran flag +24h': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Gran flag variante +24h' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'Espelho de sinalização' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-1 ITALY': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-1 ITALY Gran bag': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 4, obrigatorio: true, categoria: 'SINALIZAÇÃO', observacoes: 'ITALY Gran bag variante' },
    { nome: 'Fachos de Mão', quantidadeBase: 6, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Potes de Fumo', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Luz Interior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    { nome: 'Luz Exterior e Bateria', quantidadeBase: 1, obrigatorio: true, categoria: 'ILUMINAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Ajudas Térmicas', quantidadePercentual: 0.1, minimo: 2, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Rações Alimentares 0,5 Kg', quantidadePorPessoa: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 1, tipoUnidade: 'unidades' },
    { nome: 'Saco de Água', quantidadePorPessoa: 1.5, obrigatorio: true, categoria: 'CONSUMÍVEIS', unidadePorEmbalagem: 0.5, tipoUnidade: 'litros' },
    { nome: 'Copo Graduado', quantidadeBase: 1, obrigatorio: true, categoria: 'CONSUMÍVEIS' },
    { nome: 'Estojo de Pesca', quantidadeBase: 1, obrigatorio: true, categoria: 'SOBREVIVÊNCIA' },
    { nome: 'Heliógrafo', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 3, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
  
  'ISO 9650-2 COASTAL': [
    { nome: 'Foguetes Paraquedas', quantidadeBase: 2, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Fachos de Mão', quantidadeBase: 3, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    TORCH_TEMPLATE,
    TORCH_BATTERIES_TEMPLATE,
    { nome: 'Farmácia Solas', quantidadeBase: 1, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS' },
    { nome: 'Comprimidos p/ Enjoo', quantidadePorPessoa: 6, obrigatorio: true, categoria: 'PRIMEIROS SOCORROS', observacoes: 'ISO 9650-2: 6 comprimidos por pessoa', unidadePorEmbalagem: 60, tipoUnidade: 'unidades' },
    { nome: 'Apito', quantidadeBase: 1, obrigatorio: true, categoria: 'SINALIZAÇÃO' },
    { nome: 'Batedouro', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Âncora Flutuante com Linha', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Pagaias', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Fole', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Jogo de Reparação', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Faca', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Esponjas', quantidadeBase: 2, obrigatorio: true, categoria: 'EQUIPAMENTO' },
    { nome: 'Instruções de Sobrevivência', quantidadeBase: 1, obrigatorio: true, categoria: 'EQUIPAMENTO' },
  ],
};

const NON_SELECTABLE_PACK_TYPES = new Set<PackType>(['BICA']);
const PACK_TYPE_OPTION_SET = new Set<string>(
  Object.keys(PACK_TEMPLATES).filter((packType) => !NON_SELECTABLE_PACK_TYPES.has(packType as PackType))
);

export const SEM_PACK_OPTION = 'Sem pack';

export function isRecognizedPackTypeOption(value?: string | null): boolean {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return false;
  if (PACK_TYPE_OPTION_SET.has(raw)) return true;
  return normalizarPackType(raw) !== null;
}

export function getRecognizedPackTypeOptions(values: Array<string | null | undefined>): string[] {
  const resolved = new Set<string>();

  for (const value of values) {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;

    if (PACK_TYPE_OPTION_SET.has(raw)) {
      resolved.add(raw);
      continue;
    }

    const normalized = normalizarPackType(raw);
    if (normalized && PACK_TYPE_OPTION_SET.has(normalized)) {
      resolved.add(normalized);
    }
  }

  // Always include "Sem pack" option for SOS rafts
  resolved.add(SEM_PACK_OPTION);

  return Array.from(resolved).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

function isSolasBProvision(artigo: ArtigoTemplate) {
  const nome = artigo.nome.trim().toLowerCase();
  return nome === 'water' || nome === 'drinking water' || nome.includes('água') || nome.includes('agua');
}

export function isRationArticle(name?: string): boolean {
  const norm = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(
    (word) =>
      word === 'racao' ||
      word === 'racoes' ||
      word === 'ration' ||
      word === 'rations' ||
      word === 'food' ||
      word.startsWith('aliment')
  );
}

/**
 * Calcula a quantidade necessária de um artigo baseado na capacidade da jangada
 */
export function calcularQuantidade(artigo: ArtigoTemplate, capacidade: number): number {
  // 1. Escalas por faixa de capacidade (ex: SOLAS A foguetes: 4 para ≤25P, 6 para >25P)
  if (artigo.escalas && artigo.escalas.length > 0) {
    // Encontra a escala adequada (da maior faixa para a menor)
    const escala = [...artigo.escalas].sort((a, b) => b.minCapacidade - a.minCapacidade)
      .find(e => capacidade >= e.minCapacidade);
    if (escala) {
      let q = escala.quantidade;
      if (artigo.minimo !== undefined) q = Math.max(q, artigo.minimo);
      if (artigo.maximo !== undefined) q = Math.min(q, artigo.maximo);
      return q;
    }
  }

  // 2. Quantidade base (fixa, ignorada pela capacidade)
  if (artigo.quantidadeBase !== undefined) {
    let q = artigo.quantidadeBase;
    if (artigo.minimo !== undefined) q = Math.max(q, artigo.minimo);
    if (artigo.maximo !== undefined) q = Math.min(q, artigo.maximo);
    return q;
  }
  
  // 3. Quantidade por pessoa (multiplicação linear)
  if (artigo.quantidadePorPessoa !== undefined) {
    let q = Math.ceil(artigo.quantidadePorPessoa * capacidade);
    if (artigo.minimo !== undefined) q = Math.max(q, artigo.minimo);
    if (artigo.maximo !== undefined) q = Math.min(q, artigo.maximo);
    return q;
  }
  
  // 4. Quantidade percentual (ceil do percentual × capacidade)
  if (artigo.quantidadePercentual !== undefined) {
    let q = Math.ceil(artigo.quantidadePercentual * capacidade);
    if (artigo.minimo !== undefined) q = Math.max(q, artigo.minimo);
    if (artigo.maximo !== undefined) q = Math.min(q, artigo.maximo);
    return q;
  }
  
  return 1; // default
}

/**
 * Calcula quantas embalagens comerciais são necessárias
 * Exemplos:
 * - 36 comprimidos com embalagens de 60 = 1 embalagem
 * - 9L de água com embalagens de 0.5L = 18 embalagens
 * - 3kg de ração com embalagens de 500g = 6 embalagens
 */
export function calcularEmbalagens(artigo: ArtigoTemplate, capacidade: number): {
  quantidadeTotal: number;
  embalagens: number;
  unidade: string;
} {
  const quantidadeTotal = calcularQuantidade(artigo, capacidade);
  
  // Se não tem embalagem definida, retorna a quantidade total como embalagens
  if (!artigo.unidadePorEmbalagem) {
    return {
      quantidadeTotal,
      embalagens: quantidadeTotal,
      unidade: artigo.tipoUnidade || 'unidades',
    };
  }
  
  // Calcula embalagens necessárias (arredonda para cima)
  const embalagens = Math.ceil(quantidadeTotal / artigo.unidadePorEmbalagem);
  
  return {
    quantidadeTotal,
    embalagens,
    unidade: artigo.tipoUnidade || 'unidades',
  };
}

/**
 * Formata a quantidade para exibição
 * Exemplo: "36 comprimidos (1 embalagem de 60)"
 */
export function formatarQuantidade(artigo: ArtigoTemplate, capacidade: number): string {
  const { quantidadeTotal, embalagens, unidade } = calcularEmbalagens(artigo, capacidade);
  
  if (!artigo.unidadePorEmbalagem) {
    // Sem embalagem definida
    if (artigo.tipoUnidade === 'litros') {
      return `${quantidadeTotal}L`;
    }
    if (artigo.tipoUnidade === 'gramas') {
      return quantidadeTotal >= 1000 ? `${quantidadeTotal / 1000}kg` : `${quantidadeTotal}g`;
    }
    return `${quantidadeTotal} ${unidade}`;
  }
  
  // Com embalagem definida
  let descricaoTotal = '';
  if (artigo.tipoUnidade === 'litros') {
    descricaoTotal = `${quantidadeTotal}L`;
  } else if (artigo.tipoUnidade === 'gramas') {
    descricaoTotal = quantidadeTotal >= 1000 ? `${quantidadeTotal / 1000}kg` : `${quantidadeTotal}g`;
  } else {
    descricaoTotal = `${quantidadeTotal} ${unidade}`;
  }
  
  const descricaoEmbalagem = artigo.tipoUnidade === 'litros' 
    ? `${artigo.unidadePorEmbalagem}L`
    : artigo.tipoUnidade === 'gramas'
      ? `${artigo.unidadePorEmbalagem}g`
      : `${artigo.unidadePorEmbalagem}`;
  
  return `${descricaoTotal} (${embalagens} ${embalagens !== 1 ? 'embalagens' : 'embalagem'} de ${descricaoEmbalagem})`;
}

/**
 * Normaliza o nome do tipo de pack para o padrão usado nos templates
 */
export function normalizarPackType(packType: string): PackType | null {
  const normalized = packType.trim().toUpperCase();
  const compact = normalized.replace(/\s+/g, ' ').trim();
  const compactNoSpaces = compact.replace(/\s+/g, '');
  const isIso9650_1 = compact.includes('ISO 9650-1') || compact.includes('ISO9650-1') || compactNoSpaces.includes('ISO9650-1');
  const isIso9650_2 = compact.includes('ISO 9650-2') || compact.includes('ISO9650-2') || compactNoSpaces.includes('ISO9650-2');

  // Eurovinil M14 / International pack types → mapped to built-in equivalents
  // These must stay before generic patterns to prevent false matches
  // (e.g., "STANDARD INTERNATIONAL" should not match the generic "STANDARD" check below)
  if (compact.includes('ST-GREEK') || compact.includes('STANDARD GREEK')) return 'STD';
  if (
    compact.includes('ST-INTL') ||
    compact.includes('ST-USA') ||
    compact.includes('STANDARD INTERNATIONAL') ||
    compact.includes('STD INT') ||
    compact.includes('STD. INT') ||
    compact.includes('STANDARD INT')
  ) return 'STD';
  if (compact.includes('DM219') || compact.includes('DM-219') || compact.includes('ISO9650 ITA')) return 'ISO-RAFT';
  if (compact.includes('GRAB BAG') && compact.includes('ITA')) return 'ISO-RAFT';

  // Variantes específicas ISO 9650-1 (devem vir antes do mapeamento genérico)
  if (isIso9650_1 && (compact.includes('+24') || compact.includes('>24') || compact.includes('24H+') || compactNoSpaces.includes('+24H') || compactNoSpaces.includes('>24H'))) return 'ISO 9650-1 +24h';
  if (isIso9650_1 && (compact.includes('-24') || compact.includes('<24') || compact.includes('24H-') || compactNoSpaces.includes('-24H') || compactNoSpaces.includes('<24H'))) return 'ISO 9650-1 -24h';
  if (isIso9650_1 && (compact.includes('LIFERAFT') || compact.includes('LIFE RAFT'))) return 'ISO 9650-1 Liferaft';
  if (isIso9650_1 && compact.includes('GRAN FLAG') && (compact.includes('+24') || compact.includes('>24') || compact.includes('24H+') || compactNoSpaces.includes('+24H') || compactNoSpaces.includes('>24H'))) return 'ISO 9650-1 Gran flag +24h';
  if (isIso9650_1 && compact.includes('ITALY') && (compact.includes('GRAN BAG') || compact.includes('GRANBAG'))) return 'ISO 9650-1 ITALY Gran bag';
  if (isIso9650_1 && compact.includes('ITALY')) return 'ISO 9650-1 ITALY';
  if (isIso9650_2 && compact.includes('COASTAL')) return 'ISO 9650-2 COASTAL';

  // Alias frequentes em certificados/manuais ISO 9650 (ex.: Pack 1/Pack 2)
  if (isIso9650_1) return 'ISO 9650-1';
  if (compact.includes('ISO 9650 ESP') || compact.includes('ISO9650ESP') || compact.includes('ISO 9650-ESP')) return 'ISO 9650 ESP';
  if (isIso9650_2) return 'ISO-RAFT';
  if (compact === 'STD AR' || compact.includes('STD AR')) return 'STD AR';
  if (compact === 'STD GR' || compact.includes('STD GR')) return 'STD GR';
  if (compact === 'STD IT' || compact.includes('STD IT')) return 'STD IT';
  if (compact === 'STD UK' || compact.includes('STD UK')) return 'STD UK';
  if (compact === 'STD I' || compact.includes('STD I')) return 'STD I';
  if (compact.includes('<24H') || compact.includes('< 24H') || compact.includes('*- 24H') || compact.includes('-24H') || compactNoSpaces.includes('<24H') || compactNoSpaces.includes('-24H')) return 'COASTAL';
  if (compact.includes('>24H') || compact.includes('> 24H') || compact.includes('24H+') || compactNoSpaces.includes('>24H') || compactNoSpaces.includes('+24H')) return 'OFFSHORE';
  if (compact.includes('PACK 1') || compact.includes('PACK1')) return 'OFFSHORE';
  if (compact.includes('PACK 2') || compact.includes('PACK2')) return 'COASTAL';
  
  if (normalized.includes('SOLAS A') || normalized === 'SOLAS-A') return 'SOLAS A';
  if (normalized.includes('SOLAS B') || normalized === 'SOLAS-B' || normalized === 'SOLAS "B"') return 'SOLAS B';
  if (normalized.includes('ISO') || normalized.includes('ISO-RAFT')) return 'ISO-RAFT';
  if (normalized.includes('COASTAL')) return 'COASTAL';
  if (normalized.includes('OFFSHORE')) return 'OFFSHORE';

  // Plastimo pack types (como tipos independentes, não mapeados a SOLAS/ISO)
  if (compact.includes('CRUISER') && compact.includes('STANDARD')) return 'CRUISER STANDARD';
  if (compact.includes('CRUISER') && compact.includes('ORC') && compact.includes('+')) return 'CRUISER ORC+';
  if (compact.includes('CRUISER') && compact.includes('ORC')) return 'CRUISER ORC';
  if (compact.includes('COASTAL') && compact.includes('ISO')) return 'COASTAL ISO';
  if (compact === 'BICA') return 'BICA';
  if (compact.includes('TRANSOCEAN') && compact.includes('ORC') && compact.includes('+')) return 'TRANSOCEAN ORC+';
  if (compact.includes('TRANSOCEAN') && compact.includes('ORC')) return 'TRANSOCEAN ORC';

  // Alias comuns extraídos de quadros/certificados 2025
  if (compact === 'STD' || compact === 'STANDARD') return 'STD';
  if (
    compact === 'E' ||
    compact === 'PACK E' ||
    normalized.includes('CLASSE E') ||
    normalized.includes('DGRM E') ||
    normalized.includes('LOCAL E') ||
    /\bE\b/.test(normalized)
  ) return 'E';
  if (compact === 'R') return 'R';
  
  // Pack Simplificado Mínimo (deve vir antes do R genérico) -> mapeado para R
  if (normalized.includes('MIN') && (normalized.includes('SIMPL') || normalized.includes('REDUZ'))) return 'R';
  if (normalized.match(/^MIN(IMO)?$/)) return 'R';
  if (compact === 'NIN') return 'R'; // OCR/erro comum para MIN
  
  // Pack E / reduzido / pesca local-costeira
  if (normalized.includes('ORC+')) return 'OFFSHORE';
  if (normalized.includes('ORC')) return 'COASTAL';
  if (normalized.includes('PACK E')) return 'E';
  if (normalized.includes('REDUZ')) return 'E';
  if (normalized.includes('SIMPL')) return 'R';
  if (compact === 'SIM' || compact === 'SIMP' || compact === 'SIMP.' || compact === 'SIMPL') return 'R';
  
  // Tenta inferir pelo nome
  if (normalized.includes('SOLAS') && !normalized.includes('A') && !normalized.includes('B')) {
    return 'SOLAS B'; // default SOLAS
  }
  
  return null;
}

/**
 * Obtém a lista de artigos obrigatórios para um tipo de pack e capacidade (sem duplicatas)
 */
export function obterArtigosObrigatorios(packType: string, capacidade: number): Array<{ 
  nome: string; 
  quantidade: number;
  embalagens?: number;
  descricaoQuantidade: string;
  categoria: string; 
  observacoes?: string;
}> {
  const tipo = normalizarPackType(packType);
  if (!tipo) return [];
  
  const template = PACK_TEMPLATES[tipo];
  if (!template) return [];

  const templateFiltrado = template.filter((artigo) => {
    if (tipo === 'SOLAS B' && isSolasBProvision(artigo)) return false;
    if ((tipo === 'R' || tipo === 'E' || tipo === 'SOLAS B' || tipo === 'COASTAL' || tipo === 'ISO-RAFT') && isRationArticle(artigo.nome)) return false;
    return true;
  });

  // Remove duplicatas mantendo a primeira ocorrência
  const artigosUnicos = Array.from(
    new Map(templateFiltrado.map(a => [a.nome.toLowerCase(), a])).values()
  );
  
  return artigosUnicos
    .filter(artigo => artigo.obrigatorio && !isRaftManagedPackArticleName(artigo.nome))
    .map(artigo => {
      const { quantidadeTotal, embalagens } = calcularEmbalagens(artigo, capacidade);
      
      return {
        nome: artigo.nome,
        quantidade: quantidadeTotal,
        embalagens: artigo.unidadePorEmbalagem ? embalagens : undefined,
        descricaoQuantidade: formatarQuantidade(artigo, capacidade),
        categoria: artigo.categoria,
        observacoes: artigo.observacoes,
      };
    });
}

/**
 * Valida se uma jangada tem todos os artigos obrigatórios
 */
export function validarConformidade(
  packType: string,
  capacidade: number,
  artigosAtuais: Array<{ name: string; quantidade?: number }>
): {
  conforme: boolean;
  faltantes: Array<{ nome: string; quantidadeEsperada: number }>;
  excesso: Array<{ nome: string; quantidadeAtual: number; quantidadeEsperada: number }>;
} {
  const obrigatorios = obterArtigosObrigatorios(packType, capacidade);
  const faltantes: Array<{ nome: string; quantidadeEsperada: number }> = [];
  const excesso: Array<{ nome: string; quantidadeAtual: number; quantidadeEsperada: number }> = [];
  
  // Normaliza nomes para comparação
  const normalizar = (nome: string) => nome.toLowerCase().trim().replace(/\s+/g, ' ');
  
  obrigatorios.forEach(obrigatorio => {
    const nomeNormalizado = normalizar(obrigatorio.nome);
    const encontrado = artigosAtuais.find(atual => 
      normalizar(atual.name).includes(nomeNormalizado) || 
      nomeNormalizado.includes(normalizar(atual.name))
    );
    
    if (!encontrado) {
      faltantes.push({
        nome: obrigatorio.nome,
        quantidadeEsperada: obrigatorio.quantidade,
      });
    } else if (encontrado.quantidade !== undefined && encontrado.quantidade < obrigatorio.quantidade) {
      faltantes.push({
        nome: obrigatorio.nome,
        quantidadeEsperada: obrigatorio.quantidade,
      });
    }
  });
  
  return {
    conforme: faltantes.length === 0 && excesso.length === 0,
    faltantes,
    excesso,
  };
}

/**
 * Gera um resumo dos artigos por categoria
 */
export function resumoPorCategoria(packType: string, capacidade: number) {
  const artigos = obterArtigosObrigatorios(packType, capacidade);
  const porCategoria: Record<string, Array<{ nome: string; quantidade: number; embalagens?: number; descricaoQuantidade: string }>> = {};
  
  artigos.forEach(artigo => {
    if (!porCategoria[artigo.categoria]) {
      porCategoria[artigo.categoria] = [];
    }
    porCategoria[artigo.categoria].push({
      nome: artigo.nome,
      quantidade: artigo.quantidade,
      embalagens: artigo.embalagens,
      descricaoQuantidade: artigo.descricaoQuantidade,
    });
  });
  
  return porCategoria;
}
