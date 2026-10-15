import { normalizeNavioTipoCategoria, parseRecreioZonaFromMatricula } from "@/lib/navio-legal-types";
import { getRecreioMandatoryProfile } from "@/config/recreioMandatoryEquipment";

export type NavioLegalProfileKey =
  | "pescaLocal"
  | "pescaCosteira"
  | "pescaLargo"
  | "maritimoTuristica"
  | "trafegoLocal"
  | "auxiliarLocal"
  | "nauticaRecreio"
  | "outro";

export type NavioLegalRequirement = {
  category: string;
  title: string;
  detail: string;
  emphasis?: "required" | "review" | "recommended";
};

export type NavioLegalSource = {
  title: string;
  url: string;
  note: string;
};

export type NavioLegalProfile = {
  key: NavioLegalProfileKey;
  label: string;
  summary: string;
  legalNote: string;
  requirements: NavioLegalRequirement[];
  sources: NavioLegalSource[];
};

function detectProfile(tipoPesca?: string | null, tipoNavio?: string | null, matricula?: string | null): NavioLegalProfileKey {
  const categoria = normalizeNavioTipoCategoria(tipoPesca, matricula, tipoNavio);

  switch (categoria) {
    case "Pesca Local":
      return "pescaLocal";
    case "Pesca Costeira":
      return "pescaCosteira";
    case "Pesca do Largo":
      return "pescaLargo";
    case "Marítimo Turística":
      return "maritimoTuristica";
    case "Tráfego Local":
      return "trafegoLocal";
    case "Auxiliar Local":
      return "auxiliarLocal";
    case "Náutica de Recreio":
      return "nauticaRecreio";
    default:
      return "outro";
  }
}

const OFFICIAL_SOURCES: NavioLegalSource[] = [
  {
    title: "Diário da República",
    url: "https://diariodarepublica.pt/dr/home",
    note: "Fonte oficial para confirmar o diploma aplicável, alterações e redação em vigor.",
  },
  {
    title: "DGRM — Licenciamento da Pesca",
    url: "https://www.dgrm.pt/licenciamento-da-pesca",
    note: "Referência operacional para embarcações de pesca profissional e respetivos processos.",
  },
  {
    title: "DGRM — Náutica de Recreio",
    url: "https://www.dgrm.pt/nautica-recreio",
    note: "Ponto de partida oficial para regimes de embarcações de recreio e operações turísticas que caiam nesse enquadramento.",
  },
  {
    title: "Autoridade Marítima Nacional",
    url: "https://www.amn.pt/",
    note: "Autoridade de fiscalização e segurança marítima; útil para confirmar exigências operacionais e circulares aplicáveis.",
  },
];

