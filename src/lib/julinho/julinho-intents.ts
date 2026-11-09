/**
 * InterpretaÃ§Ã£o local (sem rede) dos pedidos feitos aa Julia.
 *
 * O mesmo mÃ³dulo Ã© usado no servidor (para responder) e no cliente (para
 * navegar mesmo quando a API estÃ¡ indisponÃ­vel, situaÃ§Ã£o comum em trabalho
 * offline). NÃ£o deve importar nada de `server-only`.
 */

export type JulinhoEntity = "jangada" | "navio" | "cliente" | "stock";

export type JulinhoQueryTopic =
  | "summary"
  | "inspections"
  | "inspections-week"
  | "inspections-period"
  | "station-waiting"
  | "certificate"
  | "stock-low"
  | "work-orders"
  | "invoices"
  | "count"
  | "jangada"
  | "navio"
  | "cliente"
  | "stock-item";

export type JulinhoIntent =
  | { kind: "greeting" }
  | { kind: "thanks" }
  | { kind: "identity" }
  | { kind: "help" }
  | { kind: "navigate"; href: string; label: string }
  | { kind: "query"; topic: JulinhoQueryTopic; term?: string }
  | { kind: "unknown" };

export type JulinhoRoute = {
  href: string;
  label: string;
  aliases: readonly string[];
};

/**
 * Atalhos de navegaÃ§Ã£o por voz. A ordem nÃ£o Ã© relevante: o alias mais longo
 * ganha, para que "ordens de servico" nÃ£o seja interpretado como "os".
 */
export const JULINHO_ROUTES: readonly JulinhoRoute[] = [
  { href: "/", label: "Painel", aliases: ["inicio", "painel", "pagina inicial", "home", "dashboard", "principal"] },
  { href: "/agenda", label: "Agenda", aliases: ["agenda", "calendario", "marcacoes", "compromissos"] },
  { href: "/jangadas", label: "Jangadas", aliases: ["jangadas", "jangada", "boias", "boia", "balsas", "salva vidas"] },
  { href: "/estado-jangada", label: "Estado Jangada", aliases: ["estado jangada", "estado das jangadas"] },
  { href: "/inspecoes", label: "InspeÃ§Ãµes", aliases: ["inspecoes", "inspecao", "vistorias", "vistoria"] },
  { href: "/navios", label: "Navios", aliases: ["navios", "navio", "embarcacoes", "embarcacao", "barcos", "barco"] },
  { href: "/clientes", label: "Clientes", aliases: ["clientes", "cliente"] },
  { href: "/stock", label: "Stock", aliases: ["stock", "armazem", "inventario"] },
  { href: "/stock/scanner", label: "Leitor de Stock", aliases: ["leitor de stock", "scanner de stock", "ler codigo de barras"] },
  { href: "/stock/reposicoes", label: "ReposiÃ§Ãµes", aliases: ["reposicoes", "reposicao de stock"] },
  { href: "/ordens-servico", label: "Ordens de ServiÃ§o", aliases: ["ordens de servico", "ordem de servico", "ordens", "ots", "ot"] },
  { href: "/criar-ot", label: "Criar OT", aliases: ["criar ot", "nova ot", "nova ordem de servico", "criar ordem de servico"] },
  { href: "/orcamentos", label: "OrÃ§amentos", aliases: ["orcamentos", "orcamento", "propostas", "proposta"] },
  { href: "/faturacao", label: "FaturaÃ§Ã£o", aliases: ["faturacao", "faturas", "fatura", "facturas"] },
  { href: "/cobrancas", label: "CobranÃ§as", aliases: ["cobrancas", "cobranca"] },
  { href: "/contas-receber", label: "Contas a Receber", aliases: ["contas a receber", "contas correntes"] },
  { href: "/relatorios", label: "RelatÃ³rios", aliases: ["relatorios", "relatorio"] },
  { href: "/relatorio-validades", label: "RelatÃ³rio de Validades", aliases: ["relatorio de validades", "validades"] },
  { href: "/estatisticas", label: "EstatÃ­sticas", aliases: ["estatisticas", "estatistica", "indicadores", "kpis"] },
  { href: "/rentabilidade", label: "Rentabilidade", aliases: ["rentabilidade", "lucro", "margens"] },
  { href: "/alertas", label: "Alertas", aliases: ["alertas", "alerta", "avisos"] },
  { href: "/notificacoes", label: "NotificaÃ§Ãµes", aliases: ["notificacoes", "notificacao"] },
  { href: "/comunicacoes", label: "ComunicaÃ§Ãµes", aliases: ["comunicacoes", "comunicacao", "mensagens", "voip", "chamadas"] },
  { href: "/tecnicos", label: "TÃ©cnicos", aliases: ["tecnicos", "tecnico", "equipa tecnica"] },
  { href: "/calibracoes", label: "CalibraÃ§Ãµes", aliases: ["calibracoes", "calibracao"] },
  { href: "/oficina", label: "Oficina", aliases: ["oficina", "workshop"] },
  { href: "/logistica", label: "LogÃ­stica", aliases: ["logistica", "expedicoes"] },
  { href: "/equipamentos", label: "Coletes", aliases: ["coletes", "colete", "equipamentos"] },
  { href: "/cilindros", label: "Cilindros", aliases: ["cilindros", "cilindro", "garrafas"] },
  { href: "/epirbs", label: "EPIRBs", aliases: ["epirbs", "epirb", "balizas"] },
  { href: "/fatos-imersao", label: "Fatos de ImersÃ£o", aliases: ["fatos de imersao", "fatos", "fato de imersao"] },
  { href: "/packs", label: "Packs", aliases: ["packs", "pack"] },
  { href: "/marinha", label: "Marinha Portuguesa", aliases: ["marinha", "marinha portuguesa"] },
  { href: "/globalfishazores", label: "GlobalFishAzores", aliases: ["globalfish", "global fish", "globalfishazores"] },
  { href: "/dgrm", label: "DGRM", aliases: ["dgrm", "vistorias dgrm"] },
  { href: "/survitec-auditoria", label: "Auditoria Survitec", aliases: ["survitec", "auditoria survitec"] },
  { href: "/contentores", label: "Navios de Contentores", aliases: ["contentores", "navios de contentores"] },
  { href: "/porto-ponta-delgada", label: "Porto de Ponta Delgada", aliases: ["porto de ponta delgada", "porto"] },
  { href: "/pedidos-assistencia", label: "Pedidos de AssistÃªncia", aliases: ["pedidos de assistencia", "pedidos", "assistencia"] },
  { href: "/qualidade-dados", label: "Qualidade de Dados", aliases: ["qualidade de dados", "qualidade"] },
  { href: "/integridade", label: "Integridade", aliases: ["integridade"] },
  { href: "/backups", label: "Backups", aliases: ["backups", "backup", "copias de seguranca"] },
] as const;

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas",
  "em", "para", "pra", "por", "com", "que", "e", "um", "uma", "me", "minha", "meu",
  "por favor", "sff",
]);

