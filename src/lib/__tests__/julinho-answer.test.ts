import prisma from "@/lib/prisma";
import { answerJulinho, describeSummary, formatJulinhoDate } from "../julinho/julinho-answer";
import { askJulinhoLlm } from "../julinho/julinho-llm";

jest.mock("@/lib/prisma", () => {
  const delegate = () => ({
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _count: { _all: 0 }, _sum: { valorTotal: 0 } })),
  });
  return {
    __esModule: true,
    default: {
      jangada: delegate(),
      navio: delegate(),
      cliente: delegate(),
      stock: delegate(),
      ordemServico: delegate(),
      fatura: delegate(),
      serviceStation: delegate(),
      serviceStationQueue: delegate(),
      inspecao: delegate(),
    },
  };
});

jest.mock("../julinho/julinho-llm", () => ({ askJulinhoLlm: jest.fn(async () => null) }));

const scope = { where: { serviceStationId: 1 }, stationName: "Açores", pathname: "/jangadas" };

function resetDelegates() {
  for (const delegate of Object.values(prisma) as Array<Record<string, jest.Mock>>) {
    for (const fn of Object.values(delegate)) {
      fn.mockReset();
    }
  }
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([] as never);
  jest.mocked(prisma.stock.findMany).mockResolvedValue([] as never);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([] as never);
  jest.mocked(prisma.ordemServico.count).mockResolvedValue(0);
  jest.mocked(prisma.navio.count).mockResolvedValue(0);
  jest.mocked(prisma.cliente.count).mockResolvedValue(0);
  jest.mocked(prisma.fatura.count).mockResolvedValue(0);
  jest.mocked(prisma.fatura.aggregate).mockResolvedValue({ _count: { _all: 0 }, _sum: { valorTotal: 0 } } as never);
  jest.mocked(prisma.serviceStationQueue.findMany).mockResolvedValue([] as never);
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([] as never);
}

beforeEach(() => {
  resetDelegates();
  jest.mocked(askJulinhoLlm).mockResolvedValue(null);
});

describe("formatJulinhoDate", () => {
  it.each([
    ["2026-10-27", "27/10/2026"],
    ["27/10/2026", "27/10/2026"],
    [null, "sem data"],
    ["", "sem data"],
  ])("formata %s", (value, expected) => {
    expect(formatJulinhoDate(value as string | null)).toBe(expected);
  });
});

describe("describeSummary", () => {
  it("resume os dados da estação", () => {
    const reply = describeSummary(scope, {
      rafts: 12,
      ships: 4,
      clients: 3,
      dueSoon: 2,
      overdue: 1,
      openOrders: 5,
      lowStock: 6,
      overdueInvoices: 2,
    });
    expect(reply).toContain("12 jangadas");
    expect(reply).toContain("Açores:");
    expect(reply).toContain("2 jangadas com inspeção nos próximos 30 dias, 1 já está vencida");
    expect(reply).toContain("5 ordens de serviço abertas");
    expect(reply).toContain("6 artigos abaixo do mínimo");
    expect(reply).toContain("2 faturas vencidas");
  });
});

