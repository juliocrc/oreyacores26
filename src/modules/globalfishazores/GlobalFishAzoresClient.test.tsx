import { renderToStaticMarkup } from "react-dom/server";
import GlobalFishAzoresClient from "./GlobalFishAzoresClient";

it("renders on the server without importing Leaflet or inventing fleet data", () => {
  const html = renderToStaticMarkup(<GlobalFishAzoresClient />);
  expect(html).toContain("GlobalFish Azores");
  expect(html).toContain("A carregar embarcacoes");
  expect(html).toContain("nao comprovam atividade de pesca");
  expect(html).toContain("IMO");
  expect(html).not.toContain("Mestre Afonso");
  expect(html).not.toContain("94.2%");
});
