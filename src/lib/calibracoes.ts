export type CalibracaoRegisto = {
  id: number;
  nome: string;
  referencia: string;
  tipo: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  certificadoNum: string | null;
  certificadoUrl: string | null;
  ativo: boolean;
  observacoes: string | null;
  updatedAt: string;
};

export type CalibracaoFormState = {
  nome: string;
  referencia: string;
  tipo: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  certificadoNum: string;
  certificadoUrl: string;
  ativo: boolean;
  observacoes: string;
};

export const CALIBRACAO_TIPOS = [
  "barometro",
  "manometro",
  "balanca",
  "chave_dinamometrica",
  "calibracao",
] as const;

export const COMPRESSOR_TIPOS = [
  "compressor_filtro",
  "compressor_oleo",
  "compressor_ar",
  "compressor_valvula",
] as const;

export const COMPRESSOR_PREFIXO = "compressor";

export function isCalibracaoTipo(tipo: string) {
  return (CALIBRACAO_TIPOS as readonly string[]).includes(tipo);
}

export function isCompressorTipo(tipo: string) {
  return tipo.startsWith(COMPRESSOR_PREFIXO);
}

export function diasAte(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export type EstadoCalibracao = {
  label: string;
  color: string;
  type: "expired" | "soon" | "ok";
};

export function getEstadoCalibracao(dateStr: string): EstadoCalibracao {
  const dias = diasAte(dateStr);
  if (dias < 0) {
    const vencidos = -dias;
    return {
      label: vencidos > 30 ? `Vencido (${vencidos}d)` : `Vencido (${vencidos} dia${vencidos === 1 ? "" : "s"})`,
      color: "bg-red-100 text-red-800 border-red-200",
      type: "expired",
    };
  }
  if (dias <= 30) {
    return {
      label: dias === 0 ? "Vence Hoje" : `Vence em ${dias}d`,
      color: "bg-orange-100 text-orange-800 border-orange-200",
      type: "soon",
    };
  }
  return { label: "Válido", color: "bg-green-100 text-green-800 border-green-200", type: "ok" };
}

export function contarPorEstado(items: CalibracaoRegisto[]) {
  const validos = items.filter((i) => getEstadoCalibracao(i.dataProxCalibracao).type === "ok");
  const aVencer = items.filter((i) => {
    const dias = diasAte(i.dataProxCalibracao);
    return dias >= 0 && dias <= 30;
  });
  const vencidos = items.filter((i) => diasAte(i.dataProxCalibracao) < 0);
  return { validos, aVencer, vencidos };
}

export function createInitialCalibracaoForm(tipo = "barometro"): CalibracaoFormState {
  return {
    nome: "",
    referencia: "",
    tipo,
    dataCalibracao: "",
    dataProxCalibracao: "",
    certificadoNum: "",
    certificadoUrl: "",
    ativo: true,
    observacoes: "",
  };
}

export function formFromRegisto(registo: CalibracaoRegisto): CalibracaoFormState {
  return {
    nome: registo.nome,
    referencia: registo.referencia,
    tipo: registo.tipo,
    dataCalibracao: registo.dataCalibracao ? new Date(registo.dataCalibracao).toISOString().slice(0, 10) : "",
    dataProxCalibracao: registo.dataProxCalibracao
      ? new Date(registo.dataProxCalibracao).toISOString().slice(0, 10)
      : "",
    certificadoNum: registo.certificadoNum || "",
    certificadoUrl: registo.certificadoUrl || "",
    ativo: registo.ativo,
    observacoes: registo.observacoes || "",
  };
}

export function filtrarRegistos(items: CalibracaoRegisto[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.nome.toLowerCase().includes(q) ||
      i.referencia.toLowerCase().includes(q) ||
      i.tipo.includes(q),
  );
}

export function rotuloTipo(tipo: string) {
  return tipo.replace(`${COMPRESSOR_PREFIXO}_`, "");
}

export type TipoOpcao = { grupo: string; valor: string; label: string };

export const CALIBRACAO_TIPO_OPCOES: TipoOpcao[] = [
  { grupo: "Instrumentos", valor: "barometro", label: "Barómetro (Pressão Atmosférica)" },
  { grupo: "Instrumentos", valor: "manometro", label: "Manómetro (Pressão)" },
  { grupo: "Instrumentos", valor: "balanca", label: "Balança de Precisão" },
  { grupo: "Instrumentos", valor: "chave_dinamometrica", label: "Chave Dinamométrica (Torque)" },
  { grupo: "Outros", valor: "calibracao", label: "Outro Equipamento Sujeito a Calibração" },
];

export const COMPRESSOR_TIPO_OPCOES: TipoOpcao[] = [
  { grupo: "Compressor Michelin 300L", valor: "compressor_oleo", label: "Substituição de Óleo" },
  { grupo: "Compressor Michelin 300L", valor: "compressor_filtro", label: "Substituição do Filtro de Ar" },
  { grupo: "Compressor Michelin 300L", valor: "compressor_ar", label: "Purga de Condensos do Depósito" },
  {
    grupo: "Compressor Michelin 300L",
    valor: "compressor_valvula",
    label: "Válvula de Segurança e Pressostato",
  },
];

export function agruparTipoOpcoes(opcoes: TipoOpcao[]) {
  const grupos = new Map<string, TipoOpcao[]>();
  for (const opcao of opcoes) {
    const lista = grupos.get(opcao.grupo) ?? [];
    lista.push(opcao);
    grupos.set(opcao.grupo, lista);
  }
  return Array.from(grupos, ([label, items]) => ({ label, items }));
}