const LEADING_FILLERS = /^(?:numero|n|serie|serial|registo|de|do|da|dos|das|com|chamad[oa]|nome)\b\s*/;

const DATA_HINTS = /\b(expirar|expira|expiram|expirou|expirad[oa]s?|validade|validades|falta|faltam|minimo|rotura|roturas|repor|reposicao|atraso|atrasad[oa]s?|abert[oa]s?|pendentes?|hoje|resumo|proxim[oa]s?|vencid[oa]s?|quant[oa]s?|critic[oa]s?|stock)\b/;

const NAVIGATION_START = /^(?:abre|abrir|vai|vao|ir|navega|navegar|mostra|mostrar|leva|levar|entra|entrar|quero|queria|preciso|vamos)\b/;

const ENTITY_NOUNS: ReadonlyArray<{ entity: JulinhoEntity; topic: JulinhoQueryTopic; pattern: RegExp }> = [
  { entity: "jangada", topic: "jangada", pattern: /\bjangadas?\b/ },
  { entity: "navio", topic: "navio", pattern: /\bnavios?\b/ },
  { entity: "cliente", topic: "cliente", pattern: /\bclientes?\b/ },
  { entity: "stock", topic: "stock-item", pattern: /\b(?:artigos?|referencias?|stocks?)\b/ },
];

/** Remove acentos, pontuaÃ§Ã£o e diferenÃ§as de maiÃºsculas. */
export function normalizeJulinhoText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTerm(rest: string): string {
  let value = normalizeJulinhoText(rest);
  if (!value) return "";

  while (LEADING_FILLERS.test(value)) {
    value = value.replace(LEADING_FILLERS, "").trim();
  }
  value = value.replace(/\s+(?:por favor|sff)$/, "").trim();

  const tokens = value.split(" ").filter(Boolean);
  while (tokens.length > 0 && STOPWORDS.has(tokens[0])) tokens.shift();
  while (tokens.length > 0 && STOPWORDS.has(tokens[tokens.length - 1])) tokens.pop();

  const term = tokens.join(" ").trim();
  return term.length >= 2 ? term : "";
}

