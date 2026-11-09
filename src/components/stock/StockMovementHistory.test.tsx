import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StockMovementHistory from "./StockMovementHistory";

afterEach(() => jest.restoreAllMocks());

test("history presents actor, time, before/after, reason and reciprocal original links", () => {
  const movements = [
    { id: 12, tipo: "entrada", quantidadeAntes: 2, quantidadeDepois: 5, usuario: "3:operator@example.com",
      createdAt: "2026-10-26T10:00:00Z", motivo: "Original reason", reversaoDeId: null, estorno: { id: 13 }, canReverse: false },
    { id: 13, tipo: "estorno", quantidadeAntes: 10, quantidadeDepois: 7, usuario: "4:reviewer@example.com",
      createdAt: "2026-10-26T11:00:00Z", motivo: "Correction reason", reversaoDeId: 12, estorno: null, canReverse: false },
  ];
  jest.spyOn(React, "useState").mockImplementationOnce((() => [movements, jest.fn()]) as typeof React.useState);
  const html = renderToStaticMarkup(<StockMovementHistory stockId={41} onReversed={jest.fn()} />);
  expect(html).toContain('href="#movimento-12"');
  expect(html).toContain('href="#movimento-13"');
  expect(html).toContain("3:operator@example.com");
  expect(html).toContain("4:reviewer@example.com");
  expect(html).toContain("Original reason");
  expect(html).toContain("Correction reason");
  expect(html).toContain("2026");
  expect(html).toContain("10 -&gt; 7");
  expect(html).not.toContain("Estornar movimento");
});

test("eligible original exposes action and mandatory bounded reason confirmation", () => {
  const states = [[{ id: 12, tipo: "saida", quantidadeAntes: 5, quantidadeDepois: 2,
    usuario: null, createdAt: "2026-10-26T10:00:00Z", motivo: null, reversaoDeId: null,
    estorno: null, canReverse: true }], 12, "", "", false, 0];
  let index = 0;
  jest.spyOn(React, "useState").mockImplementation((() => [states[index++], jest.fn()]) as typeof React.useState);
  const html = renderToStaticMarkup(<StockMovementHistory stockId={41} onReversed={jest.fn()} />);
  expect(html).toContain("Estornar movimento #12");
  expect(html).toContain("Motivo do estorno");
  expect(html).toContain('maxLength="300"');
  expect(html).toContain("required");
  expect(html).toContain("Confirmar estorno");
  expect(html).toContain("disabled");
});