const PROFILE_DATA: Record<NavioLegalProfileKey, Omit<NavioLegalProfile, "key">> = {
  pescaLocal: {
    label: "Pesca Local",
    summary: "Operação de pesca local com foco em meios individuais/coletivos de salvação, comunicações, incêndio e sinalização de socorro adequados à área licenciada.",
    legalNote: "A quantidade e o tipo exatos de pirotecnia e restantes meios devem ser conferidos no certificado/licença da embarcação e no diploma em vigor aplicável à pesca local.",
    requirements: [
      { category: "Salvação", title: "Coletes e meios individuais", detail: "Verificar coletes homologados para tripulantes, boias de salvação e luzes/linhas quando exigidas.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia a bordo", detail: "Registar a pirotecnia existente a bordo com tipo, quantidade e validade; confirmar a dotação mínima licenciada para a área de operação.", emphasis: "required" },
      { category: "Incêndio", title: "Extintores e combate a incêndio", detail: "Conferir extintores válidos, localização e inspeção periódica conforme o equipamento instalado.", emphasis: "required" },
      { category: "Comunicações", title: "Meios rádio e emergência", detail: "Confirmar VHF e restantes meios exigidos para a classe/área da embarcação, incluindo alimentação e antenas operacionais.", emphasis: "review" },
      { category: "Documentação", title: "Certificados e lotação", detail: "Cruzar sempre a matriz desta ficha com o certificado de navegabilidade/segurança, licença de pesca e lotação autorizada.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  pescaCosteira: {
    label: "Pesca Costeira",
    summary: "Perfil mais exigente em termos de meios coletivos de salvação, comunicações e redundância, dependente da área de navegação, arqueação e lotação.",
    legalNote: "Para pesca costeira, a obrigatoriedade pode subir consoante arqueação, distância à costa e área de operação; a confirmação documental é indispensável.",
    requirements: [
      { category: "Salvação", title: "Meios coletivos de salvação", detail: "Conferir jangada(s), libertador hidrostático, radar reflector e restantes meios coletivos exigidos para a operação costeira licenciada.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia e luzes de socorro", detail: "Registar fachos, foguetes paraquedas, sinais fumígenos e outros artigos pirotécnicos com validade individualizada.", emphasis: "required" },
      { category: "Comunicações", title: "Equipamento GMDSS / rádio", detail: "Rever VHF/DSC, EPIRB e outros meios que o regime aplicável imponha à embarcação e área de navegação.", emphasis: "review" },
      { category: "Incêndio", title: "Plano e meios de incêndio", detail: "Validar extintores, deteção/isolamento e meios portáteis de combate a incêndio.", emphasis: "required" },
      { category: "Documentação", title: "Certificados de bordo", detail: "Conferir certificados, inspeções periódicas e observações da autoridade/classificação aplicável.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  pescaLargo: {
    label: "Pesca do Largo",
    summary: "Perfil de operação mais exigente, com maior dependência de meios coletivos de salvação, comunicações e equipamento homologado para permanência prolongada fora da costa.",
    legalNote: "Na pesca do largo, a confirmação tem de ser sempre fechada com o certificado de segurança, a licença de pesca e a dotação material aprovada para a área de navegação efetiva.",
    requirements: [
      { category: "Salvação", title: "Jangadas e abandono", detail: "Confirmar jangadas homologadas, capacidade total suficiente, HRU/libertador hidrostático quando exigido e arrumação compatível com abandono rápido.", emphasis: "required" },
      { category: "Individual", title: "Coletes homologados e acessórios", detail: "Validar coletes aprovados para toda a tripulação, com luzes, apitos e acessórios exigidos pela operação/licença.", emphasis: "required" },
      { category: "Comunicações", title: "Socorro e localização", detail: "Confirmar VHF/DSC, EPIRB, SART/AIS-SART e restantes meios exigidos pelo enquadramento concreto do navio.", emphasis: "required" },
      { category: "Sinalização", title: "Dotação reforçada de pirotecnia", detail: "Controlar individualmente sinais fumígenos, fachos, foguetes e demais artigos de socorro com validade ativa.", emphasis: "required" },
      { category: "Documentação", title: "Licenças e certificados", detail: "Não dispensar a validação final com os certificados e observações emitidos para a embarcação específica.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  maritimoTuristica: {
    label: "Marítimo-Turística",
    summary: "Enquadramento centrado na segurança de passageiros, lotação aprovada, meios de abandono/salvação e material de emergência compatível com a atividade autorizada.",
    legalNote: "Na atividade marítimo-turística, a lotação de passageiros, a zona de navegação e o licenciamento concreto podem alterar as exigências materiais mínimas.",
    requirements: [
      { category: "Passageiros", title: "Coletes por lotação e tamanhos", detail: "Garantir coletes homologados para tripulantes/passageiros, incluindo infantis ou especiais quando a operação o exigir.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia e meios de pedido de socorro", detail: "Registar pirotecnia válida a bordo e confirmar se a lotação/área exige dotação reforçada ou meios alternativos complementares.", emphasis: "required" },
      { category: "Salvação", title: "Boias, jangada e recuperação homem ao mar", detail: "Validar boias de salvação, meios de recuperação, jangada e acessibilidade do material para os passageiros.", emphasis: "required" },
      { category: "Incêndio", title: "Segurança contra incêndio", detail: "Manter extintores válidos e instruções operacionais visíveis para tripulação.", emphasis: "required" },
      { category: "Operação", title: "Instruções e documentação", detail: "Cruzar a ficha com o licenciamento da atividade marítimo-turística, lotação aprovada e condicionantes do operador.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  trafegoLocal: {
    label: "Tráfego Local",
    summary: "Operação local de transporte/apoio com exigências dependentes da atividade concreta, lotação e zona de navegação aprovada.",
    legalNote: "O tráfego local exige conferência documental caso a caso; esta ficha serve como guião operativo, não como substituto do certificado da embarcação.",
    requirements: [
      { category: "Salvação", title: "Lotação e abandono", detail: "Confirmar meios individuais e coletivos em função da lotação, incluindo acessibilidade e arrumação.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia de emergência", detail: "Registar toda a pirotecnia com validade e rever a dotação mínima associada à operação autorizada.", emphasis: "required" },
      { category: "Incêndio", title: "Extintores e resposta inicial", detail: "Conferir inspeções e posicionamento dos meios portáteis.", emphasis: "required" },
      { category: "Comunicações", title: "Rádio e alarme", detail: "Verificar meios de chamada de socorro compatíveis com a área de operação.", emphasis: "review" },
      { category: "Documentação", title: "Licença e certificados", detail: "Comparar sempre com o certificado/licença concreta do navio.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  auxiliarLocal: {
    label: "Auxiliar Local",
    summary: "Embarcação de apoio local, normalmente com missões restritas, mas ainda sujeita a confirmação de lotação, equipamento de salvação e meios de comunicação compatíveis com a operação.",
    legalNote: "Nas embarcações auxiliares locais, a operação concreta e a lotação autorizada são decisivas; use esta matriz como orientação e valide sempre com o certificado/licença.",
    requirements: [
      { category: "Salvação", title: "Meios proporcionais à lotação", detail: "Conferir coletes, boias e restantes meios individuais/coletivos adequados ao serviço de apoio local.", emphasis: "required" },
      { category: "Operação", title: "Meios de apoio e reboque", detail: "Confirmar se existem exigências adicionais ligadas à função concreta da embarcação (apoio portuário, rebocagem, assistência, etc.).", emphasis: "review" },
      { category: "Sinalização", title: "Pirotecnia e iluminação de emergência", detail: "Controlar dotação mínima e validade do material de emergência que acompanha a embarcação.", emphasis: "required" },
      { category: "Documentação", title: "Enquadramento autorizado", detail: "Fechar sempre com o certificado e a licença operacional específica.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  nauticaRecreio: {
    label: "Náutica de Recreio",
    summary: "Perfil de embarcação de recreio em que a aprovação do material depende sobretudo da categoria de navegação, lotação e especificações do registo/licença.",
    legalNote: "Na náutica de recreio, a categoria/área de navegação e a lotação aprovada condicionam a exigência de jangada, pirotecnia e outros meios; confirme sempre no documento em vigor.",
    requirements: [
      { category: "Salvação", title: "Coletes e meios de abandono", detail: "Verificar coletes adequados à lotação e, quando aplicável, jangada compatível com a categoria de navegação da embarcação.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia de recreio", detail: "Registar validade e tipo dos sinais de socorro exigidos para a categoria em causa.", emphasis: "required" },
      { category: "Comunicações", title: "Meios de pedido de socorro", detail: "Confirmar VHF e restantes meios conforme a classe/categoria e área de navegação autorizada.", emphasis: "review" },
      { category: "Documentação", title: "Livrete e categoria", detail: "Cruzar com o livrete, categoria de navegação e eventuais condicionantes do operador.", emphasis: "required" },
    ],
    sources: OFFICIAL_SOURCES,
  },
  outro: {
    label: "Tipologia por confirmar",
    summary: "A aplicação não conseguiu enquadrar automaticamente o navio; use o certificado/licença como referência principal.",
    legalNote: "Defina corretamente o tipo de navio/operação para a matriz legal ficar mais precisa.",
    requirements: [
      { category: "Documentação", title: "Classificar a operação", detail: "Preencha o tipo de pesca/navio e confirme a licença/certificado aplicável antes de usar esta matriz.", emphasis: "required" },
      { category: "Sinalização", title: "Pirotecnia a bordo", detail: "Mesmo sem perfil fechado, registe todos os pirotécnicos e respetivas validades para controlo operacional.", emphasis: "required" },
      { category: "Segurança", title: "Meios mínimos", detail: "Rever salvação, incêndio e comunicações segundo o documento oficial da embarcação.", emphasis: "review" },
    ],
    sources: OFFICIAL_SOURCES,
  },
};

export function getNavioLegalProfile(
  tipoPesca?: string | null,
  tipoNavio?: string | null,
  matricula?: string | null,
  zonaNavegacao?: string | null,
): NavioLegalProfile {
  const key = detectProfile(tipoPesca, tipoNavio, matricula);
  const base: NavioLegalProfile = {
    key,
    ...PROFILE_DATA[key],
  };

  if (key !== "nauticaRecreio") return base;

  // Zona de navegação: usa o campo guardado ou, em falta, infere-a da matrícula
  // (formato `<nº>-<tipo>PT`, em que o algarismo é a zona de navegação 1..5).
  const zonaProfile = getRecreioMandatoryProfile(zonaNavegacao)
    || getRecreioMandatoryProfile(parseRecreioZonaFromMatricula(matricula));

  if (!zonaProfile) return base;

  return {
    ...base,
    label: `${base.label} · ${zonaProfile.shortLabel}`,
    summary: `${base.summary} Categoria de navegação identificada: ${zonaProfile.shortLabel}.`,
    legalNote: `${base.legalNote} A categoria/zona de navegação determina a dotação concreta — ver o separador "Meios obrigatórios".`,
    requirements: [
      {
        category: "Categoria de navegação",
        title: `Categoria identificada — ${zonaProfile.shortLabel}`,
        detail: "Confirmar a categoria/zona de navegação no livrete e no registo da embarcação: é ela que fixa a dotação de salvação, pirotecnia e comunicações.",
        emphasis: "review" as const,
      },
      ...base.requirements,
    ],
  };
}
