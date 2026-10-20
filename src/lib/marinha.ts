export type MarinhaTipo =
  | "Fragata"
  | "Submarino"
  | "Corveta"
  | "Navio-patrulha oceânico"
  | "Navio-patrulha"
  | "Lancha rápida"
  | "Navio hidrográfico"
  | "Navio-escola"
  | "Navio de apoio logístico"
  | "Unidade auxiliar"
  | "Embarcação salva-vidas";

export type MarinhaNavio = {
  numero: string;
  nome: string;
  ano?: number;
  nota?: string;
  base?: string;
  organizacao?: string;
  funcao?: string;
};

export type MarinhaEspecificacao = {
  label: string;
  valor: string;
};

export type MarinhaClasse = {
  id: string;
  nome: string;
  tipo: MarinhaTipo;
  resumo: string;
  especificacoes: MarinhaEspecificacao[];
  navios: MarinhaNavio[];
};

export type MarinhaMeioAereo = {
  id: string;
  modelo: string;
  quantidade: number;
  esquadrilha: string;
  base: string;
  funcao: string;
};

export type MarinhaZona = {
  sigla: string;
  nome: string;
  sede: string | null;
  jurisdicao: string;
  dependencia: string;
  unidades: string[];
  nota?: string;
};

export const MARINHA_TIPOS: MarinhaTipo[] = [
  "Fragata",
  "Submarino",
  "Corveta",
  "Navio-patrulha oceânico",
  "Navio-patrulha",
  "Lancha rápida",
  "Navio hidrográfico",
  "Navio-escola",
  "Navio de apoio logístico",
  "Unidade auxiliar",
  "Embarcação salva-vidas",
];

