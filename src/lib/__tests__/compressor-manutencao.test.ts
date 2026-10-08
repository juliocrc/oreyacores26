import {
  addMeses,
  proximaDataManutencao,
  estaVencida,
  diasAteProxima,
  TAREFAS_MANUTENCAO_COMPRESSOR,
  tarefaPorReferencia,
  tarefaPorTipo,
  ITENS_COMPRESSOR_SEM_EQUIVALENTE,
  INTERVALO_MESES,
} from "@/lib/compressor-manutencao";

const d = (iso: string) => new Date(`${iso}T00:00:00`);

/**
 * Formata em componentes LOCAIS. `toISOString()` converte para UTC e em
 * Portugal (WEST, UTC+1) devolveria o dia anterior em datas de meia-noite.
 */
const fmt = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

describe("addMeses - soma meses sem transbordar o mês", () => {
  test("mês normal", () => {
    expect(fmt(addMeses(d("2026-01-15"), 1))).toBe("2026-02-15");
  });

  test("31 de janeiro + 1 mês fica no último dia de fevereiro", () => {
    expect(fmt(addMeses(d("2026-01-31"), 1))).toBe("2026-02-28");
  });

  test("ano bissexto: 31 de janeiro + 1 mês", () => {
    expect(fmt(addMeses(d("2028-01-31"), 1))).toBe("2028-02-29");
  });

  test("31 de agosto + 6 meses", () => {
    expect(fmt(addMeses(d("2026-08-31"), 6))).toBe("2027-02-28");
  });

  test("12 meses = 1 ano, preservando dia e hora", () => {
    const base = new Date("2026-03-09T14:35:00");
    const result = addMeses(base, 12);
    expect(fmt(result)).toBe("2027-03-09");
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(35);
  });

  test("não muta a data de origem", () => {
    const base = d("2026-01-31");
    addMeses(base, 1);
    expect(fmt(base)).toBe("2026-01-31");
  });
});

describe("proximaDataManutencao - intervalos do documento v.2", () => {
  test("W = 7 dias", () => {
    expect(fmt(proximaDataManutencao(d("2026-02-02"), "W"))).toBe("2026-02-09");
  });

  test("W atravessa a virada do mês", () => {
    expect(fmt(proximaDataManutencao(d("2026-02-26"), "W"))).toBe("2026-03-05");
  });

  test("M = 1 mês", () => {
    expect(fmt(proximaDataManutencao(d("2026-01-10"), "M"))).toBe("2026-02-10");
  });

  test("3M = 3 meses", () => {
    expect(fmt(proximaDataManutencao(d("2026-01-10"), "3M"))).toBe("2026-04-10");
  });

  test("6M = 6 meses", () => {
    expect(fmt(proximaDataManutencao(d("2026-01-10"), "6M"))).toBe("2026-07-10");
  });

  test("Y = 12 meses", () => {
    expect(fmt(proximaDataManutencao(d("2026-01-10"), "Y"))).toBe("2027-01-10");
  });

  test("a tabela de meses bate com a legenda W/M/3M/6M/Y", () => {
    expect(INTERVALO_MESES).toEqual({ M: 1, "3M": 3, "6M": 6, Y: 12 });
  });
});

describe("diasAteProxima / estaVencida", () => {
  test("dias contados até à próxima", () => {
    expect(diasAteProxima(d("2026-10-02"), d("2026-10-01"))).toBe(1);
  });

  test("hoje conta como 0 dias", () => {
    expect(diasAteProxima(d("2026-10-01"), d("2026-10-01"))).toBe(0);
  });

  test("vencida devolve negativo", () => {
    expect(diasAteProxima(d("2026-09-27"), d("2026-10-01"))).toBe(-4);
  });

  test("ignora a hora: mesma data = 0 dias", () => {
    expect(diasAteProxima(new Date("2026-10-01T23:50:00"), new Date("2026-10-01T00:05:00"))).toBe(0);
  });

  test("sem data não está vencida", () => {
    expect(estaVencida(null)).toBe(false);
    expect(diasAteProxima(null)).toBeNull();
  });

  test("hoje está vencida (limite inclusivo)", () => {
    expect(estaVencida(d("2026-10-01"), d("2026-10-01"))).toBe(true);
  });

  test("amanhã ainda não está vencida", () => {
    expect(estaVencida(d("2026-10-02"), d("2026-10-01"))).toBe(false);
  });
});

describe("plano do compressor sincronizado com 'Manutenção de ar comprimido v.2'", () => {
  test("tem as 13 tarefas do documento", () => {
    expect(TAREFAS_MANUTENCAO_COMPRESSOR).toHaveLength(13);
  });

  test("as colunas são 2..14 sem saltos nem duplicados", () => {
    const colunas = TAREFAS_MANUTENCAO_COMPRESSOR.map((t) => t.coluna);
    expect(colunas).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  test("cada tarefa tem intervalo válido e campos preenchidos", () => {
    for (const t of TAREFAS_MANUTENCAO_COMPRESSOR) {
      expect(["W", "M", "3M", "6M", "Y"]).toContain(t.intervalo);
      expect(t.referencia).toMatch(/^MICHELIN-300L-/);
      expect(t.tipo.startsWith("compressor_")).toBe(true);
      expect(t.nome.length).toBeGreaterThan(10);
    }
  });

  test("referências são únicas", () => {
    const refs = TAREFAS_MANUTENCAO_COMPRESSOR.map((t) => t.referencia);
    expect(new Set(refs).size).toBe(refs.length);
  });

  test("intervalos exatos de cada coluna do documento", () => {
    const porColuna = Object.fromEntries(TAREFAS_MANUTENCAO_COMPRESSOR.map((t) => [t.coluna, t.intervalo]));
    expect(porColuna).toEqual({
      2: "3M",
      3: "M",
      4: "W",
      5: "M",
      6: "M",
      7: "3M",
      8: "6M",
      9: "3M",
      10: "Y",
      11: "Y",
      12: "Y",
      13: "6M",
      14: "Y",
    });
  });

  test("as 3 referências legadas continuam mapeadas ao mesmo registo", () => {
    expect(tarefaPorReferencia("MICHELIN-300L-OLEO")?.coluna).toBe(11);
    expect(tarefaPorReferencia("MICHELIN-300L-FILTRO")?.coluna).toBe(12);
    expect(tarefaPorReferencia("MICHELIN-300L-VALVULA")?.coluna).toBe(13);
  });

  test("pesquisa por tipo é tolerante a maiúsculas", () => {
    expect(tarefaPorTipo("COMPRESSOR_OLEO")?.intervalo).toBe("Y");
    expect(tarefaPorTipo("compressor_apertos")?.intervalo).toBe("Y");
  });

  test("lookup de referência inexistente devolve undefined", () => {
    expect(tarefaPorReferencia("MICHELIN-300L-NAO-EXISTE")).toBeUndefined();
    expect(tarefaPorTipo("")).toBeUndefined();
  });

  test("a purga de condensos do depósito está registada como sem equivalente", () => {
    const refs = ITENS_COMPRESSOR_SEM_EQUIVALENTE.map((i) => i.referencia);
    expect(refs).toContain("MICHELIN-300L-PURGA");
    expect(tarefaPorReferencia("MICHELIN-300L-PURGA")).toBeUndefined();
  });
});
