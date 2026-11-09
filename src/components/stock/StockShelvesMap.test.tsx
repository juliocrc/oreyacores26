import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StockShelvesMap from "./StockShelvesMap";

it("renders actual shelf sections, lot links, separate unit availability and unlocated stock", () => {
  const html = renderToStaticMarkup(<StockShelvesMap items={[
    { id: 1, referencia: "R", nome: "Cabo", foto: '/catalog/cabo.jpg', localizacao: "A2", lote: "B10", quantidade: 8, quantidadeReservada: 3, unit: "m" },
    { id: 2, nome: "Luz", localizacao: "A10", quantidade: 1, unit: "un" },
    { id: 3, nome: "Sem local", quantidade: -2, quantidadeReservada: 1 },
  ]} />);
  expect(html).toContain('aria-label="A2"');
  expect(html).toContain('aria-label="Sem localização"');
  expect(html.indexOf('aria-label="A2"')).toBeLessThan(html.indexOf('aria-label="A10"'));
  expect(html).toContain("Disponível: 5 m");
  expect(html).toContain("Lote: B10");
  expect(html).toContain('href="/stock/1"');
  expect(html).toContain('src="/catalog/cabo.jpg"');
  expect(html).toContain('Sem imagem de Luz');
  expect(html).toContain("Reservada: 3");
  expect(html).not.toContain("P01");
  expect(html).not.toContain("Confirmar localização");
});

it("keeps location selection explicit and preserves a noncanonical selected location", () => {
  const onSelectLocation = jest.fn();
  const html = renderToStaticMarkup(<StockShelvesMap items={[]} mode="select" selectedLocation="Oficina" onSelectLocation={onSelectLocation} />);
  expect(html).toContain('value="Oficina" selected=""');
  expect(html).toContain("Confirmar localização");
  expect(onSelectLocation).not.toHaveBeenCalled();
});

it("does not display resource stock or offer its recorded location", () => {
  const html = renderToStaticMarkup(<StockShelvesMap mode="select" items={[
    { id: 1, referencia: "L-TEST", nome: "Resource", localizacao: "Resource-only", quantidade: 99 },
    { id: 2, referencia: "ES123", nome: "Resource without location", quantidade: 0 },
    { id: 3, referencia: "PART", nome: "Part", localizacao: "A2", quantidade: 5, unit: "un" },
  ]} />);
  expect(html).not.toContain("Resource-only");
  expect(html).not.toContain("L-TEST");
  expect(html).not.toContain("ES123");
  expect(html).not.toContain('aria-label="Sem localização"');
  expect(html).toContain("Disponível: 5 un");
});
