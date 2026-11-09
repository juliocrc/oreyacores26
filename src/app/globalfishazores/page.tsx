import React from "react";
import GlobalFishAzoresClient from "@/modules/globalfishazores/GlobalFishAzoresClient";

export const metadata = {
  title: "GlobalFishAzores · Historico AIS de 48 horas",
  description: "Consulta de posicoes AIS historicas da frota, com fonte e limites de cobertura explicitos. Posicoes AIS nao comprovam pesca.",
};

export default function GlobalFishAzoresPage() {
  return <GlobalFishAzoresClient />;
}
