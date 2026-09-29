export type OsTemplate = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  artigos: Array<{
    descricao: string;
    referencia?: string;
    quantidade: number;
    precoUnitario: number;
  }>;
  servicos: Array<{
    descricao: string;
    horas: number;
    precoHora: number;
  }>;
};

export const OS_TEMPLATES: OsTemplate[] = [
  {
    id: "inspecao-anual",
    nome: "Inspeção Anual",
    descricao: "Inspeção periódica anual completa com teste hidráulico",
    tipo: "inspecao",
    artigos: [
      { descricao: "Kit de reparação (vedantes, anilhas)", referencia: "KIT-REP", quantidade: 1, precoUnitario: 35 },
      { descricao: "Selo de segurança", referencia: "SELO-001", quantidade: 1, precoUnitario: 5 },
      { descricao: "Fita de colagem contentor", referencia: "FITA-CONT", quantidade: 1, precoUnitario: 12 },
      { descricao: "Etiqueta de identificação", referencia: "ETIQ-ID", quantidade: 1, precoUnitario: 3 },
    ],
    servicos: [
      { descricao: "Mão de obra técnica especializada", horas: 4, precoHora: 45 },
    ],
  },
  {
    id: "reparacao-hru",
    nome: "Reparação HRU",
    descricao: "Substituição do libertador hidrostático (HRU)",
    tipo: "reparacao",
    artigos: [
      { descricao: "HRU completo (Hydrostatic Release Unit)", referencia: "HRU-COMP", quantidade: 1, precoUnitario: 85 },
      { descricao: "Anilha de vedação HRU", referencia: "ANILHA-HRU", quantidade: 1, precoUnitario: 4 },
      { descricao: "Selo de segurança HRU", referencia: "SELO-HRU", quantidade: 1, precoUnitario: 5 },
    ],
    servicos: [
      { descricao: "Mão de obra técnica", horas: 1.5, precoHora: 45 },
    ],
  },
  {
    id: "substituicao-cilindro",
    nome: "Substituição de Cilindro",
    descricao: "Substituição do cilindro de gás (CO2/N2)",
    tipo: "manutencao",
    artigos: [
      { descricao: "Cilindro CO2 2kg", referencia: "CIL-CO2-2KG", quantidade: 1, precoUnitario: 120 },
      { descricao: "Anilha de vedação cilindro", referencia: "ANILHA-CIL", quantidade: 1, precoUnitario: 3 },
      { descricao: "Selo de segurança cilindro", referencia: "SELO-CIL", quantidade: 1, precoUnitario: 4 },
      { descricao: "Etiqueta de cilindro", referencia: "ETIQ-CIL", quantidade: 1, precoUnitario: 2 },
    ],
    servicos: [
      { descricao: "Mão de obra técnica especializada", horas: 2, precoHora: 45 },
    ],
  },
];

export function getOsTemplate(id: string): OsTemplate | undefined {
  return OS_TEMPLATES.find(t => t.id === id);
}