export const marinhaClasses: MarinhaClasse[] = [
  {
    id: "vasco-da-gama",
    nome: "Classe Vasco da Gama",
    tipo: "Fragata",
    resumo:
      "Fragatas lança-mísseis de escolta oceânica, baseadas no projeto MEKO 200 PN. Constituem o núcleo de combate de superfície da Armada.",
    especificacoes: [
      { label: "Deslocamento", valor: "3 200 t (plena carga)" },
      { label: "Comprimento", valor: "115,9 m" },
      { label: "Boca", valor: "14,8 m" },
      { label: "Velocidade", valor: "32 nós" },
      { label: "Guarnição", valor: "180" },
      { label: "Propulsão", valor: "CODOG (2 diesel + 2 turbinas a gás)" },
      { label: "Armamento", valor: "Mísseis Harpoon e antiaéreos, peça de 100 mm, torpedos e CIWS" },
      { label: "Aeronave", valor: "Helicóptero Lynx Mk95A" },
    ],
    navios: [
      { numero: "F330", nome: "Vasco da Gama", ano: 1991 },
      { numero: "F331", nome: "Álvares Cabral", ano: 1991 },
      { numero: "F332", nome: "Corte-Real", ano: 1992 },
      {
        numero: "F333",
        nome: "Bartolomeu Dias",
        ano: 1994,
        nota: "Adquirida aos Países Baixos (ex-HNLMS Van Nes).",
      },
      {
        numero: "F334",
        nome: "D. Francisco de Almeida",
        ano: 1994,
        nota: "Adquirida aos Países Baixos (ex-HNLMS Van Galen).",
      },
    ],
  },
  {
    id: "tridente",
    nome: "Classe Tridente",
    tipo: "Submarino",
    resumo:
      "Submarinos de propulsão diesel-elétrica com sistema AIP, vocacionados para vigilância, patrulha e operações de combate naval.",
    especificacoes: [
      { label: "Deslocamento", valor: "1 700 t (superfície) / 2 020 t (imersão)" },
      { label: "Comprimento", valor: "67,9 m" },
      { label: "Boca", valor: "6,3 m" },
      { label: "Velocidade", valor: "20 nós (imersão)" },
      { label: "Guarnição", valor: "33" },
      { label: "Propulsão", valor: "Diesel-elétrica com AIP" },
      { label: "Armamento", valor: "8 tubos de 533 mm para torpedos" },
    ],
    navios: [
      { numero: "S160", nome: "Tridente", ano: 2010 },
      { numero: "S161", nome: "Arpão", ano: 2010 },
    ],
  },
  {
    id: "joao-coutinho",
    nome: "Classe João Coutinho",
    tipo: "Corveta",
    resumo:
      "Corvetas de patrulha e escolta costeira, concebidas para missões de soberania e vigilância nas áreas marítimas nacionais.",
    especificacoes: [
      { label: "Deslocamento", valor: "cerca de 1 400 t" },
      { label: "Comprimento", valor: "84,6 m" },
      { label: "Boca", valor: "10,3 m" },
      { label: "Velocidade", valor: "24 nós" },
    ],
    navios: [{ numero: "F471", nome: "António Enes", ano: 1971 }],
  },
  {
    id: "baptista-de-andrade",
    nome: "Classe Baptista de Andrade",
    tipo: "Corveta",
    resumo:
      "Corvetas de patrulha oceânica e vigilância, utilizadas em missões de soberania, fiscalização e treino operacional.",
    especificacoes: [
      { label: "Deslocamento", valor: "cerca de 1 400 t" },
      { label: "Comprimento", valor: "84,6 m" },
      { label: "Velocidade", valor: "24 nós" },
    ],
    navios: [{ numero: "F487", nome: "João Roby", ano: 1975 }],
  },
  {
    id: "viana-do-castelo",
    nome: "Classe Viana do Castelo",
    tipo: "Navio-patrulha oceânico",
    resumo:
      "Navios-patrulha oceânicos de nova geração, com capacidade para embarcar fuzileiros, embarcações rápidas e sistemas não tripulados.",
    especificacoes: [
      { label: "Deslocamento", valor: "1 850 t" },
      { label: "Comprimento", valor: "83,1 m" },
      { label: "Velocidade", valor: "21 nós" },
      { label: "Autonomia", valor: "5 000 milhas náuticas" },
      { label: "Guarnição", valor: "42 (+ 30 fuzileiros)" },
    ],
    navios: [
      { numero: "P360", nome: "Viana do Castelo", ano: 2013 },
      { numero: "P361", nome: "Figueira da Foz", ano: 2014 },
      { numero: "P362", nome: "Sines", ano: 2017 },
      { numero: "P363", nome: "Setúbal", ano: 2019 },
    ],
  },
  {
    id: "tejo",
    nome: "Classe Tejo",
    tipo: "Navio-patrulha",
    resumo:
      "Navios-patrulha costeiros para vigilância, fiscalização e apoio a operações de autoridade marítima.",
    especificacoes: [
      { label: "Deslocamento", valor: "350 t" },
      { label: "Comprimento", valor: "41,7 m" },
      { label: "Velocidade", valor: "21 nós" },
      { label: "Guarnição", valor: "12" },
    ],
    navios: [
      { numero: "P590", nome: "Tejo", ano: 2016 },
      { numero: "P591", nome: "Douro", ano: 2017 },
      { numero: "P592", nome: "Mondego", ano: 2017 },
    ],
  },
  {
    id: "cacine",
    nome: "Classe Cacine",
    tipo: "Navio-patrulha",
    resumo:
      "Navio-patrulha costeiro de origem naval, empregue em missões de fiscalização e soberania nas áreas marítimas.",
    especificacoes: [
      { label: "Deslocamento", valor: "cerca de 400 t" },
      { label: "Comprimento", valor: "45,9 m" },
      { label: "Velocidade", valor: "16 nós" },
    ],
    navios: [{ numero: "P1146", nome: "Zaire" }],
  },
  {
    id: "argos",
    nome: "Classe Argos",
    tipo: "Lancha rápida",
    resumo:
      "Lanchas de fiscalização rápida, utilizadas em patrulhamento, interceção e apoio a operações ribeirinhas e costeiras.",
    especificacoes: [
      { label: "Função", valor: "Fiscalização e patrulhamento rápido" },
      { label: "Guarnição", valor: "Guarnição reduzida" },
    ],
    navios: [
      { numero: "P1150", nome: "Argos" },
      { numero: "P1151", nome: "Dragão" },
      { numero: "P1152", nome: "Escorpião" },
      { numero: "P1153", nome: "Cassiopeia" },
      { numero: "P1154", nome: "Hidra" },
      { numero: "P1155", nome: "Centauro" },
      { numero: "P1156", nome: "Orion" },
      { numero: "P1157", nome: "Pégaso" },
      { numero: "P1158", nome: "Sagitário" },
    ],
  },
  {
    id: "rio-minho",
    nome: "Classe Rio Minho",
    tipo: "Lancha rápida",
    resumo:
      "Lancha de fiscalização afeta a missões de patrulhamento e vigilância em águas interiores e costeiras.",
    especificacoes: [{ label: "Função", valor: "Fiscalização e patrulhamento" }],
    navios: [{ numero: "P370", nome: "Rio Minho" }],
  },
  {
    id: "d-carlos-i",
    nome: "Classe D. Carlos I",
    tipo: "Navio hidrográfico",
    resumo:
      "Navios hidrográficos equipados para levantamentos batimétricos e apoio à cartografia náutica e à investigação do meio marinho.",
    especificacoes: [
      { label: "Deslocamento", valor: "2 300 t" },
      { label: "Comprimento", valor: "74,4 m" },
      { label: "Velocidade", valor: "14 nós" },
      { label: "Guarnição", valor: "71" },
      { label: "Equipamento", valor: "Sondadores e sistemas hidrográficos" },
    ],
    navios: [
      { numero: "A522", nome: "D. Carlos I", ano: 1990 },
      { numero: "A523", nome: "Almirante Gago Coutinho", ano: 1985 },
    ],
  },
  {
    id: "sagres",
    nome: "Navio-escola Sagres",
    tipo: "Navio-escola",
    resumo:
      "Nau de três mastros utilizada na instrução e formação de oficiais, com presença regular em portos nacionais e estrangeiros.",
    especificacoes: [
      { label: "Deslocamento", valor: "1 869 t" },
      { label: "Comprimento", valor: "89 m" },
      { label: "Propulsão", valor: "Velas (22) e motor auxiliar" },
      { label: "Guarnição", valor: "Cerca de 150, incluindo cadetes" },
    ],
    navios: [{ numero: "A520", nome: "Sagres", ano: 1937 }],
  },
  {
    id: "berrio",
    nome: "Navio de apoio logístico Bérrio",
    tipo: "Navio de apoio logístico",
    resumo:
      "Navio de reabastecimento logístico, responsável pelo apoio de combustível, água e mantimentos às forças navais.",
    especificacoes: [
      { label: "Deslocamento", valor: "11 500 t" },
      { label: "Comprimento", valor: "140,6 m" },
      { label: "Velocidade", valor: "19 nós" },
      { label: "Origem", valor: "Ex-RFA Blue Rover (Reino Unido)" },
    ],
    navios: [{ numero: "A5210", nome: "Bérrio", ano: 1970 }],
  },
  {
    id: "creoula",
    nome: "Unidade Auxiliar da Marinha Creoula",
    tipo: "Unidade auxiliar",
    resumo:
      "Navio de treino de mar e instrução, utilizado em ações de formação e representação da Marinha.",
    especificacoes: [
      { label: "Comprimento", valor: "67,4 m" },
      { label: "Propulsão", valor: "Quatro mastros, velas" },
      { label: "Função", valor: "Instrução e treino de mar" },
    ],
    navios: [{ numero: "UAM 201", nome: "Creoula", ano: 1937 }],
  },
  {
    id: "isn-acores",
    nome: "ISN — Estações Salva-vidas dos Açores",
    tipo: "Embarcação salva-vidas",
    resumo:
      "Meios do Instituto de Socorros a Náufragos (ISN), sob a Autoridade Marítima Nacional (AMN), nas três Estações Salva-vidas Principais dos Açores. As embarcações são operadas pelas tripulações das capitanias e integram o dispositivo de busca e salvamento coordenado pelo MRCC Delgada.",
    especificacoes: [
      { label: "Dependência", valor: "AMN / Instituto de Socorros a Náufragos" },
      { label: "Estações principais", valor: "Ponta Delgada, Horta e Praia da Vitória/Angra" },
      { label: "Missão", valor: "Busca e salvamento marítimo e socorro costeiro" },
      { label: "Tipologias", valor: "Semi-rígidas oceânicas, embarcações ligeiras e motas de água" },
      { label: "Coordenação SAR", valor: "MRCC Delgada" },
    ],
    navios: [
      {
        numero: "ESV-PDL",
        nome: "Embarcação Salva-vidas de Ponta Delgada",
        base: "Ponta Delgada, São Miguel",
        organizacao: "ISN — Estação Salva-vidas Principal de Ponta Delgada",
        funcao: "Busca e salvamento oceânico e costeiro",
        nota:
          "A estação integra meios semi-rígidos de 3.ª geração, embarcações ligeiras e motas de água. Código de ficha da estação, não é número de amura oficial.",
      },
      {
        numero: "ESV-HOR",
        nome: "Embarcação Salva-vidas da Horta",
        base: "Horta, Faial",
        organizacao: "ISN — Estação Salva-vidas Principal da Horta",
        funcao: "Busca e salvamento oceânico e costeiro",
        nota:
          "A estação integra embarcações semi-rígidas e meios ligeiros para intervenção costeira. Código de ficha da estação, não é número de amura oficial.",
      },
      {
        numero: "ESV-PDV",
        nome: "Embarcação Salva-vidas da Praia da Vitória",
        base: "Praia da Vitória, Terceira",
        organizacao: "ISN — Estação Salva-vidas Principal da Praia da Vitória/Angra",
        funcao: "Busca e salvamento oceânico e costeiro",
        nota:
          "A estação integra embarcações semi-rígidas e meios ligeiros para intervenção costeira. Código de ficha da estação, não é número de amura oficial.",
      },
    ],
  },
];

