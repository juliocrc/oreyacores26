/** Checklist unificada Crewsaver + Viking + Lalizas (MSC/Circ.1114) */

export type ChecklistResult = "OK" | "F" | "R" | "S" | "N/A";

export type ChecklistItemDef = {
  key: string;
  label: string;
  desc: string;
  group: "visual" | "acessorios" | "estrutura";
  mapField?: string;
};

export const FATO_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: "tecidoExterior", label: "Material exterior", desc: "Cortes, rasgos, furos, decomposição", group: "visual", mapField: "tecidoExterior" },
  { key: "costuras", label: "Costuras e colagens", desc: "Ombros, axilas, virilha, tornozelos", group: "visual", mapField: "costuras" },
  { key: "fecho", label: "Fecho / zip", desc: "Corrosão, dentes e cursor; avaliar reparabilidade pelo manual aplicável", group: "visual", mapField: "fecho" },
  { key: "fitasReflectoras", label: "Fitas retro-refletoras", desc: "Aderência + reflexão (SOLAS)", group: "visual", mapField: "fitasReflectoras" },
  { key: "capuz", label: "Capuz / face seal / collar", desc: "Fissuras, cola, montagem", group: "visual", mapField: "capuz" },
  { key: "wristSeals", label: "Wrist seals (punhos)", desc: "Fissuras, cola, fitas de montagem", group: "visual" },
  { key: "luvas", label: "Luvas / over-gloves", desc: "Estado, cola e montagem", group: "acessorios", mapField: "luvas" },
  { key: "botas", label: "Botas / sola / socks", desc: "Defeitos, rasgos, furos", group: "acessorios", mapField: "botas" },
  { key: "luz", label: "Luz de emergência", desc: "Função e validade da bateria; confirmar requisitos do modelo e manual", group: "acessorios", mapField: "luz" },
  { key: "apito", label: "Apito", desc: "Presente e fixo", group: "acessorios", mapField: "apito" },
  { key: "buddyLine", label: "Buddy line / bodyline", desc: "Linha + toggle", group: "acessorios" },
  { key: "liftingStrop", label: "Lifting / rescue strop", desc: "Costuras e pontos de fixação", group: "acessorios" },
  { key: "buoyancy", label: "Espuma de flutuação", desc: "Condição do buoyancy foam / Buoyancy Plus", group: "estrutura" },
  { key: "pockets", label: "Bolsos e webbing", desc: "Bolsos, fivelas, cintas", group: "estrutura" },
  { key: "knife", label: "Faca (se aplicável)", desc: "Presente e funcional", group: "acessorios" },
  { key: "lining", label: "Forro / lining", desc: "Zip do forro e montagem", group: "estrutura" },
  { key: "labelling", label: "Etiquetas / marcações", desc: "Tamanho, serial, service table", group: "estrutura" },
  { key: "zipGrease", label: "Lubrificação do zip", desc: "Beeswax / grease stick aplicado", group: "visual" },
  { key: "impermeabilidade", label: "Leak / air-pressure test", desc: "MSC/Circ.1114 — estanqueidade", group: "estrutura", mapField: "impermeabilidade" },
];

export const FATO_HOTSPOTS = [
  { key: "capuz", label: "Capuz / face seal", side: "front" as const, x: 50, y: 8 },
  { key: "fecho", label: "Zip frontal", side: "front" as const, x: 50, y: 38 },
  { key: "luz", label: "Luz", side: "front" as const, x: 38, y: 28 },
  { key: "apito", label: "Apito", side: "front" as const, x: 62, y: 30 },
  { key: "fitasReflectoras", label: "Fitas refletoras", side: "front" as const, x: 28, y: 22 },
  { key: "luvas", label: "Luvas", side: "front" as const, x: 18, y: 48 },
  { key: "wristSeals", label: "Wrist seals", side: "front" as const, x: 22, y: 42 },
  { key: "buddyLine", label: "Buddy line", side: "front" as const, x: 68, y: 45 },
  { key: "liftingStrop", label: "Rescue strop", side: "front" as const, x: 50, y: 18 },
  { key: "botas", label: "Botas / sola", side: "front" as const, x: 42, y: 92 },
  { key: "costuras", label: "Costuras virilha", side: "front" as const, x: 50, y: 62 },
  { key: "buoyancy", label: "Buoyancy", side: "back" as const, x: 50, y: 40 },
  { key: "tecidoExterior", label: "Material costas", side: "back" as const, x: 50, y: 55 },
  { key: "fitasReflectorasB", label: "Fitas costas", side: "back" as const, x: 50, y: 25 },
] as const;

export const BER_CODES: Array<{ code: string; label: string }> = [
  { code: "1", label: "Reparação economicamente inviável — decisão técnica" },
  { code: "2", label: "Geralmente gasto / worn out" },
  { code: "4", label: "Zip frontal defeituoso" },
  { code: "5", label: "Zips defeituosos" },
  { code: "6", label: "Reflexos defeituosos" },
  { code: "7", label: "Costura / selagem defeituosa" },
  { code: "8", label: "Wrist seals defeituosos" },
  { code: "9", label: "Botas defeituosas" },
  { code: "10", label: "Socks defeituosos" },
  { code: "11", label: "Collar/hood defeituoso" },
  { code: "12", label: "Lining defeituoso" },
  { code: "13", label: "Furos no tecido" },
  { code: "14", label: "Espuma flutuação defeituosa" },
  { code: "15", label: "Luz defeituosa" },
  { code: "16", label: "Tecido decomposto" },
  { code: "17", label: "Danos por exercício/demo" },
  { code: "18", label: "Efeito forte de calor" },
  { code: "19", label: "Mofo / mildew" },
  { code: "20", label: "Outros" },
];

