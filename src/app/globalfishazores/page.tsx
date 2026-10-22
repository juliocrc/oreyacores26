import React from "react";
import GlobalFishAzoresClient from "@/modules/globalfishazores/GlobalFishAzoresClient";

export const metadata = {
  title: "GlobalFishAzores · Monitorização GFW & Frotas dos Açores",
  description: "Módulo de integração de dados oceanográficos e rastreio de frotas de pesca dos Açores com Global Fishing Watch.",
};

export default function GlobalFishAzoresPage() {
  return <GlobalFishAzoresClient />;
}
