import {
  JULINHO_SUGGESTIONS,
  localJulinhoFallback,
  matchJulinhoRoute,
  normalizeJulinhoText,
  parseJulinhoIntent,
} from "../julinho/julinho-intents";

describe("normalizeJulinhoText", () => {
  it("remove acentos, pontuação e caixa", () => {
    expect(normalizeJulinhoText("  Abre as JANGADAS, por favor! ")).toBe("abre as jangadas por favor");
  });
});

describe("parseJulinhoIntent", () => {
  it.each(["olá", "Bom dia", "boa noite"])("reconhece a saudação %s", (text) => {
    expect(parseJulinhoIntent(text)).toEqual({ kind: "greeting" });
  });

  it("reconhece identidade e ajuda", () => {
    expect(parseJulinhoIntent("quem és tu?")).toEqual({ kind: "identity" });
    expect(parseJulinhoIntent("o que podes fazer")).toEqual({ kind: "help" });
  });

  it.each([
    ["abre as jangadas", "/jangadas"],
    ["vai para a agenda", "/agenda"],
    ["mostra o stock", "/stock"],
    ["abre o painel", "/"],
    ["abre ordens de serviço", "/ordens-servico"],
    ["abre o estado jangada", "/estado-jangada"],
  ])("navega com %s", (text, href) => {
    expect(parseJulinhoIntent(text)).toMatchObject({ kind: "navigate", href });
  });

  it.each([
    ["abre a jangada 2153", "jangada", "2153"],
    ["procura o navio Atlântida", "navio", "atlantida"],
    ["mostra o cliente João Bettencourt", "cliente", "joao bettencourt"],
    ["artigo A10", "stock-item", "a10"],
  ])("consulta a entidade em %s", (text, topic, term) => {
    expect(parseJulinhoIntent(text)).toEqual({ kind: "query", topic, term });
  });

  it("distingue consultas de dados de navegação", () => {
    expect(parseJulinhoIntent("resumo da estação")).toEqual({ kind: "query", topic: "summary" });
    expect(parseJulinhoIntent("próximas inspeções")).toEqual({ kind: "query", topic: "inspections" });
    expect(parseJulinhoIntent("jangadas a expirar")).toEqual({ kind: "query", topic: "inspections" });
    expect(parseJulinhoIntent("stock em falta")).toEqual({ kind: "query", topic: "stock-low" });
    expect(parseJulinhoIntent("ordens de serviço abertas")).toEqual({ kind: "query", topic: "work-orders" });
    expect(parseJulinhoIntent("faturas em atraso")).toEqual({ kind: "query", topic: "invoices" });
  });

  it('reconhece as perguntas relatadas sem trocar fila por contagem total', () => {
    expect(parseJulinhoIntent('que inspecoes vencem essa semana')).toEqual({ kind: 'query', topic: 'inspections-week' });
    expect(parseJulinhoIntent('que jangadas estao na estacao de servico aguardando inspecao')).toEqual({ kind: 'query', topic: 'station-waiting' });
    expect(parseJulinhoIntent('de quem é o certificado AZ26-002')).toEqual({ kind: 'query', topic: 'certificate', term: 'AZ26-002' });
  });

  it.each([
    ['quais os artigos em falta', 'stock-low'],
    ['que artigos estão abaixo do mínimo', 'stock-low'],
    ['que vistoria vence amanhã', 'inspections-period'],
  ])('reconhece formulações naturais de oficina: %s', (text, topic) => {
    expect(parseJulinhoIntent(text)).toMatchObject({ kind: 'query', topic });
  });

  it("conta entidades", () => {
    expect(parseJulinhoIntent("quantas jangadas")).toEqual({ kind: "query", topic: "count", term: "jangada" });
    expect(parseJulinhoIntent("quantos clientes existem")).toEqual({ kind: "query", topic: "count", term: "cliente" });
    expect(parseJulinhoIntent("que jangadas tenho")).toEqual({ kind: "query", topic: "count", term: "jangada" });
  });

  it("não transforma frases desconhecidas em navegação", () => {
    expect(parseJulinhoIntent("qual é a previsão do tempo para amanhã")).toEqual({ kind: "unknown" });
  });

  it("ignora pedidos vazios", () => {
    expect(parseJulinhoIntent("   ")).toEqual({ kind: "unknown" });
  });
});

describe("matchJulinhoRoute", () => {
  it("prefere o alias mais específico", () => {
    expect(matchJulinhoRoute("abre o estado jangada")?.href).toBe("/estado-jangada");
    expect(matchJulinhoRoute("abre ordens de serviço")?.href).toBe("/ordens-servico");
  });

  it("devolve null quando não há rota", () => {
    expect(matchJulinhoRoute("bom dia")).toBeNull();
  });
});

describe("localJulinhoFallback", () => {
  it("permite navegar sem servidor", () => {
    expect(localJulinhoFallback("abre as jangadas")).toEqual({ reply: "A abrir Jangadas.", href: "/jangadas" });
  });

  it("responde a saudações sem servidor", () => {
    expect(localJulinhoFallback("olá")?.reply).toContain("Julia");
  });

  it("não inventa respostas para consultas de dados", () => {
    expect(localJulinhoFallback("resumo da estação")).toBeNull();
  });
});

it("tem sugestões prontas para o painel", () => {
  expect(JULINHO_SUGGESTIONS.length).toBeGreaterThan(3);
});
