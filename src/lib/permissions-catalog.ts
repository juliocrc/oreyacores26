export const OT_CREATION_ROUTE = "/criar-ot";
export const LEGACY_OT_CREATION_ROUTE = "/obras";

export type PermissionModuleKey =
  | "dashboard"

  | "agenda"
  | "estacao-servico"
  | "oficina"
  | "calibracoes"
  | "logistica"
  | "alertas"
  | "inspecoes"

  | "relatorios"
  | "jangadas"
  | "packs"
  | "navios"
  | "epirbs"
  | "clientes"
  | "tecnicos"
  | "equipamentos"
  | "fatos-imersao"
  | "stock"
  | "cilindros"
  | "obras"
  | "departamento-tecnico"
  | "legislacao"
  | "dgrm"
  | "auditorias"
  | "fotos"
  | "contactos-internos"
  | "utilizadores"
  | "registar";

export const PERMISSION_MODULE_OPTIONS: Array<{ key: PermissionModuleKey; label: string; href: string }> = [
  { key: "dashboard", label: "Dashboard", href: "/" },

  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "estacao-servico", label: "Estação de Serviço", href: "/estacao-servico" },
  { key: "oficina", label: "Oficina (Compressor)", href: "/oficina" },
  { key: "calibracoes", label: "Calibrações", href: "/calibracoes" },
  { key: "logistica", label: "Logística", href: "/logistica" },
  { key: "alertas", label: "Alertas", href: "/alertas" },

  { key: "relatorios", label: "Relatórios", href: "/relatorios" },
  { key: "jangadas", label: "Jangadas", href: "/" },
  { key: "packs", label: "Packs personalizados", href: "/packs" },
  { key: "navios", label: "Navios", href: "/navios" },
  { key: "epirbs", label: "EPIRBs", href: "/epirbs" },
  { key: "clientes", label: "Clientes", href: "/clientes" },
  { key: "tecnicos", label: "Técnicos", href: "/tecnicos" },
  { key: "equipamentos", label: "Coletes", href: "/equipamentos" },
  { key: "fatos-imersao", label: "Fatos de Imersão", href: "/fatos-imersao" },
  { key: "stock", label: "Stock", href: "/stock" },
  { key: "cilindros", label: "Cilindros", href: "/cilindros" },
  { key: "departamento-tecnico", label: "Departamento Técnico", href: "/departamento-tecnico" },
  { key: "legislacao", label: "Legislação", href: "/legislacao" },
  { key: "dgrm", label: "DGRM", href: "/dgrm" },
  { key: "auditorias", label: "Auditorias", href: "/auditorias" },
  { key: "fotos", label: "Certificados Externos (PDF)", href: "/fotos" },
  { key: "contactos-internos", label: "Contactos Internos", href: "/contactos-internos" },
  { key: "utilizadores", label: "Utilizadores", href: "/utilizadores" },
  { key: "registar", label: "Registar", href: "/registar" },
];

export const PAGE_PREFIX_OPTIONS: Array<{ key: string; label: string; prefix: string }> = [
  { key: "root", label: "Jangadas (raiz)", prefix: "/" },
  { key: "dashboard", label: "Dashboard", prefix: "/" },

  { key: "agenda", label: "Agenda", prefix: "/agenda" },
  { key: "estacao-servico", label: "Estação de Serviço", prefix: "/estacao-servico" },
  { key: "oficina", label: "Oficina (Compressor)", prefix: "/oficina" },
  { key: "calibracoes", label: "Calibrações", prefix: "/calibracoes" },
  { key: "logistica", label: "Logística", prefix: "/logistica" },
  { key: "alertas", label: "Alertas", prefix: "/alertas" },

  { key: "relatorios", label: "Relatórios", prefix: "/relatorios" },
  { key: "jangadas", label: "Jangadas (detalhe/lista)", prefix: "/jangadas" },
  { key: "packs", label: "Packs personalizados", prefix: "/packs" },
  { key: "navios", label: "Navios", prefix: "/navios" },
  { key: "epirbs", label: "EPIRBs", prefix: "/epirbs" },
  { key: "clientes", label: "Clientes", prefix: "/clientes" },
  { key: "tecnicos", label: "Técnicos", prefix: "/tecnicos" },
  { key: "equipamentos", label: "Coletes", prefix: "/equipamentos" },
  { key: "fatos-imersao", label: "Fatos de Imersão", prefix: "/fatos-imersao" },
  { key: "stock", label: "Stock", prefix: "/stock" },
  { key: "cilindros", label: "Cilindros", prefix: "/cilindros" },
  { key: "departamento-tecnico", label: "Departamento Técnico", prefix: "/departamento-tecnico" },
  { key: "legislacao", label: "Legislação", prefix: "/legislacao" },
  { key: "dgrm", label: "DGRM", prefix: "/dgrm" },
  { key: "auditorias", label: "Auditorias", prefix: "/auditorias" },
  { key: "fotos", label: "Certificados Externos", prefix: "/fotos" },
  { key: "contactos-internos", label: "Contactos Internos", prefix: "/contactos-internos" },
  { key: "utilizadores", label: "Utilizadores", prefix: "/utilizadores" },
  { key: "registar", label: "Registar", prefix: "/registar" },
];

export const PAGE_EDITABLE_FIELD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "serial", label: "Serial" },
  { key: "model", label: "Modelo" },
  { key: "brand", label: "Marca" },
  { key: "capacity", label: "Capacidade" },
  { key: "owner", label: "Proprietário" },
  { key: "dataFabrico", label: "Data fabrico" },
  { key: "packType", label: "Tipo de pack" },
  { key: "launchType", label: "Lançamento" },
  { key: "fabricType", label: "Tipo de tela" },
  { key: "dataInspecao", label: "Data inspeção" },
  { key: "dataProxInspecao", label: "Data próxima inspeção" },
  { key: "ultimoCertificadoNumero", label: "Último certificado" },
  { key: "shipId", label: "Navio" },
  { key: "shipNameManual", label: "Nome navio manual" },
  { key: "numeroObra", label: "Grupo OT" },
  { key: "cylinderSerial", label: "Cilindro serial" },
  { key: "cylinderTara", label: "Cilindro tara" },
  { key: "cylinderPesoBruto", label: "Cilindro peso bruto" },
  { key: "cylinderDataTeste", label: "Data teste cilindro" },
  { key: "cylinderDataProxTeste", label: "Data próximo teste cilindro" },
  { key: "cylinderSistema", label: "Sistema cilindro" },
  { key: "valvulasAlivio", label: "Válvulas alívio" },
  { key: "valvulasAtestar", label: "Válvulas atestar" },
  { key: "hruAplicavel", label: "HRU aplicável" },
  { key: "hruReferencia", label: "HRU referência" },
  { key: "hruValidade", label: "HRU validade" },
  { key: "radarReflector", label: "Radar reflector" },
  { key: "radarReflectorValidade", label: "Radar reflector validade" },
  { key: "tuboIdentificacao", label: "Tubo identificação" },
  { key: "artigos", label: "Artigos" },
  { key: "inspectionChecklistValues", label: "Checklist inspeção" },
  { key: "serviceBulletinsApplied", label: "Boletins aplicados" },
];

export const EDITABLE_FIELD_GROUPS = {
  "jangadas-detail": PAGE_EDITABLE_FIELD_OPTIONS,
} as const;