export const LEAK_METHODS = [
  { value: "soap_air", label: "Ar + água com sabão" },
  { value: "water_tank", label: "Tanque de água" },
  { value: "pressure_hold", label: "Retenção de pressão / ΔP" },
  { value: "water_bench", label: "Bancada de pressão de água" },
] as const;

export const LEAK_PRESSURE_PRESETS = [
  { label: "Lalizas MSC 0,7–1,4 kPa", kpa: "1.0", mbar: "10" },
  { label: "Viking 20 mbar", kpa: "2.0", mbar: "20" },
  { label: "Crewsaver 2,0 kPa", kpa: "2.0", mbar: "20" },
  { label: "Gore-Tex 25–30 mbar", kpa: "2.5", mbar: "25" },
] as const;

export function defaultChecklist(): Record<string, ChecklistResult> {
  return {};
}

/** Próxima inspeção: <10 anos → 36 meses; ≥10 anos ou uso regular → 12 meses */
export function computeNextServiceDate(
  dataInspecao: string,
  dataFabrico?: string | null,
  usoRegular = false,
  intervaloMesesOverride?: number | null
): { dataProx: string; meses: number } {
  const base = new Date(dataInspecao);
  if (Number.isNaN(base.getTime())) {
    const t = new Date();
    t.setFullYear(t.getFullYear() + 1);
    return { dataProx: t.toISOString().slice(0, 10), meses: 12 };
  }

  let meses = intervaloMesesOverride && intervaloMesesOverride > 0 ? intervaloMesesOverride : 36;
  if (usoRegular) meses = 12;

  if (dataFabrico) {
    const fab = new Date(dataFabrico);
    if (!Number.isNaN(fab.getTime())) {
      const ageYears = (base.getTime() - fab.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageYears >= 10) meses = 12;
    }
  }

  const next = new Date(base);
  next.setMonth(next.getMonth() + meses);
  return { dataProx: next.toISOString().slice(0, 10), meses };
}

export function evaluateOverallResult(
  checklist: Record<string, string>,
  leakResultado?: string | null,
  codigoBER?: string | null,
  leakReTest?: string | null,
  leakMetodo?: string | null
): "OK" | "REPARAR" | "BER" {
  if (codigoBER) return "BER";
  if (leakResultado === "BER") return "BER";
  if (leakResultado === "Reprovado") return "REPARAR";
  const values = Object.values(checklist || {});
  if (values.some((v) => v === "F" || v === "S")) {
    if (leakResultado === "Fuga" || leakResultado === "Reprovado (Fuga)") return "REPARAR";
    return "REPARAR";
  }
  if (leakResultado === "Fuga" || leakResultado === "Reprovado (Fuga)") return "REPARAR";
  if (leakResultado !== "OK" && leakResultado !== "Aprovado") return "REPARAR";
  if (!LEAK_METHODS.some((method) => method.value === leakMetodo)) return "REPARAR";
  if (FATO_CHECKLIST_ITEMS.some((item) => !["OK", "R", "N/A"].includes(checklist?.[item.key]))) return "REPARAR";
  if (checklist.impermeabilidade !== "OK") return "REPARAR";
  if ((values.includes("R") || leakReTest === "Pendente" || leakReTest === "Falha") && leakReTest !== "OK") return "REPARAR";
  return "OK";
}

export const FATO_PECAS_CATALOGO = [
  { ref: "FI-LUZ-L6", desc: "Luz emergência L6 / McMurdo", marca: "McMurdo" },
  { ref: "FI-APITO-MW2", desc: "Apito MW2", marca: "Crewsaver" },
  { ref: "FI-BUDDY-2M", desc: "Buddy line 2 m", marca: "Crewsaver" },
  { ref: "FI-TOGGLE", desc: "Toggle buddy line", marca: "Crewsaver" },
  { ref: "FI-LUVAS-LATEX", desc: "Luvas látex (par)", marca: "Crewsaver" },
  { ref: "FI-OVERGLOVE", desc: "Over-glove neoprene", marca: "Crewsaver" },
  { ref: "FI-STROP-U", desc: "Lifting strop universal", marca: "Crewsaver" },
  { ref: "FI-TAPE-RETRO", desc: "Fita retro-refletora", marca: "Crewsaver" },
  { ref: "FI-PATCH-NEO", desc: "Kit patches neoprene", marca: "Crewsaver" },
  { ref: "FI-BEESWAX", desc: "Beeswax / grease stick zip", marca: "Crewsaver" },
  { ref: "FI-FACE-PLATE", desc: "Face plate / sealing tool", marca: "Lalizas" },
  { ref: "FI-KIT-70168", desc: "Inspection device kit 70168", marca: "Lalizas" },
  { ref: "FI-WRIST-CODAN", desc: "Wrist seal Codan", marca: "Viking" },
  { ref: "FI-NEO-RIBBON", desc: "Fita neoprene reparação", marca: "Viking" },
] as const;