function findEntityLookup(text: string): { topic: JulinhoQueryTopic; term: string } | null {
  let best: { topic: JulinhoQueryTopic; term: string; index: number } | null = null;

  for (const { topic, pattern } of ENTITY_NOUNS) {
    const match = pattern.exec(text);
    if (!match || match.index === undefined) continue;
    if (best && best.index <= match.index) continue;

    const term = cleanTerm(text.slice(match.index + match[0].length));
    if (!term || DATA_HINTS.test(term)) continue;
    best = { topic, term, index: match.index };
  }

  return best ? { topic: best.topic, term: best.term } : null;
}

function normalizeAlias(value: string): string {
  return normalizeJulinhoText(value);
}

/** Devolve a rota cujo alias tem maior correspondÃªncia dentro do texto. */
export function matchJulinhoRoute(text: string): JulinhoRoute | null {
  const normalized = normalizeJulinhoText(text);
  if (!normalized) return null;

  let best: { route: JulinhoRoute; aliasLength: number; exact: boolean } | null = null;

  for (const route of JULINHO_ROUTES) {
    for (const alias of route.aliases) {
      const normalizedAlias = normalizeAlias(alias);
      if (!normalizedAlias) continue;

      const isWordMatch = new RegExp(`(^|\\s)${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(normalized);
      if (!isWordMatch) continue;

      const exact = normalized === normalizedAlias;
      if (!best || normalizedAlias.length > best.aliasLength || (exact && !best.exact)) {
        best = { route, aliasLength: normalizedAlias.length, exact };
      }
    }
  }

  return best?.route ?? null;
}

function countEntityIn(text: string): JulinhoEntity | null {
  if (/\bjangadas?\b/.test(text)) return "jangada";
  if (/\bnavios?\b/.test(text)) return "navio";
  if (/\bclientes?\b/.test(text)) return "cliente";
  if (/\b(?:artigos?|referencias?|stocks?)\b/.test(text)) return "stock";
  return null;
}

export function parseJulinhoIntent(input: string): JulinhoIntent {
  const text = normalizeJulinhoText(input);
  if (!text) return { kind: "unknown" };

  const certificate = /\bcertificado\s*(?:(?:n[ÂºoÂ°.]?|numero|num)\s*)?([a-z]{1,10}\d{0,8}[-/]\d{1,12})\b/i.exec(input);
  if (certificate) return { kind: "query", topic: "certificate", term: certificate[1].toUpperCase() };

  if (/^(?:ola|oi|hey|viva|bom dia|boa tarde|boa noite)\b/.test(text)) return { kind: "greeting" };
  if (/\b(?:quem es tu|quem es voce|qual e o teu nome|como te chamas|o teu nome|es um robo|es humano)\b/.test(text)) {
    return { kind: "identity" };
  }
  if (/^(?:obrigad[oa]|agradeco|thanks|muito bem)\b/.test(text)) return { kind: "thanks" };
  if (/^(?:ajuda|socorro|comandos|funcionalidades|o que sabes fazer|como funciona|o que podes fazer)\b/.test(text)) {
    return { kind: "help" };
  }

  if (/\b(?:esta|essa|nesta|nessa) semana\b/.test(text) && /\b(?:inspecoes|inspecao|vistorias?|jangadas?)\b/.test(text) && /\b(?:vence|vencem|vencimento|vencid[oa]s?|validade|expira|expiram)\b/.test(text)) {
    return { kind: "query", topic: "inspections-week" };
  }
  if (/\b(?:inspecoes|inspecao|vistorias?|jangadas?)\b/.test(text) && /\b(?:vence|vencem|vencimento|vencid[oa]s?|validade|expira|expiram)\b/.test(text)) {
    if (/\b(?:vencid[oa]s?|em atraso)\b/.test(text)) return { kind: "query", topic: "inspections-period", term: "overdue" };
    if (/\b(?:proxima|seguinte) semana\b/.test(text)) return { kind: "query", topic: "inspections-period", term: "next-week" };
    if (/\bamanha\b/.test(text)) return { kind: "query", topic: "inspections-period", term: "tomorrow" };
    if (/\bhoje\b/.test(text)) return { kind: "query", topic: "inspections-period", term: "today" };
  }
  if (/\bjangadas?\b/.test(text) && /\b(?:aguardando|aguardar|espera|esperando)\b/.test(text) && /\b(?:inspecao|vistoria)\b/.test(text)) {
    return { kind: "query", topic: "station-waiting" };
  }

  if (/\b(?:resumo|panorama|visao geral|estado geral|briefing|como estamos|o que ha hoje|novidades|situacao|como esta a estacao)\b/.test(text)) {
    return { kind: "query", topic: "summary" };
  }

  if (/\b(?:inspecoes|vistorias)\b/.test(text) &&
      /\b(?:proxim[oa]s?|seguintes|agenda|pendentes?|marcad[oa]s?|vencid[oa]s?|expirar|esta semana|este mes|hoje|quant[oa]s?)\b/.test(text)) {
    return { kind: "query", topic: "inspections" };
  }

  if (/\b(?:validades?|expirar|expira|expiram|expirou|expirad[oa]s?|fora de validade)\b/.test(text)) {
    return { kind: "query", topic: "inspections" };
  }

  if (/\b(?:roturas?|stock|artigos?)\b/.test(text) &&
      /\b(?:falta|faltam|minimo|baixo|acabou|repor|reposicao|critic[oa]s?|rotura)\b/.test(text)) {
    return { kind: "query", topic: "stock-low" };
  }

  if (/\b(?:ordens? de servico|intervencoes|trabalhos)\b/.test(text) &&
      /\b(?:abert[oa]s?|pendentes?|curso|atrasad[oa]s?|hoje|quant[oa]s?)\b/.test(text)) {
    return { kind: "query", topic: "work-orders" };
  }

  if (/^(?:quant[oa]s?|numero de)\b/.test(text) && /\b(?:ordens? de servico|ot|ots)\b/.test(text)) {
    return { kind: "query", topic: "work-orders" };
  }

  if (/\b(?:faturas?|cobrancas?|pagamentos?)\b/.test(text) &&
      /\b(?:atraso|atrasad[oa]s?|pendentes?|por pagar|vencid[oa]s?|receber|quant[oa]s?)\b/.test(text)) {
    return { kind: "query", topic: "invoices" };
  }

  if (/\bquant[oa]s?\b/.test(text)) {
    const entity = countEntityIn(text);
    if (entity) return { kind: "query", topic: "count", term: entity };
  }

  if (/^(?:que|quais)\b/.test(text) && /^(?:que|quais)\s+(?:jangadas?|navios?|clientes?|artigos?)\s+(?:tenho|existem?)$/.test(text)) {
    const entity = countEntityIn(text);
    if (entity) return { kind: "query", topic: "count", term: entity };
  }

  const lookup = findEntityLookup(text);
  if (lookup) return { kind: "query", topic: lookup.topic, term: lookup.term };

  const route = matchJulinhoRoute(text);
  if (route) {
    const startsWithVerb = NAVIGATION_START.test(text);
    const tokenCount = text.split(" ").length;
    const aliasIsText = route.aliases.some((alias) => normalizeAlias(alias) === text);
    if (startsWithVerb || aliasIsText || tokenCount <= 4) {
      return { kind: "navigate", href: route.href, label: route.label };
    }
  }

  return { kind: "unknown" };
}

/** NavegaÃ§Ã£o puramente local, usada quando nÃ£o hÃ¡ ligaÃ§Ã£o Ã  API. */
export function localJulinhoFallback(input: string): { reply: string; href?: string } | null {
  const intent = parseJulinhoIntent(input);
  if (intent.kind === "navigate") {
    return { reply: `A abrir ${intent.label}.`, href: intent.href };
  }
  if (intent.kind === "greeting") {
    return { reply: "OlÃ¡! Sou a Julia. Posso abrir pÃ¡ginas e consultar dados. Diz, por exemplo: prÃ³ximas inspeÃ§Ãµes." };
  }
  if (intent.kind === "help") {
    return {
      reply: "Podes pedir: resumo da estaÃ§Ã£o, prÃ³ximas inspeÃ§Ãµes, stock em falta, ordens abertas, faturas em atraso, ou abrir jangadas, stock e agenda.",
    };
  }
  if (intent.kind === "identity") {
    return { reply: "Sou a Julia, a assistente de voz da Orey Tecnica- ServiÃ§os Navais, Lda." };
  }
  return null;
}

export const JULINHO_SUGGESTIONS: readonly string[] = [
  "Resumo da estaÃ§Ã£o",
  "PrÃ³ximas inspeÃ§Ãµes",
  "Stock em falta",
  "Ordens abertas",
  "Faturas em atraso",
  "Abrir jangadas",
  "O que podes fazer?",
];