describe("answerJulinho", () => {
  it('não chama disponível a um artigo sem unidades', async () => {
    jest.mocked(prisma.stock.findMany).mockResolvedValue([{ id: 1, referencia: '20701002', descricao: 'Hammar', quantidade: 0, quantidadeMinima: 0, validade: null, localizacao: null }] as never);
    const answer = await answerJulinho('artigo 20701002', scope);
    expect(answer.reply).toContain('sem stock disponível');
    expect(answer.reply).not.toContain(', disponível');
    expect(answer.context).toEqual({ kind: 'stock-item', term: '20701002' });
  });

  it('não afirma que o stock está completo quando a consulta excede o limite', async () => {
    jest.mocked(prisma.stock.findMany).mockResolvedValue(Array(5001).fill({ referencia: 'X', quantidade: 1, quantidadeMinima: 0 }) as never);
    const answer = await answerJulinho('stock em falta', scope);
    expect(answer.reply).toContain('demasiados registos');
    expect(answer.reply).not.toContain('Não há artigos');
  });

  it('não apresenta uma contagem exata quando há mais resultados de jangadas', async () => {
    jest.mocked(prisma.jangada.findMany).mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ serial: `SERIE-${i}` })) as never);
    const answer = await answerJulinho('jangada SER123', scope);
    expect(answer.reply).toContain('pelo menos 6');
    expect(answer.context).toBeUndefined();
  });
  it("identifica certificado pela jangada autorizada sem inventar titular histórico", async () => {
    jest.mocked(prisma.inspecao.findMany).mockResolvedValue([{ jangadaId: 8 }] as never);
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ serial: '123', owner: 'Armador A', shipNameManual: null }] as never);
    const answer = await answerJulinho('de quem é o certificado AZ26-002', scope);
    expect(answer.reply).toContain('AZ26-002');
    expect(answer.reply).toContain('Armador A');
    expect(answer.reply).toContain('atualmente');
    expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceStationId: 1 }) }));
    expect(askJulinhoLlm).not.toHaveBeenCalled();
  });

  it('não atribui titular quando o certificado corresponde a várias jangadas', async () => {
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([
      { serial: 'A', owner: 'Armador A' }, { serial: 'B', owner: 'Armador B' },
    ] as never);
    const answer = await answerJulinho('de quem é o certificado AZ26-002', scope);
    expect(answer.reply).toContain('várias jangadas');
    expect(answer.reply).not.toContain('Armador A');
  });

  it('usa a fila e não o total de jangadas para aguardando inspeção', async () => {
    jest.mocked(prisma.serviceStationQueue.findMany).mockResolvedValue([
      { jangadaId: 1, status: 'aguardar', jangada: { serial: 'SERIE-1' } },
      { jangadaId: 2, status: 'progresso', jangada: { serial: 'SERIE-2' } },
      { jangadaId: 2, status: 'aguardar', jangada: { serial: 'SERIE-2' } },
    ] as never);
    const answer = await answerJulinho('que jangadas estao na estacao de servico aguardando inspecao', scope);
    expect(answer.reply).toContain('SERIE-1');
    expect(answer.reply).not.toContain('SERIE-2');
    expect(prisma.serviceStationQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: scope.where }));
    expect(prisma.jangada.count).not.toHaveBeenCalled();
  });

  it('filtra a semana civil nos Açores e exclui outras datas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T12:00:00Z'));
    try {
      jest.mocked(prisma.jangada.findMany).mockResolvedValue([
        { serial: 'A', dataProxInspecao: '2026-10-26' },
        { serial: 'B', dataProxInspecao: '2026-11-01' },
        { serial: 'C', dataProxInspecao: '2026-11-02' },
      ] as never);
      const answer = await answerJulinho('que inspecoes vencem essa semana', scope);
      expect(answer.reply).toContain('26/10/2026 a 01/11/2026');
      expect(answer.reply).toContain('A, 26/10/2026');
      expect(answer.reply).toContain('B, 01/11/2026');
      expect(answer.reply).not.toContain('C,');
    } finally { jest.useRealTimers(); }
  });

  it('distingue hoje, amanhã e próxima semana', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T12:00:00Z'));
    try {
      jest.mocked(prisma.jangada.findMany).mockResolvedValue([
        { serial: 'HOJE', dataProxInspecao: '2026-10-27' },
        { serial: 'AMANHA', dataProxInspecao: '2026-10-28' },
        { serial: 'SEMANA', dataProxInspecao: '2026-11-02' },
        { serial: 'ANTIGA', dataProxInspecao: '2026-10-26' },
      ] as never);
      expect((await answerJulinho('que inspeções vencem hoje', scope)).reply).toContain('HOJE');
      const tomorrow = (await answerJulinho('que inspeções vencem amanhã', scope)).reply;
      expect(tomorrow).toContain('AMANHA');
      expect(tomorrow).not.toContain('HOJE');
      expect((await answerJulinho('que inspeções vencem na próxima semana', scope)).reply).toContain('SEMANA');
      const overdue = (await answerJulinho('que inspeções de jangadas estão vencidas', scope)).reply;
      expect(overdue).toContain('ANTIGA');
      expect(overdue).not.toContain('HOJE');
    } finally { jest.useRealTimers(); }
  });
  it("responde a saudações sem consultar dados", async () => {
    const answer = await answerJulinho("olá", scope);
    expect(answer.reply).toContain("Julia");
    expect(prisma.jangada.findMany).not.toHaveBeenCalled();
  });

  it("confirma a navegação pedida", async () => {
    const answer = await answerJulinho("abre as jangadas", scope);
    expect(answer).toEqual({
      reply: "A abrir Jangadas.",
      action: { type: "navigate", href: "/jangadas", label: "Jangadas" },
    });
  });

  it("devolve o resumo com contagens e inspeções vencidas", async () => {
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([
      { dataProxInspecao: "2020-01-01" },
      { dataProxInspecao: null },
    ] as never);
    jest.mocked(prisma.navio.count).mockResolvedValue(3);
    jest.mocked(prisma.cliente.count).mockResolvedValue(2);
    jest.mocked(prisma.ordemServico.count).mockResolvedValue(1);
    jest.mocked(prisma.stock.findMany).mockResolvedValue([
      { quantidade: 0, quantidadeMinima: 1 },
      { quantidade: 5, quantidadeMinima: 1 },
    ] as never);
    jest.mocked(prisma.fatura.count).mockResolvedValue(0);

    const answer = await answerJulinho("resumo da estação", scope);
    expect(answer.reply).toContain("2 jangadas");
    expect(answer.reply).toContain("3 navios");
    expect(answer.reply).toContain("1 já está vencida");
    expect(answer.reply).toContain("1 artigo abaixo do mínimo");
  });

  it("lista as inspeções mais urgentes", async () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 5);
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([
      { id: 1, serial: "2153", owner: "JOÃO", dataProxInspecao: soon.toISOString().slice(0, 10) },
      { id: 2, serial: "9999", owner: "ANA", dataProxInspecao: "2099-01-01" },
    ] as never);

    const answer = await answerJulinho("próximas inspeções", scope);
    expect(answer.reply).toContain("1 jangada com inspeção até 30 dias");
    expect(answer.reply).toContain("2153 (JOÃO)");
    expect(answer.reply).not.toContain("9999");
    expect(answer.action?.href).toBe("/jangadas?exp30=1");
  });

  it("abre a ficha quando encontra uma única jangada", async () => {
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([{
      id: 9,
      serial: "2153",
      brand: "ZODIAC",
      model: "X",
      owner: "JOÃO",
      shipId: 4,
      shipNameManual: null,
      dataInspecao: "2025-10-01",
      dataProxInspecao: "2026-10-01",
      capacity: 12,
      packType: "R",
      ultimoCertificadoNumero: "AZ26-002",
    }] as never);
    jest.mocked(prisma.navio.findFirst).mockResolvedValue({ nome: "ATLÂNTIDA" } as never);

    const answer = await answerJulinho("abre a jangada 2153", scope);
    expect(answer.reply).toContain("Jangada 2153");
    expect(answer.reply).toContain("navio ATLÂNTIDA");
    expect(answer.reply).toContain("lotação 12 pessoas");
    expect(answer.reply).toContain("AZ26-002");
    expect(prisma.navio.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: 1, id: 4 } }));
    expect(answer.action).toEqual({ type: "navigate", href: "/jangadas/9", label: "Jangada 2153" });
  });

  it('descreve navio autorizado sem afirmar posição em tempo real', async () => {
    jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 7, nome: 'ATLANTIDA', matricula: 'PT-1', imo: '1234567', mmsi: '123456789', bandeira: 'Portugal', portoRegisto: 'Ponta Delgada' }] as never);
    const answer = await answerJulinho('procura o navio atlantida', scope);
    expect(answer.reply).toContain('IMO 1234567');
    expect(answer.reply).toContain('MMSI 123456789');
    expect(answer.reply).toContain('não são posição em tempo real');
    expect(prisma.navio.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceStationId: 1 }) }));
  });

  it("avisa quando não há resultados", async () => {
    const answer = await answerJulinho("abre a jangada 4040", scope);
    expect(answer.reply).toContain("Não encontrei");
    expect(answer.action).toBeUndefined();
  });

  it("usa o modelo apenas quando o pedido não é reconhecido", async () => {
    jest.mocked(askJulinhoLlm).mockResolvedValue("Resposta do modelo.");
    const answer = await answerJulinho("explica-me a diferença entre pack R e E", scope);
    expect(answer.reply).toBe("Resposta do modelo.");
    expect(askJulinhoLlm).toHaveBeenCalledWith(
      "explica-me a diferença entre pack R e E",
      expect.objectContaining({ stationName: "Açores", pathname: "/jangadas" }),
    );
  });

  it("cai para a ajuda quando não há modelo configurado", async () => {
    const answer = await answerJulinho("conta-me uma história", scope);
    expect(answer.reply).toContain("ajuda");
  });
});
