import { parsePedidoAssistenciaJangadaIds, resolvePedidoAssistenciaJangadaTargets } from "@/lib/pedido-assistencia";

describe("parsePedidoAssistenciaJangadaIds", () => {
  test("aceita arrays e CSV de IDs e ignora valores inválidos", () => {
    expect(parsePedidoAssistenciaJangadaIds({ jangadaIds: [1, "2", "x", null, 4] })).toEqual([1, 2, 4]);
    expect(parsePedidoAssistenciaJangadaIds({ jangadaIdsCsv: "1, 2; 3; 9" })).toEqual([1, 2, 3, 9]);
  });
});

describe("resolvePedidoAssistenciaJangadaTargets", () => {
  test("deduplica seriales e IDs vindos do pedido antes de criar OTs", () => {
    const targets = resolvePedidoAssistenciaJangadaTargets({
      jangadaSerial: "SER-001, SER-002; SER-001",
      metadados: JSON.stringify({ jangadaIds: [10, 20, 10] }),
    });

    expect(targets).toEqual([
      { id: 10 },
      { id: 20 },
      { serial: "SER-001" },
      { serial: "SER-002" },
    ]);
  });
});