export const marinhaMeiosAereos: MarinhaMeioAereo[] = [
  {
    id: "lynx-mk95a",
    modelo: "Westland Lynx Mk95A",
    quantidade: 5,
    esquadrilha: "Esquadrilha 711",
    base: "Base Aérea N.º 6, Montijo",
    funcao: "Busca e salvamento, vigilância marítima e transporte",
  },
];

export const marinhaZonas: MarinhaZona[] = [
  {
    sigla: "CN",
    nome: "Comando Naval",
    sede: "Alfeite, Lisboa",
    jurisdicao: "Comando operacional das forças navais e coordenação de busca e salvamento marítimo.",
    dependencia: "Chefe do Estado-Maior da Armada",
    unidades: ["MRCC Lisboa", "Centro de Operações Navais"],
  },
  {
    sigla: "CZMN",
    nome: "Comando da Zona Marítima do Norte",
    sede: "Leixões",
    jurisdicao: "Litoral norte de Portugal continental.",
    dependencia: "Comando Naval",
    unidades: ["Centro de Comunicações de Leixões", "Estação Radionaval Almirante Ramos Pereira"],
  },
  {
    sigla: "CZMC",
    nome: "Comando da Zona Marítima do Centro",
    sede: null,
    jurisdicao: "Litoral centro de Portugal continental.",
    dependencia: "Comando Naval",
    unidades: ["Centros de comunicações e postos de vigilância da costa na área de jurisdição"],
    nota: "Sede por confirmar na fonte oficial.",
  },
  {
    sigla: "CZMS",
    nome: "Comando da Zona Marítima do Sul",
    sede: "Faro",
    jurisdicao: "Litoral sul de Portugal continental e Algarve.",
    dependencia: "Comando Naval",
    unidades: ["Centro de Comunicações de Faro", "Estação Radionaval de Sagres"],
  },
  {
    sigla: "CZMA",
    nome: "Comando da Zona Marítima dos Açores",
    sede: "Ponta Delgada",
    jurisdicao: "Arquipélago dos Açores e subárea dos Açores da ZEE portuguesa.",
    dependencia: "Comando Naval",
    unidades: [
      "Centro de Comunicações de Ponta Delgada",
      "MRCC Delgada / Sub-centro de busca e salvamento",
      "Embarcação Nossa Senhora da Boa Viagem (afeta a Ponta Delgada)",
      "Estações Salva-Vidas do ISN e respetivas embarcações (ESV Ponta Delgada, ESV Horta, ESV Praia da Vitória / Angra)",
      "Unidades navais em missão / destacamento na área dos Açores",
    ],
    nota: "Coordenação SAR através do MRCC Delgada e apoio às fainas marítimas e salvamento na Região Autónoma dos Açores.",
  },
  {
    sigla: "CZMM",
    nome: "Comando da Zona Marítima da Madeira",
    sede: "Funchal",
    jurisdicao: "Arquipélago da Madeira.",
    dependencia: "Comando Naval",
    unidades: [
      "Centro de Comunicações do Funchal",
      "Sub-centro de busca e salvamento do Funchal",
    ],
  },
];

