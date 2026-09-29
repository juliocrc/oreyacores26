"use client";
import React, { useState, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  MinusCircle,
  ChevronRight,
  Maximize2,
  X,
  Link2,
} from "lucide-react";
import WPTestPanel from "./WPTestPanel";
import LiferaftHotspotDiagram from "./LiferaftHotspotDiagram";
import { getModelShape } from "./LiferaftSvgDiagram";
import type { ComponentKey, ComponentStatus, LightType, LiferaftDiagramProps } from "@/types/liferaft-diagram";
import { LIGHT_TYPE_OPTIONS } from "@/types/liferaft-diagram";
import { isNonExpiring, fmt, fmtPeso, fmtDate, getDateStatus, parseApproval } from "@/lib/liferaft-diagram-helpers";

export default function LiferaftDiagram({ jangada, artigos, checklist = {} }: LiferaftDiagramProps) {
  const [hoveredKey, setHoveredKey]   = useState<ComponentKey | null>(null);
  const [selectedKey, setSelectedKey] = useState<ComponentKey | null>(null);
  const [modalOpen, setModalOpen]     = useState(false);

  /* ── Checklist (registo da inspeção) — itens com {status, validade, voltagem, referencia} ── */
  const checkRecord = checklist as Record<string, unknown>;
  const chkItem = (key: string): Record<string, unknown> =>
    checkRecord[key] && typeof checkRecord[key] === "object"
      ? (checkRecord[key] as Record<string, unknown>)
      : typeof checkRecord[key] === "string"
      ? { status: checkRecord[key] }
      : {};
  const chkVal = (key: string, field: string): string =>
    String(checkRecord[`${key}_${field}`] ?? chkItem(key)[field] ?? "");

  /** Mapeia estados do wizard (OK/SUBSTITUIDO/REPROVADO/NA) para o diagrama */
  const mapChkStatus = (raw: unknown): "OK" | "WARNING" | "CRITICAL" | "NONE" | null =>
    raw == null || String(raw).trim() === "" ? null
    : String(raw).trim().toUpperCase() === "OK" || String(raw).trim().toUpperCase() === "SUBSTITUIDO" ? "OK"
    : String(raw).trim().toUpperCase() === "REPROVADO" ? "CRITICAL"
    : String(raw).trim().toUpperCase() === "NA" || String(raw).trim().toUpperCase() === "N/A" ? "NONE"
    : null;

  const luzExtChk = chkItem("luz_exterior_bateria");
  const luzIntChk = chkItem("luz_interior_bateria");

  // Light type: prefer checklist/registo (NA → sem luz), senão jangada.lightType, senão "automatic"
  const [lightType, setLightType] = useState<LightType>(() => {
    const st = String(luzExtChk.status || "").toUpperCase();
    if (st === "NA" || st === "N/A") return "none";
    return (jangada.lightType as LightType) ?? "automatic";
  });
  const [nowMs] = useState(() => Date.now());

  /* ── Compute statuses from real checklist fields ── */
  const isNAPOk   = parseApproval(jangada.testeNAP);
  const isWPOk    = parseApproval(jangada.testeWP);
  const isFSOk    = parseApproval(jangada.testeFS);  // Flotation stability
  const isDLOk    = parseApproval(jangada.testeDL);  // Drain / Launch test
  const cylSt     = getDateStatus(jangada.cylinderDataProxTeste);
  const hruSt     = getDateStatus(jangada.hruValidade);

  // Aplicabilidade da HRU (SIM/NAO) vem do wizard/checklist — se NAO, não é N/D nem crítico
  const _chk = checklist as Record<string, unknown>;
  const hruNaoAplicavel =
    (typeof _chk._hruAplicavel === "string" && _chk._hruAplicavel.trim() !== ""
      ? _chk._hruAplicavel
      : typeof _chk.hru_aplicavel === "string" && _chk.hru_aplicavel.trim() !== ""
      ? _chk.hru_aplicavel
      : (jangada as Record<string, unknown>).hruAplicavel ?? "") === "NAO";

  // Estado das luzes exterior/interior sincronizado com o wizard (status + validade + voltagem)
  const luzExtStatus = mapChkStatus(luzExtChk.status);
  const luzExtValidade = chkVal("luz_exterior_bateria", "validade");
  const luzExtValSt = luzExtValidade ? getDateStatus(luzExtValidade) : null;
  const luzExtNaoAplicavel = String(luzExtChk.status || "").toUpperCase() === "NA" || String(luzExtChk.status || "").toUpperCase() === "N/A";

  const luzIntStatus = mapChkStatus(luzIntChk.status);
  const luzIntValidade = chkVal("luz_interior_bateria", "validade");
  const luzIntValSt = luzIntValidade ? getDateStatus(luzIntValidade) : null;

  // Restantes itens do checklist (estado físico registado pelo inspetor)
  const chkCompStatus = (key: string): "OK" | "WARNING" | "CRITICAL" | "NONE" | null =>
    mapChkStatus(chkItem(key).status);
  const chkCompNaoAplicavel = (key: string): boolean =>
    ["NA", "N/A"].includes(String(chkItem(key).status || "").toUpperCase());

  const rightingSt = chkCompStatus("sistema_endireitar");
  const ballastSt = chkCompStatus("bolsas_estabilizacao");
  const rampSt = chkCompStatus("escada_borda") ?? chkCompStatus("escada_entrada");
  const painterSt = chkCompStatus("weak_link_painter") ?? chkCompStatus("painter_reserva");
  const reflectorSt = chkCompStatus("refletores") ?? chkCompStatus("tubo_identificacao");

  const lightSt: "OK" | "WARNING" | "CRITICAL" | "NONE" =
    luzExtNaoAplicavel || luzExtStatus === "NONE" ? "NONE"
    : lightType === "none" ? "NONE"
    : luzExtStatus === "CRITICAL" || luzExtValSt === "CRITICAL" ? "CRITICAL"
    : luzExtStatus === "OK" && luzExtValSt !== "WARNING" ? "OK"
    : "WARNING";

  // Pressure test — upper chamber
  const calcQuedaVal = (inicio: unknown, fim: unknown, origQueda: unknown) => {
    const ini = parseFloat(String(inicio || '').replace(',', '.'));
    const f = parseFloat(String(fim || '').replace(',', '.'));
    if (isNaN(ini) || isNaN(f)) {
      const origStr = String(origQueda || '').trim();
      return origStr && !origStr.includes('[object') ? origStr : '—';
    }
    return (ini - f).toFixed(1).replace(/\.0+$/, '');
  };

  const wpSuperiorInicio  = fmt(jangada.testeWPCamaraSuperiorInicio,  " hPa");
  const wpSuperiorFim     = fmt(jangada.testeWPCamaraSuperiorFim,     " hPa");
  const wpSuperiorQueda   = fmt(calcQuedaVal(jangada.testeWPCamaraSuperiorInicio, jangada.testeWPCamaraSuperiorFim, jangada.testeWPCamaraSuperiorQueda), " hPa");
  // Pressure test — lower chamber
  const wpInferiorInicio  = fmt(jangada.testeWPCamaraInferiorInicio,  " hPa");
  const wpInferiorFim     = fmt(jangada.testeWPCamaraInferiorFim,     " hPa");
  const wpInferiorQueda   = fmt(calcQuedaVal(jangada.testeWPCamaraInferiorInicio, jangada.testeWPCamaraInferiorFim, jangada.testeWPCamaraInferiorQueda), " hPa");
  // Atmosférica
  const wpAtmInicial      = fmt(jangada.testeWPPressaoAtmosfericaInicial, " hPa");
  const wpAtmFinal        = fmt(jangada.testeWPPressaoAtmosfericaFinal,   " hPa");
  // Workshop conditions
  const wkTemp            = fmt(jangada.oficinaTemperatura, " °C");
  const wkHum             = fmt(jangada.oficinaHumidade,   " %");

  // Emergency pack — expiry + quantity validation
  let packSt: "OK" | "WARNING" | "CRITICAL" | "NONE" = artigos.length ? "OK" : "NONE";
  let expiredCnt = 0, warnCnt = 0, shortageCnt = 0;
  const capacity = Number(jangada.capacity || 0);
  
  // Quantity expectations per pack type (key items that must scale with capacity)
  const getRequiredQuantity = (name: string): number | null => {
    const n = name.toLowerCase().trim();
    if (capacity <= 0) return null;
    // Comprimidos para enjoo: 6 per person
    if (n.includes('comprimid') && (n.includes('enjoo') || n.includes('enj'))) return Math.ceil(6 * capacity);
    // Saco de água: 3 per person
    if ((n.includes('saco') && n.includes('água')) || (n.includes('saco') && n.includes('agua'))) return Math.ceil(3 * capacity);
    // Rações: 1 per person
    if (n.includes('ração') || n.includes('racao') || n.includes('ration')) return capacity;
    // Sacos de enjoo: 1 per person
    if (n.includes('saco') && n.includes('enjoo')) return capacity;
    // Ajudas térmicas: 10% capacity, min 2
    if (n.includes('ajuda') && n.includes('térmic')) return Math.max(2, Math.ceil(0.1 * capacity));
    return null;
  };

  for (const a of artigos) {
    if (isNonExpiring(a.name)) continue;
    if (a.validade) {
      const d = Math.ceil((new Date(a.validade).getTime() - nowMs) / 86_400_000);
      if (d < 0)      { expiredCnt++; packSt = "CRITICAL"; }
      else if (d <= 90) { warnCnt++; if (packSt !== "CRITICAL") packSt = "WARNING"; }
    }
    // Check quantity against capacity requirements
    const required = getRequiredQuantity(a.name);
    if (required !== null && a.quantidade !== undefined && a.quantidade < required) {
      shortageCnt++;
      if (packSt === "OK") packSt = "WARNING";
    }
  }

  /* ── Component map ── */
  const components = useMemo<Record<ComponentKey, ComponentStatus>>(() => ({

    /* ① Canopy — tested via NAP (costuras) + FS (flotation stability) + DL (launch) */
    canopy: {
      key:   "canopy",
      label: "Tenda / Cobertura (Canopy)",
      status: isNAPOk === "OK" && isFSOk !== "CRITICAL"
        ? "OK"
        : isNAPOk === "CRITICAL" ? "CRITICAL"
        : isNAPOk === "NONE"    ? "NONE" : "WARNING",
      desc: isNAPOk === "OK"
        ? "Ensaio NAP aprovado — costuras, fechos e arcos de tenda conformes."
        : isNAPOk === "CRITICAL"
        ? "Ensaio NAP reprovado — costuras ou fechos não conformes."
        : "Ensaio NAP ainda não realizado ou registo em falta.",
      icon: "⛺",
      specs: [
        { name: "Teste NAP (Costuras)",   value: fmt(jangada.testeNAP) },
        { name: "Teste FS (Estabilidade)", value: fmt(jangada.testeFS) },
        { name: "Teste DL (Lançamento)",   value: fmt(jangada.testeDL) },
        { name: "Teste GI (Gonflagem)",    value: fmt(jangada.testeGI) },
        { name: "Temp. Câmara Sup.",       value: fmt(jangada.testeTemperaturaCamaraSuperior, " °C") },
        { name: "Temp. Câmara Inf.",       value: fmt(jangada.testeTemperaturaCamaraInferior, " °C") },
        { name: "Unidade Pressão WP",     value: fmt(jangada.testeWPUnidadePressao || "hPa") },
        { name: "Manómetro",              value: fmt(jangada.testeWPInstrumento) },
      ],
      pos: [46, 30],  // orange canopy center
    },

    /* ② Exterior Light — apex of canopy (SOLAS: auto-activating white flashing light) */
    exteriorLight: {
      key:   "exteriorLight",
      label: "Luz Exterior (Canopy Light)",
      status: lightSt,
      naAplicavel: luzExtNaoAplicavel || (lightType === "none" && luzExtStatus !== "OK"),
      desc: luzExtNaoAplicavel
        ? "Sem luz exterior instalada (não aplicável) — jangada sem iluminação no coberto."
        : lightType === "automatic"
        ? "Luz automática SOLAS — activa com a inflagem, mínimo 4,3 cd / 50-70 flashes/min / 12h."
        : lightType === "battery"
        ? "Bateria de luz manual — verificar carga e validade conforme manual do fabricante."
        : "Sem luz registada — não conforme com SOLAS LSA Code.",
      icon: "💡",
      specs: [
        { name: "Tipo de Luz",        value: LIGHT_TYPE_OPTIONS.find(o => o.value === lightType)?.label ?? "—" },
        { name: "Referência",         value: chkVal("luz_exterior_bateria", "referencia") || fmt(chkItem("luz_exterior_bateria").stockId) || "—" },
        { name: "Estado (Checklist)", value: fmt(luzExtChk.status) || "—" },
        { name: "Validade Bateria",   value: luzExtValidade || "—" },
        { name: "Voltagem Medida",    value: chkVal("luz_exterior_bateria", "voltagem") || "—" },
        { name: "Intensidade Mínima", value: "4,3 cd (SOLAS)" },
        { name: "Cadência",           value: "50–70 flashes/min" },
        { name: "Autonomia Mínima",   value: "12 horas" },
      ],
      pos: [50, 7],   // top of canopy apex — where "light" label is in the photo
    },

    /* ③ Upper Chamber — WP pressure test */
    upperChamber: {
      key:   "upperChamber",
      label: "Câmara Inflável Superior",
      status: isWPOk === "OK" ? "OK" : isWPOk === "CRITICAL" ? "CRITICAL" : "NONE",
      desc: isWPOk === "OK"
        ? "Ensaio WP aprovado — pressão e estanqueidade da câmara superior conformes."
        : isWPOk === "CRITICAL"
        ? "Ensaio WP reprovado — câmara superior não estanque ou queda de pressão excessiva."
        : "Ensaio WP sem resultado registado.",
      icon: "⭕",
      specs: [
        { name: "Resultado WP",           value: fmt(jangada.testeWP) },
        { name: "Pressão Inicial",        value: wpSuperiorInicio },
        { name: "Pressão Final",          value: wpSuperiorFim },
        { name: "Queda Registada",        value: wpSuperiorQueda },
        { name: "Pressão Atmosférica Ini.",value: wpAtmInicial },
        { name: "Pressão Atmosférica Fin.",value: wpAtmFinal },
        { name: "Temp. Inicial",          value: fmt(jangada.testeWPTemperaturaInicial, " °C") },
        { name: "Temp. Final",            value: fmt(jangada.testeWPTemperaturaFinal, " °C") },
        { name: "Instrumento",            value: fmt(jangada.testeWPInstrumento) },
        { name: "Hora Início",            value: fmt(jangada.testeWPHoraInicio) },
        { name: "Hora Fim",               value: fmt(jangada.testeWPHoraFim) },
      ],
      pos: [79, 46],  // right visible side of buoyancy tube
    },

    /* ④ Lower Chamber / Pressure Relief Valves */
    lowerChamber: {
      key:   "lowerChamber",
      label: "Câmara Inflável Inferior / Válvulas de Alívio",
      status: isWPOk === "OK" ? "OK" : isWPOk === "CRITICAL" ? "CRITICAL" : "NONE",
      desc: isWPOk === "OK"
        ? "Câmara inferior conforme — válvulas de alívio operacionais."
        : isWPOk === "CRITICAL"
        ? "Câmara inferior com anomalia de pressão ou válvulas defeituosas."
        : "Sem resultado de ensaio registado.",
      icon: "🔵",
      specs: [
        { name: "Resultado WP",         value: fmt(jangada.testeWP) },
        { name: "Pressão Inicial",      value: wpInferiorInicio },
        { name: "Pressão Final",        value: wpInferiorFim },
        { name: "Queda Registada",      value: wpInferiorQueda },
        { name: "Pressão Atmosférica Ini.",value: wpAtmInicial },
        { name: "Pressão Atmosférica Fin.",value: wpAtmFinal },
        { name: "Temp. Inicial",        value: fmt(jangada.testeWPTemperaturaInicial, " °C") },
        { name: "Temp. Final",          value: fmt(jangada.testeWPTemperaturaFinal, " °C") },
        { name: "Válvulas de Alívio",   value: fmt(jangada.valvulasAlivio) },
        { name: "Válvulas Atestar",     value: fmt(jangada.valvulasAtestar) },
        { name: "Pressão Câm. Inf.",    value: fmt(jangada.testePressaoCamaraInferior, " hPa") },
        { name: "Hora Início",          value: fmt(jangada.testeWPHoraInicio) },
        { name: "Hora Fim",             value: fmt(jangada.testeWPHoraFim) },
      ],
      pos: [21, 57],  // pressure relief valves — left of black tube
    },

    /* ⑤ CO₂ Cylinder — hydrostatic test date */
    cylinder: {
      key:   "cylinder",
      label: "Cilindro de Inflação CO₂ / N₂",
      status: cylSt,
      desc: cylSt === "OK"       ? "Cilindro dentro da validade do teste hidráulico e peso conforme."
          : cylSt === "WARNING"  ? "Teste hidráulico do cilindro expira em menos de 90 dias."
          : cylSt === "CRITICAL" ? "Cilindro com teste hidráulico expirado — substituição urgente!"
          : "Sem data de próximo teste registada.",
      icon: "🧪",
      specs: [
        { name: "Nº de Série",         value: fmt(jangada.cylinderSerial) },
        { name: "Sistema",             value: fmt(jangada.cylinderSistema) },
        { name: "Tara",                value: fmtPeso(jangada.cylinderTara, " kg") },
        { name: "Peso Bruto",          value: fmtPeso(jangada.cylinderPesoBruto, " kg") },
        { name: "CO₂",                 value: fmtPeso(jangada.cylinderCo2, " kg") },
        { name: "N₂",                  value: fmtPeso(jangada.cylinderN2) },
        { name: "Data Teste",          value: fmtDate(jangada.cylinderDataTeste) },
        { name: "Próximo Teste",       value: fmtDate(jangada.cylinderDataProxTeste) },
        { name: "Ref. Cabeça Disparo", value: fmt(jangada.cylinderCabecaDisparoRef) },
        { name: "Nº Série Cabeça",     value: fmt(jangada.cylinderCabecaDisparoSerial) },
      ],
      pos: [30, 77],  // base / water pockets area — cylinder stored underneath
    },

    /* ⑥ HRU — OUTSIDE the raft, on the cradle/lashing system */
    hru: {
      key:   "hru",
      label: "HRU (Válvula Hidrostática)",
      status: hruNaoAplicavel ? "NONE" : hruSt,
      naAplicavel: hruNaoAplicavel,
      desc: hruNaoAplicavel
        ? "HRU não instalada — jangada sem válvula hidrostática (não aplicável)."
        : hruSt === "OK"
        ? "HRU dentro da validade — actua automaticamente até 4m de profundidade."
        : hruSt === "WARNING"
        ? "HRU expira em menos de 90 dias — agendar substituição."
        : hruSt === "CRITICAL"
        ? "HRU expirado — não conforme. Substituição imediata obrigatória (SOLAS)."
        : "Sem data de validade da HRU registada.",
      icon: "🔗",
      external: true,
      externalNote: "Exterior ao contentor — fixo ao berço do navio (cradle)",
      specs: [
        { name: "Aplicabilidade",     value: hruNaoAplicavel ? "NÃO APLICÁVEL" : "Instalada" },
        { name: "Modelo / Ref.",      value: fmt(jangada.hruReferencia) },
        { name: "Nº de Série",        value: fmt(jangada.hruSerial ?? jangada.hruDataInstalacao) },
        { name: "Data Instalação",    value: fmtDate(jangada.hruDataInstalacao) },
        { name: "Validade",           value: fmtDate(jangada.hruValidade) },
        { name: "Profundidade Activa","value": "1,5 – 4 m (SOLAS)" },
        { name: "Ciclo Substituição", value: "2–3 anos (fabricante)" },
      ],
      pos: [6, 48],
    },

    /* ⑦ Emergency Pack / Survival Kit */
    emergencyPack: {
      key:   "emergencyPack",
      label: "Saco / Contentor de Sobrevivência",
      status: packSt,
      desc: packSt === "OK"       ? `Todos os ${artigos.length} consumíveis dentro da validade e quantidade conforme lotação (${capacity} pax).`
          : packSt === "WARNING"  ? `${warnCnt} artigo(s) a expirar nos próximos 90 dias${shortageCnt > 0 ? ` + ${shortageCnt} com quantidade insuficiente` : ""}.`
          : packSt === "CRITICAL" ? `${expiredCnt} artigo(s) com validade ultrapassada!${shortageCnt > 0 ? ` + ${shortageCnt} com quantidade insuficiente` : ""}.`
          : "Sem artigos de sobrevivência registados.",
      icon: "💼",
      specs: [
        { name: "Total Artigos",  value: `${artigos.length} unidades` },
        { name: "Dentro Validade",value: `${artigos.length - expiredCnt - warnCnt}` },
        { name: "A Expirar",      value: `${warnCnt}` },
        { name: "Expirados",      value: `${expiredCnt}` },
        { name: "Qtd. Insuficiente", value: `${shortageCnt}` },
        { name: "Tipo Pack",      value: fmt(jangada.packType) },
        { name: "Lotação",        value: `${capacity} pax` },
        { name: "Cond. Oficina",  value: wkTemp !== "—" ? `${wkTemp} / ${wkHum}` : "—" },
      ],
      pos: [74, 81],  // boarding ramp — pack stored here
    },

    /* ⑧ Interior Light (Luz de cortesia interior SOLAS) */
    interiorLight: {
      key:   "interiorLight",
      label: "Luz Interior (Courtesy Light)",
      status:
        String(luzIntChk.status || "").toUpperCase() === "NA" || String(luzIntChk.status || "").toUpperCase() === "N/A"
          ? "NONE"
          : lightType === "none" && String(luzIntChk.status || "").toUpperCase() === ""
          ? "NONE"
          : luzIntValSt === "CRITICAL" || luzIntStatus === "CRITICAL"
          ? "CRITICAL"
          : luzIntStatus === "OK" && luzIntValSt !== "WARNING"
          ? "OK"
          : luzIntValSt === "WARNING" || luzIntStatus === "OK"
          ? "WARNING"
          : "NONE",
      naAplicavel: String(luzIntChk.status || "").toUpperCase() === "NA" || String(luzIntChk.status || "").toUpperCase() === "N/A",
      desc: String(luzIntChk.status || "").toUpperCase() === "NA" || String(luzIntChk.status || "").toUpperCase() === "N/A"
        ? "Sem luz interior instalada (não aplicável)."
        : luzIntValSt === "CRITICAL"
        ? "Bateria da luz interior expirada — substituir."
        : "Luz interior SOLAS — ativação automática na inflagem, mínimo 0,5 cd por 12 horas para leitura de instruções de sobrevivência.",
      icon: "🏮",
      specs: [
        { name: "Referência",      value: chkVal("luz_interior_bateria", "referencia") || fmt(chkItem("luz_interior_bateria").stockId) || "—" },
        { name: "Estado (Checklist)", value: fmt(luzIntChk.status) || "—" },
        { name: "Validade Bateria", value: luzIntValidade || "—" },
        { name: "Voltagem Medida",  value: chkVal("luz_interior_bateria", "voltagem") || "—" },
        { name: "Intensidade Mín.", value: "0,5 cd (SOLAS)" },
        { name: "Autonomia Mín.",   value: "12 horas" },
        { name: "Ativação",         value: "Automática" }
      ],
      pos: [38, 22],
    },

    /* ⑨ Bolsas de Estabilização (Ballast/Water Pockets) */
    ballastPockets: {
      key:   "ballastPockets",
      label: "Bolsas de Estabilização (Lastro)",
      status: ballastSt ?? "OK",
      naAplicavel: chkCompNaoAplicavel("bolsas_estabilizacao"),
      desc: ballastSt === "CRITICAL"
        ? "Bolsas de estabilização reprovadas na inspeção — verificar reforço e fixações."
        : ballastSt === "NONE"
        ? "Bolsas de estabilização sem estado registado (não aplicável / não verificadas)."
        : "Bolsas de estabilização de água na base inferior da jangada. Enchem automaticamente para oferecer lastro contra capotamentos por rajadas de vento.",
      icon: "🪣",
      specs: [
        { name: "Estado (Checklist)", value: fmt(chkItem("bolsas_estabilizacao").status) || "OK" },
        { name: "Qtd. Mínima", value: "4 bolsas (SOLAS)" },
        { name: "Volume Mín.", value: "25 Litros cada (SOLAS)" },
        { name: "Material",    value: "Tecido impermeável pesado" }
      ],
      pos: [65, 54],
    },

    /* ⑪ Âncora Flutuante (Sea Anchor / Drogue) */
    seaAnchor: {
      key:   "seaAnchor",
      label: "Âncora Flutuante (Deriva)",
      status: "OK",
      desc: "Âncora flutuante cónica com cabo de 30m. Lançada ao mar para reduzir a deriva da jangada e mantê-la de frente para a ondulação.",
      icon: "⚓",
      specs: [
        { name: "Cabo de Nylon",   value: "30 metros (SOLAS)" },
        { name: "Quantidade",      value: "2 unidades (1 sobressalente)" },
        { name: "Estabilização",   value: "Redução de deriva" }
      ],
      pos: [9, 58],
    },

    /* ⑫ Teste GI (Gas Inflation) — inflação a gás */
    gasInflation: {
      key:   "gasInflation",
      label: "Teste GI (Inflação a Gás)",
      status: parseApproval(jangada.testeGI),
      desc: parseApproval(jangada.testeGI) === "OK"
        ? "Ensaio de inflação a gás aprovado — cilindro e sistema de inflagem operacionais."
        : parseApproval(jangada.testeGI) === "CRITICAL"
        ? "Ensaio GI reprovado — sistema de inflação com anomalia."
        : "Ensaio GI ainda não realizado ou registo em falta.",
      icon: "💨",
      specs: [
        { name: "Resultado GI",      value: fmt(jangada.testeGI) },
        { name: "Cilindro CO₂",      value: fmtPeso(jangada.cylinderCo2, " kg") },
        { name: "Sistema",           value: fmt(jangada.cylinderSistema) },
        { name: "Ref. Cabeça Disparo", value: fmt(jangada.cylinderCabecaDisparoRef) },
        { name: "Nº Série Cabeça",     value: fmt(jangada.cylinderCabecaDisparoSerial) },
      ],
      pos: [36, 73],
    },

    /* ⑬ Teste DL (Davit Launch) — lançamento por davit */
    davitLoad: {
      key:   "davitLoad",
      label: "Teste DL (Lançamento Davit)",
      status: isDLOk,
      desc: isDLOk === "OK"
        ? "Ensaio de lançamento por davit aprovado — sistema de retenção e soltura conformes."
        : isDLOk === "CRITICAL"
        ? "Ensaio DL reprovado — mecanismo de lançamento com defeito."
        : "Ensaio DL sem resultado registado.",
      icon: "🏗️",
      specs: [
        { name: "Resultado DL",    value: fmt(jangada.testeDL) },
        { name: "Tipo Lançamento", value: fmt(jangada.launchType) },
        { name: "Altura Máx.",     value: fmt(jangada.maxStowageHeight, " m") },
      ],
      pos: [68, 20],
    },

    /* ⑭ Painter Line / Cabo de Retenida */
    painterLine: {
      key:   "painterLine",
      label: "Cabo de Retenida (Painter Line)",
      status: painterSt ?? "OK",
      naAplicavel: chkCompNaoAplicavel("weak_link_painter") || chkCompNaoAplicavel("painter_reserva"),
      desc: painterSt === "CRITICAL"
        ? "Ponta fracável (weak link) ou painter reprovado na inspeção — substituição obrigatória."
        : painterSt === "NONE"
        ? "Painter/ponta fracável sem estado registado (não verificados)."
        : "Cabo de retenida que liga a jangada ao navio. Triggers the inflation mechanism when pulled. Deve ter comprimento suficiente para permitir a inflagem antes de se soltar.",
      icon: "🪢",
      specs: [
        { name: "Estado (Checklist)", value: fmt(chkItem("weak_link_painter").status) || fmt(chkItem("painter_reserva").status) || "OK" },
        { name: "Comprimento", value: fmt(jangada.painterLength, " m") },
        { name: "Ponta Fracável", value: "2,2 ± 0,4 kN (LSA 4.1.6.2)" },
        { name: "SOLAS",       value: "≥ comprimento necessário para davit" },
      ],
      pos: [13, 36],
    },

    /* ⑮ Radar Reflector */
    radarReflector: {
      key:   "radarReflector",
      label: "Refletor de Radar",
      status: reflectorSt === "CRITICAL"
        ? "CRITICAL"
        : reflectorSt === "NONE" && jangada.radarReflectorValidade
        ? "NONE"
        : jangada.radarReflectorValidade
        ? getDateStatus(jangada.radarReflectorValidade)
        : reflectorSt ?? "NONE",
      naAplicavel: chkCompNaoAplicavel("refletores"),
      desc: reflectorSt === "CRITICAL"
        ? "Refletores reprovados na inspeção — não conformes."
        : jangada.radarReflectorValidade
        ? `Refletor de radar SOLAS — validade: ${fmtDate(jangada.radarReflectorValidade)}. Melhora a visibilidade em radar para resgate.`
        : chkCompNaoAplicavel("refletores")
        ? "Refletores não aplicáveis / não registados."
        : "Sem refletor de radar registado.",
      icon: "📡",
      specs: [
        { name: "Estado (Checklist)", value: fmt(chkItem("refletores").status) || "—" },
        { name: "Modelo",    value: fmt(jangada.radarReflector) },
        { name: "Validade",  value: fmtDate(jangada.radarReflectorValidade) },
        { name: "Função",    value: "Reflexão de sinal de radar" },
        { name: "SOLAS",     value: "Obrigatório para jangadas ≥6 pax" },
      ],
      pos: [83, 13],
    },

    /* ⑯ Rampa de Embarque (Boarding Ramp) */
    boardingRamp: {
      key:   "boardingRamp",
      label: "Rampa / Escada de Embarque",
      status: rampSt ?? "OK",
      naAplicavel: chkCompNaoAplicavel("escada_borda") || chkCompNaoAplicavel("escada_entrada"),
      desc: rampSt === "CRITICAL"
        ? "Rampa/escada de embarque reprovada na inspeção — insegura para entrada a partir da água."
        : rampSt === "NONE"
        ? "Rampa/escada sem estado registado (não aplicável / não verificada)."
        : "Rampa de embarque com degraus e cordas de agarre. Permite o acesso seguro à jangada a partir da água. Inclui escada de entrada e pegas de mão.",
      icon: "🪜",
      specs: [
        { name: "Estado (Checklist)", value: fmt(chkItem("escada_borda").status) || fmt(chkItem("escada_entrada").status) || "OK" },
        { name: "Tipo",          value: "Rampa + Escada" },
        { name: "Degraus",       value: "3–5 degraus (SOLAS)" },
        { name: "Pegas de Mão",  value: "Cordas laterais" },
        { name: "Material",      value: "Tecido reforçado antiderrapante" },
      ],
      pos: [50, 86],
    },

    /* ⑰ Sistema de Endireitar (Righting System) */
    rightingSystem: {
      key:   "rightingSystem",
      label: "Sistema de Endireitar",
      status: rightingSt ?? (artigos.some((a: { name?: string }) => /endireitar|righting/i.test(a.name || "")) ? "OK" : "NONE"),
      naAplicavel: chkCompNaoAplicavel("sistema_endireitar"),
      desc: rightingSt === "CRITICAL"
        ? "Sistema de endireitar reprovado na inspeção."
        : rightingSt === "NONE"
        ? "Sistema de endireitar sem estado registado."
        : "Sistema de endireitar (righting strap) — faixa sob a jangada que permite ao pessoal virá-la caso fique invertida na água.",
      icon: "🔄",
      specs: [
        { name: "Estado (Checklist)", value: fmt(chkItem("sistema_endireitar").status) || (artigos.some((a: { name?: string }) => /endireitar|righting/i.test(a.name || "")) ? "OK" : "—") },
        { name: "Função",     value: "Endireitar jangada invertida" },
        { name: "Posição",    value: "Inferior — sob a plataforma" },
        { name: "SOLAS",      value: "Obrigatório para todas as jangadas" },
      ],
      pos: [50, 96],
    },

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [jangada, artigos, lightType, expiredCnt, warnCnt,
       isNAPOk, isWPOk, isFSOk, isDLOk, cylSt, hruSt, lightSt,
       checklist, hruNaoAplicavel, luzExtStatus, luzExtValSt, luzExtNaoAplicavel,
       luzIntStatus, luzIntValSt, lightSt, rightingSt, ballastSt, rampSt, painterSt, reflectorSt]);

  const activeKey  = hoveredKey || selectedKey;
  const activeComp = activeKey ? components[activeKey] : null;
  const modelShape = getModelShape(jangada.brand, jangada.model);

  /* ── Compliance score ── */
  const score = useMemo(() => {
    let s = 100;
    Object.values(components).forEach((c) => {
      if (c.naAplicavel) return; // não aplicável não penaliza
      if (c.status === "CRITICAL") s -= 22;
      else if (c.status === "WARNING") s -= 8;
      else if (c.status === "NONE")    s -= 4;
    });
    return Math.max(0, s);
  }, [components]);

  const scoreColor = score >= 90 ? "#10b981" : score >= 65 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 28;

  /* ── Dot styling ── */
  const dotStyle = (key: ComponentKey) => {
    const st = components[key].status;
    const active = hoveredKey === key || selectedKey === key;
    return {
      base: {
        OK:       "border-emerald-500 bg-emerald-400/30",
        WARNING:  "border-amber-500 bg-amber-400/30",
        CRITICAL: "border-rose-500 bg-rose-400/30",
        NONE:     "border-slate-400 bg-slate-300/30",
      }[st] + (active ? " scale-150 shadow-lg" : ""),
      dot: { OK: "bg-emerald-500", WARNING: "bg-amber-500", CRITICAL: "bg-rose-500", NONE: "bg-slate-400" }[st],
      ping: { OK: "bg-emerald-400", WARNING: "bg-amber-400", CRITICAL: "bg-rose-400", NONE: "bg-slate-300" }[st],
      label: { OK: "bg-emerald-600", WARNING: "bg-amber-500", CRITICAL: "bg-rose-600", NONE: "bg-slate-600" }[st],
    };
  };

  const statusBadge = (status: ComponentStatus["status"], naAplicavel?: boolean) => {
    if (naAplicavel) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-400 border-slate-200">
          <MinusCircle size={11} /> N/A
        </span>
      );
    }
    const map = {
      OK:       { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2, label: "CONFORME" },
      WARNING:  { cls: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse",  Icon: AlertTriangle, label: "ATENÇÃO" },
      CRITICAL: { cls: "bg-rose-50 text-rose-700 border-rose-200 animate-bounce",    Icon: XCircle,       label: "NÃO CONFORME" },
      NONE:     { cls: "bg-slate-50 text-slate-500 border-slate-200",                Icon: HelpCircle,    label: "N/D" },
    }[status];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${map.cls}`}>
        <map.Icon size={11} /> {map.label}
      </span>
    );
  };

  /* ── Detail panel shared content ── */
  const DetailPanel = activeComp ? (
      <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in duration-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{activeComp.icon}</span>
            <div>
              <h4 className="text-sm font-black text-slate-800 leading-snug">{activeComp.label}</h4>
              {activeComp.external && (
                <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 font-bold bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full mt-0.5">
                  <Link2 size={9} /> {activeComp.externalNote}
                </span>
              )}
            </div>
          </div>
          {statusBadge(activeComp.status, activeComp.naAplicavel)}
        </div>

        <p className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-200/50 p-3 rounded-xl">
          {activeComp.desc}
        </p>

        {/* Light type selector — only for exteriorLight */}
        {activeComp.key === "exteriorLight" && (
          <div className="bg-white border border-slate-200/50 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Tipo de Luz</p>
            {LIGHT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLightType(opt.value)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold border transition-all text-left
                  ${lightType === opt.value
                    ? "bg-blue-50 border-blue-400 text-blue-800"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300"}`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
                {lightType === opt.value && <CheckCircle2 size={12} className="ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white border border-slate-200/50 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {activeComp.specs.map((s, i) => (
            <div key={i} className="flex justify-between items-center p-2.5 text-xs">
              <span className="text-slate-500 font-medium">{s.name}</span>
              <span className="text-slate-900 font-bold font-mono">{s.value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => { setSelectedKey(null); setHoveredKey(null); }}
          className="text-[11px] text-blue-600 hover:text-blue-800 font-extrabold flex items-center gap-1"
        >
          ← Ver Resumo Geral
        </button>
      </div>
    ) : (
      <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in duration-200">
        {/* Score gauge */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-200/40">
          <div className="relative flex-shrink-0">
            <svg className="h-16 w-16 -rotate-90">
              <circle cx="32" cy="32" r="28" stroke="#e2e8f0" strokeWidth="5" fill="transparent" />
              <circle cx="32" cy="32" r="28"
                stroke={scoreColor} strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (circumference * score) / 100}
                strokeLinecap="round" fill="transparent"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-800">{score}%</span>
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Conformidade Global</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
              {score === 100 ? "Todos os sistemas operacionais."
               : score >= 75 ? "Atenção em pontos específicos."
               : "Inconformidades críticas detectadas."}
            </p>
          </div>
        </div>

        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Monitorização de Subsistemas</p>
        <div className="space-y-1.5">
          {Object.values(components).map((comp) => {
            const dotCls = {
              OK: "bg-emerald-500",
              WARNING: "bg-amber-500 animate-pulse",
              CRITICAL: "bg-rose-500 animate-bounce",
              NONE: "bg-slate-300",
            }[comp.status];
            return (
              <button key={comp.key} onClick={() => setSelectedKey(comp.key)}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/40 hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${comp.naAplicavel ? "bg-slate-200" : dotCls}`} />
                  <span className="text-xs font-bold text-slate-700">{comp.label}</span>
                  {comp.external && (
                    <span className="text-[9px] text-orange-500 font-bold border border-orange-200 bg-orange-50 px-1 rounded">EXT.</span>
                  )}
                  {comp.naAplicavel && (
                    <span className="text-[9px] text-slate-400 font-bold border border-slate-200 bg-slate-50 px-1 rounded">N/A</span>
                  )}
                </div>
                <ChevronRight size={12} className="text-slate-400" />
              </button>
            );
          })}
        </div>
      </div>
    );

  /* ── Keyboard Esc to close modal ── */
  React.useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setModalOpen(false); setSelectedKey(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <>
      {/* ── TRUE FULLSCREEN MODAL ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex flex-col"
          onClick={() => { setModalOpen(false); setSelectedKey(null); }}
        >
          {/* Top bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-slate-900/95 border-b border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-widest leading-none">
                  Diagnóstico Visual da Jangada
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {jangada.serial || ""} · Clique nos hotspots para inspecionar · <kbd className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd> para fechar
                </p>
              </div>
            </div>
            <button
              onClick={() => { setModalOpen(false); setSelectedKey(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-all"
            >
              <X size={16} /> Fechar
            </button>
          </div>

          {/* Body: diagram (left big) + inspector (right) */}
          <div
            className="flex flex-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Diagram — takes most of the screen */}
            <div className="flex-1 flex items-center justify-center bg-slate-950 p-6 overflow-hidden">
              <div className="w-full h-full flex items-center justify-center">
                <LiferaftHotspotDiagram
  components={components}
  hoveredKey={hoveredKey}
  selectedKey={selectedKey}
  onHover={setHoveredKey}
  onSelect={setSelectedKey}
  onOpenModal={() => setModalOpen(true)}
  lightType={lightType}
  lightSt={lightSt}
  dotStyle={dotStyle}
  wpSuperiorQueda={wpSuperiorQueda}
  wpInferiorQueda={wpInferiorQueda}
  jangada={jangada}
  fmt={fmt}
  parseApproval={parseApproval}
  modelShape={modelShape}
  enlarged
/>
              </div>
            </div>

            {/* Inspector panel — fixed right column */}
            <div className="w-[420px] flex-shrink-0 bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
              {/* Panel header */}
              <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100 bg-slate-50">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  {activeComp ? "Subsistema Selecionado" : "Painel de Inspeção"}
                </p>
                {activeComp && (
                  <h3 className="text-sm font-black text-slate-800 mt-0.5 leading-tight">{activeComp.label}</h3>
                )}
              </div>

              {/* Panel content — bigger text in modal */}
              <div className="flex-1 p-5">
                {activeComp ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{activeComp.icon}</span>
                        <div>
                          {activeComp.external && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 font-bold bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full mb-1">
                              <Link2 size={10} /> {activeComp.externalNote}
                            </span>
                          )}
                          {statusBadge(activeComp.status, activeComp.naAplicavel)}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 p-4 rounded-xl">
                      {activeComp.desc}
                    </p>

                    {/* Light type selector */}
                    {activeComp.key === "exteriorLight" && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Tipo de Luz</p>
                        {LIGHT_TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setLightType(opt.value)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold border transition-all text-left
                              ${lightType === opt.value
                                ? "bg-blue-50 border-blue-400 text-blue-800 shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"}`}
                          >
                            <span className="text-xl">{opt.icon}</span>
                            <span>{opt.label}</span>
                            {lightType === opt.value && <CheckCircle2 size={16} className="ml-auto text-blue-600" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Specs table */}
                    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {activeComp.specs.map((s, i) => (
                        <div key={i} className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-slate-500 font-medium">{s.name}</span>
                          <span className="text-slate-900 font-bold font-mono ml-4 text-right">{s.value}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => { setSelectedKey(null); setHoveredKey(null); }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-extrabold flex items-center gap-1.5"
                    >
                      ← Ver Resumo Geral
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Score gauge */}
                    <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                      <div className="relative flex-shrink-0">
                        <svg className="h-20 w-20 -rotate-90">
                          <circle cx="40" cy="40" r="34" stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                          <circle cx="40" cy="40" r="34"
                            stroke={scoreColor} strokeWidth="6"
                            strokeDasharray={2 * Math.PI * 34}
                            strokeDashoffset={2 * Math.PI * 34 - (2 * Math.PI * 34 * score) / 100}
                            strokeLinecap="round" fill="transparent"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-800">{score}%</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Conformidade Global</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">
                          {score === 100 ? "✅ Todos os sistemas operacionais."
                           : score >= 75  ? "⚠️ Atenção em pontos específicos."
                           : "🔴 Inconformidades críticas detectadas."}
                        </p>
                      </div>
                    </div>

                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Subsistemas</p>
                    <div className="space-y-2">
                      {Object.values(components).map((comp) => {
                        const dotCls = {
                          OK: "bg-emerald-500", WARNING: "bg-amber-500 animate-pulse",
                          CRITICAL: "bg-rose-500 animate-bounce", NONE: "bg-slate-300",
                        }[comp.status];
                        const statusLabel = comp.naAplicavel ? "N/A" : { OK: "Conforme", WARNING: "Atenção", CRITICAL: "Crítico", NONE: "N/D" }[comp.status];
                            const statusTxt = comp.naAplicavel ? "text-slate-400" : { OK: "text-emerald-600", WARNING: "text-amber-600", CRITICAL: "text-rose-600", NONE: "text-slate-400" }[comp.status];
                            return (
                          <button key={comp.key} onClick={() => setSelectedKey(comp.key)}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-3 h-3 rounded-full ${comp.naAplicavel ? "bg-slate-200" : dotCls}`} />
                              <div>
                                <span className="text-sm font-bold text-slate-800">{comp.label}</span>
                                {comp.external && (
                                  <span className="ml-2 text-[9px] text-orange-500 font-bold border border-orange-200 bg-orange-50 px-1 rounded">EXT.</span>
                                )}
                              </div>
                            </div>
                            <span className={`text-xs font-bold ${statusTxt}`}>{statusLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

                {/* WP Test Panel in modal */}
                <div className="flex-shrink-0 p-5 border-t border-slate-100 bg-slate-50">
                  <WPTestPanel jangada={jangada} />
                </div>
              </div>
            </div>
          </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xl flex flex-col">
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Activity size={18} /></div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Diagnóstico Visual da Jangada
              </h3>
              <p className="text-[11px] text-slate-500">Sincronizado com a checklist de inspeção · Clique nos hotspots</p>
            </div>
          </div>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all">
            <Maximize2 size={13} /> Ampliar
          </button>
        </div>

        {/* Split panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-7 bg-slate-50/60 rounded-2xl p-3 border border-slate-100 flex items-center justify-center cursor-pointer"
               onClick={() => setModalOpen(true)}>
            <LiferaftHotspotDiagram
  components={components}
  hoveredKey={hoveredKey}
  selectedKey={selectedKey}
  onHover={setHoveredKey}
  onSelect={setSelectedKey}
  onOpenModal={() => setModalOpen(true)}
  lightType={lightType}
  lightSt={lightSt}
  dotStyle={dotStyle}
  wpSuperiorQueda={wpSuperiorQueda}
  wpInferiorQueda={wpInferiorQueda}
  jangada={jangada}
  fmt={fmt}
  parseApproval={parseApproval}
  modelShape={modelShape}
/>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            {DetailPanel}
            <WPTestPanel jangada={jangada} compact />
          </div>
        </div>

        {/* Legend */}
        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-1.5 mt-5 pt-4 border-t border-slate-100 text-[10px] font-bold text-slate-500">
          {[
            { color: "bg-emerald-500", label: "Válido / Aprovado" },
            { color: "bg-amber-500",   label: "A Expirar (≤90d)" },
            { color: "bg-rose-500",    label: "Expirado / Crítico" },
            { color: "bg-slate-300",   label: "Não Registado" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${l.color} border border-white shadow-sm`} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>

        {/* HRU external note */}
        <div className="mt-3 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl p-2.5 text-[10px] text-orange-700 font-medium">
          <Link2 size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>HRU (Válvula Hidrostática)</strong> — componente <em>exterior ao contentor da jangada</em>, fixo ao berço/cradle do navio.
            Activa automaticamente a 1,5–4m de profundidade libertando a jangada (SOLAS). Verificar validade, orientação e ligação ao weak link.
          </span>
        </div>
      </div>
    </>
  );
}