export const MARINHA_TOTAL_NAVIOS = marinhaClasses.reduce(
  (total, classe) => total + classe.navios.length,
  0,
);

export const MARINHA_FONTE = "https://www.marinha.pt/pt/os_meios";
export const MARINHA_LEGISLACAO =
  "Decreto Regulamentar n.º 39/94, de 1 de setembro (Comando Naval e comandos de zona marítima)";

export function marinhaContagemPorTipo(): Array<{ tipo: MarinhaTipo; total: number }> {
  return MARINHA_TIPOS.map(tipo => ({
    tipo,
    total: marinhaClasses
      .filter(classe => classe.tipo === tipo)
      .reduce((total, classe) => total + classe.navios.length, 0),
  })).filter(item => item.total > 0);
}

export function marinhaPesquisar(termo: string): MarinhaClasse[] {
  const query = termo.trim().toLowerCase();
  if (!query) return marinhaClasses;

  return marinhaClasses
    .map(classe => {
      const classeCorresponde =
        classe.nome.toLowerCase().includes(query) ||
        classe.tipo.toLowerCase().includes(query) ||
        classe.resumo.toLowerCase().includes(query);

      const navios = classe.navios.filter(
        navio =>
          navio.nome.toLowerCase().includes(query) ||
          navio.numero.toLowerCase().includes(query),
      );

      if (classeCorresponde) return classe;
      if (navios.length > 0) return { ...classe, navios };
      return null;
    })
    .filter((classe): classe is MarinhaClasse => classe !== null);
}

export function marinhaNavioSlug(navio: MarinhaNavio): string {
  return navio.numero
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function marinhaNavioPorSlug(
  slug: string,
): { classe: MarinhaClasse; navio: MarinhaNavio } | null {
  const normalized = slug.trim().toLowerCase();
  for (const classe of marinhaClasses) {
    const navio = classe.navios.find(item => marinhaNavioSlug(item) === normalized);
    if (navio) return { classe, navio };
  }
  return null;
}
