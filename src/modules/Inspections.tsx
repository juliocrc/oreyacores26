"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { buildChecklistInitialValues, buildInspectionChecklistFromQuadro, ChecklistField } from "./inspectionChecklist";
import { findRaftTechnicalModel } from "./rafts/raftModelData";
import { getSeaSafeSpec } from "./rafts/seaSafeModelData";
import { broadcastServiceStationSync } from "@/lib/service-station-sync";
import { DRINKING_WATER_REFERENCE_CANDIDATES, DRINKING_WATER_STOCK_REFERENCE, FOOD_RATIONS_REFERENCE_CANDIDATES, FOOD_RATIONS_STOCK_REFERENCE } from "@/lib/stock-reference-rules";
import { dedupeRaftArticles } from "./rafts/mandatoryPack";
import { formatValidityDisplay, normalizeMonthYearValue } from "@/lib/date-display";

type ViewMode = "quadros" | "lista" | "detalhes";
const CHECKLIST_DRAFT_PREFIX = "inspection-wizard-draft";
const SERVICE_TECHNICIANS_FALLBACK = ["Julio Correa", "Alex Santos"];

type QuickInspectionState = {
  shipId: string;
  raftId: string;
  navioNome: string;
  jangadaSerial: string;
  date: string;
  status: string;
  responsavel: string;
  certificadoNumero: string;
  certificateMode: string;
};

type ChecklistStockReplacement = {
  sourceFieldName: string;
  fieldLabel: string;
  articleName: string;
  validityFieldName?: string;
  quantity: number;
  stockId: number;
  referencia: string;
  codigoFabricante?: string;
  descricao: string;
  validade?: string;
  pickedAt: string;
};

type StockPickerState = {
  sourceFieldName: string;
  fieldLabel: string;
  articleName: string;
  validityFieldName?: string;
  quantity: number;
  stockReferences: string[];
  articleTokens: string[];
};

type ChecklistTechnicalGuide = {
  title: string;
  details: string[];
  torques: string[];
  references: string[];
  stockItems: any[];
  notes: string[];
};

type InspectionWorkflowStatus = "inspecao_em_curso" | "aguarda_decisao";

const CHECKLIST_VALIDITY_FIELD_BY_SOURCE: Record<string, string> = {
  luz_exterior_bateria: "validade_luzes_exteriores",
  luz_interior_bateria: "validade_bateria",
  bateria_litio: "validade_bateria",
  pilhas_lanterna: "validade_pilhas_lanterna",
  saco_agua: "validade_agua",
  racoes_alimentares: "validade_racoes",
  ambulancia: "validade_farmacia",
  comprimidos_enjoo: "validade_comprimidos",
  foguetoes_paraquedas: "validade_paraquedas",
  fachos_mao: "validade_fachos_mao",
  potes_fumo: "validade_potes_fumo",
};

const CHECKLIST_SOURCE_FIELD_BY_VALIDITY = Object.entries(CHECKLIST_VALIDITY_FIELD_BY_SOURCE).reduce<Record<string, string>>((acc, [sourceField, validityField]) => {
  acc[validityField] = sourceField;
  return acc;
}, {});

const CHECKLIST_REFERENCE_FIELD_BY_SOURCE: Record<string, string> = {
  luz_exterior_bateria: "ref_luz_exterior",
  luz_interior_bateria: "ref_bateria",
  bateria_litio: "ref_bateria",
  saco_agua: "ref_agua",
  racoes_alimentares: "ref_racoes",
  ambulancia: "ref_farmacia",
  comprimidos_enjoo: "ref_comprimidos",
  foguetoes_paraquedas: "ref_paraquedas",
  fachos_mao: "ref_fachos",
  potes_fumo: "ref_potes",
};

function mapWorkflowToServiceStationStatus(workflowStatus: InspectionWorkflowStatus) {
  if (workflowStatus === "inspecao_em_curso") return "progresso";
  return "finalizada";
}

async function updateServiceStationStatus(payload: {
  raftId?: string;
  serial?: string;
  workflowStatus: InspectionWorkflowStatus;
  startedAt?: string;
  finishedAt?: string;
}) {
  const response = await fetch("/api/service-station", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raftId: payload.raftId || undefined,
      serial: payload.serial || undefined,
      status: mapWorkflowToServiceStationStatus(payload.workflowStatus),
      workflowStatus: payload.workflowStatus,
      startedAt: payload.startedAt,
      finishedAt: payload.finishedAt,
    }),
  });

  if (response.ok) {
    broadcastServiceStationSync(payload.workflowStatus === "aguarda_decisao" ? "station:inspection-finished" : "station:inspection-started");
  }
}

function normalizeInspection(item: any) {
  return {
    id: item?.id,
    shipId: item?.shipId ?? item?.navioId ?? "",
    raftId: item?.raftId ?? item?.jangadaId ?? "",
    navioNome: item?.navioNome ?? "",
    jangadaSerial: item?.jangadaSerial ?? "",
    date: item?.date ?? item?.dataInspecao ?? "",
    status: item?.status ?? "",
    responsavel: item?.responsavel ?? "",
    certificadoNumero: item?.certificadoNumero ?? "",
  };
}

function sameId(a: unknown, b: unknown) {
  if (a === undefined || a === null || a === "") return false;
  if (b === undefined || b === null || b === "") return false;
  return String(a) === String(b);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getShipNameById(list: any[], id: unknown) {
  const ship = list.find((item) => sameId(item?.id, id));
  return ship?.nome || ship?.name || "";
}

function getRaftLabelById(list: any[], id: unknown) {
  const raft = list.find((item) => sameId(item?.id, id));
  return raft?.model || "";
}

function getShipDisplayName(ship: any) {
  return String(ship?.nome || ship?.name || ship?.designacao || "").trim();
}

function matchesShipDisplayName(ship: any, value: string) {
  return normalizeText(getShipDisplayName(ship)) === normalizeText(value);
}
// Registro de Inspeções
export default function Inspections() {
    // Estados para modais de ação
    const [editModal, setEditModal] = useState<{open: boolean, item?: any}>({open: false});
    const [viewModal, setViewModal] = useState<{open: boolean, item?: any}>({open: false});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [showModal, setShowModal] = useState(false);
  // Técnicos dinâmicos da API (com fallback hardcoded)
  const [serviceTechnicians, setServiceTechnicians] = useState<string[]>(SERVICE_TECHNICIANS_FALLBACK);
  useEffect(() => {
    fetch("/api/tecnicos")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.stations) {
          const names = data.stations.flatMap((s: any) => (s.tecnicos || []).map((t: any) => t.nome)).filter(Boolean);
          if (names.length > 0) setServiceTechnicians(names);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);
  const [quickInspection, setQuickInspection] = useState<QuickInspectionState>({ shipId: "", raftId: "", navioNome: "", jangadaSerial: "", date: "", status: "", responsavel: SERVICE_TECHNICIANS_FALLBACK[0], certificadoNumero: "", certificateMode: "interno" });
  const [checklistValues, setChecklistValues] = useState<Record<string, string | number | boolean>>({});
  const [isChecklistStart, setIsChecklistStart] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [pendingChecklistStart, setPendingChecklistStart] = useState<{ serial: string; shipName: string; raftId: string } | null>(null);
  const [checklistRaftDetails, setChecklistRaftDetails] = useState<any | null>(null);
  const [stockPicker, setStockPicker] = useState<StockPickerState | null>(null);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [stockBarcodeSearch, setStockBarcodeSearch] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [isScanOpenInsp, setIsScanOpenInsp] = useState(false);
  const [useCameraInsp, setUseCameraInsp] = useState(false);
  const [scanMockCodeInsp, setScanMockCodeInsp] = useState("");
  const [scanErrorInsp, setScanErrorInsp] = useState<string | null>(null);
  const scannerRefInsp = useRef<any>(null);
  const [stockReplacements, setStockReplacements] = useState<Record<string, ChecklistStockReplacement>>({});
  const [stockCatalog, setStockCatalog] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);
  const [rafts, setRafts] = useState<any[]>([]);
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<string[]>([]);
  const [inspections, setInspections] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("inspections") || "[]");
    } catch { return []; }
  });

  const getChecklistDraftKey = (raftId?: string, serial?: string) => {
    const keyId = String(raftId || "").trim();
    const keySerial = String(serial || "").trim().toLowerCase();
    if (keyId) return `${CHECKLIST_DRAFT_PREFIX}:id:${keyId}`;
    if (keySerial) return `${CHECKLIST_DRAFT_PREFIX}:serial:${keySerial}`;
    return `${CHECKLIST_DRAFT_PREFIX}:generic`;
  };

  const readChecklistDraft = (raftId?: string, serial?: string) => {
    try {
      const key = getChecklistDraftKey(raftId, serial);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveChecklistDraft = (step: number, data: typeof quickInspection, values: Record<string, string | number | boolean>) => {
    try {
      const key = getChecklistDraftKey(data.raftId, data.jangadaSerial);
      localStorage.setItem(
        key,
        JSON.stringify({
          step,
          data,
          checklistValues: values,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignora erros de storage
    }
  };

  const clearChecklistDraft = (raftId?: string, serial?: string) => {
    try {
      const key = getChecklistDraftKey(raftId, serial);
      localStorage.removeItem(key);
    } catch {
      // Ignora erros de storage
    }
  };

  const markServiceStationInProgress = (raftId?: string, serial?: string) => {
    const raftIdNumber = raftId ? Number(raftId) : NaN;
    const normalizedSerial = (serial || "").trim().toLowerCase();
    if (!normalizedSerial && !Number.isFinite(raftIdNumber)) return;

    void updateServiceStationStatus({
      raftId: Number.isFinite(raftIdNumber) ? String(raftIdNumber) : undefined,
      serial: normalizedSerial || undefined,
      workflowStatus: "inspecao_em_curso",
      startedAt: new Date().toISOString(),
    }).catch(() => {
      // Ignora falhas laterais da estação
    });
  };

  const markServiceStationFinalized = (raftId?: string, serial?: string) => {
    const raftIdNumber = raftId ? Number(raftId) : NaN;
    const normalizedSerial = (serial || "").trim().toLowerCase();
    if (!normalizedSerial && !Number.isFinite(raftIdNumber)) return;

    void updateServiceStationStatus({
      raftId: Number.isFinite(raftIdNumber) ? String(raftIdNumber) : undefined,
      serial: normalizedSerial || undefined,
      workflowStatus: "aguarda_decisao",
      finishedAt: new Date().toISOString(),
    }).catch(() => {
      // Ignora falhas laterais da estação
    });
  };

  const emitAutomaticReports = async (
    inspection: any,
    options?: {
      emitInternalCertificate?: boolean;
      checklistSnapshot?: Record<string, string | number | boolean>;
    },
  ) => {
    const emitInternalCertificate = options?.emitInternalCertificate !== false;
    const raft =
      rafts.find((item: any) => sameId(item?.id, inspection.raftId)) ||
      rafts.find((item: any) => String(item?.serial || "").toLowerCase() === String(inspection.jangadaSerial || "").toLowerCase());

    const ship =
      ships.find((item: any) => sameId(item?.id, inspection.shipId)) ||
      null;

    const shipName = ship?.nome || inspection.navioNome || raft?.shipNameManual || "Sem navio";
    const raftModel = raft?.model || "Jangada";
    const raftSerial = inspection.jangadaSerial || raft?.serial || "SEM-SERIAL";
    const certNumber = inspection.certificadoNumero || `CERT-${Date.now()}`;

    if (emitInternalCertificate) {
      const checklist = options?.checklistSnapshot || {};
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = 210;
      const margin = 10;
      const rowHeight = 12;

      const asString = (value: unknown) => String(value ?? "").trim();
      const asChecked = (value: unknown) => Boolean(value);
      const formatDateLabel = (value: unknown) => {
        const raw = asString(value);
        if (!raw) return "—";
        if (/^\d{1,2}\/\d{2,4}$/.test(raw) || /^\d{1,2}-\d{2,4}$/.test(raw)) return raw;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return parsed.toLocaleDateString("pt-PT");
      };

      const drawHeaderCell = (x: number, y: number, w: number, h: number, label: string, value: string) => {
        doc.setDrawColor(90, 90, 90);
        doc.rect(x, y, w, h);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(label, x + 2, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(value || "—", x + 2, y + h - 3);
      };

      const drawCheckbox = (cellX: number, y: number, cellW: number, cellH: number, checked: boolean) => {
        const boxSize = 4.8;
        const boxX = cellX + (cellW - boxSize) / 2;
        const boxY = y + (cellH - boxSize) / 2;

        doc.setDrawColor(40, 40, 40);
        doc.setLineWidth(0.35);
        doc.rect(boxX, boxY, boxSize, boxSize);

        if (checked) {
          doc.setLineWidth(0.6);
          doc.line(boxX + 0.9, boxY + 2.7, boxX + 2.0, boxY + 3.9);
          doc.line(boxX + 2.0, boxY + 3.9, boxX + 4.0, boxY + 1.1);
          doc.setLineWidth(0.2);
        }
      };

      const drawSectionTitle = (y: number, pt: string, en: string) => {
        doc.setFillColor(120, 120, 120);
        doc.rect(margin, y, pageW - margin * 2, 9, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(pt.toUpperCase(), margin + 2, y + 3.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(en, margin + 2, y + 7.5);
        doc.setTextColor(0, 0, 0);
      };

      const drawRow = (y: number, pt: string, en: string, checked: boolean, refValue?: string, validity?: string) => {
        const x = margin;
        const w = pageW - margin * 2;
        const colCheck = 10;
        const colRef = 40;
        const colVal = 26;
        const colLabel = w - colCheck - colRef - colVal;

        doc.setDrawColor(120, 120, 120);
        doc.rect(x, y, colLabel, rowHeight);
        doc.rect(x + colLabel, y, colCheck, rowHeight);
        doc.rect(x + colLabel + colCheck, y, colRef, rowHeight);
        doc.rect(x + colLabel + colCheck + colRef, y, colVal, rowHeight);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(pt, x + 1.5, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(en, x + 1.5, y + 8.8);

        drawCheckbox(x + colLabel, y, colCheck, rowHeight, checked);

        if (refValue) {
          doc.setFillColor(70, 255, 70);
          doc.rect(x + colLabel + colCheck, y, colRef, rowHeight, "F");
          doc.rect(x + colLabel + colCheck, y, colRef, rowHeight);
          doc.setFontSize(8.5);
          doc.text(refValue, x + colLabel + colCheck + colRef - 1.5, y + 8, { align: "right" });
        }

        if (validity) {
          doc.setFillColor(70, 255, 70);
          doc.rect(x + colLabel + colCheck + colRef, y, colVal, rowHeight, "F");
          doc.rect(x + colLabel + colCheck + colRef, y, colVal, rowHeight);
          doc.setFontSize(8.5);
          doc.text(validity, x + colLabel + colCheck + colRef + colVal - 1.5, y + 8, { align: "right" });
        }
      };

      const formatValidityShort = (value: unknown) => {
        const raw = asString(value);
        if (!raw) return "";
        if (/^\d{1,2}[/-]\d{2,4}$/.test(raw)) return raw.replace("/", "-");
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return `${String(parsed.getMonth() + 1).padStart(2, "0")}-${parsed.getFullYear()}`;
      };

      doc.setDrawColor(70, 70, 70);
      doc.rect(margin, margin, pageW - margin * 2, 277);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("CERTIFICADO DE INSPEÇÃO", pageW / 2, 18, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("LIFERAFT INSPECTION CERTIFICATE", pageW / 2, 23, { align: "center" });

      drawHeaderCell(10, 27, 54, 16, "CERTIFICADO N.º", certNumber);
      drawHeaderCell(64, 27, 40, 16, "DATA", formatDateLabel(inspection.date));
      drawHeaderCell(104, 27, 48, 16, "NAVIO", shipName);
      drawHeaderCell(152, 27, 48, 16, "MODELO", raftModel);
      drawHeaderCell(10, 43, 95, 14, "N.º SÉRIE", raftSerial);
      drawHeaderCell(105, 43, 95, 14, "ESTADO", inspection.status || "Concluída");

      let y = 60;

      drawSectionTitle(y, "Exterior da Jangada", "Liferaft - External");
      y += 9;
      drawRow(y, "Luz Exterior e Bateria", "Top Light and Battery", asChecked(checklist.luz_exterior_bateria), asString(checklist.ref_luz_exterior || "30203190"), formatValidityShort(checklist.validade_luzes_exteriores));
      y += 12;
      drawRow(y, "Tubo de Identificação", "Identification Card / Tube", asChecked(checklist.tubo_identificacao), asString(checklist.tuboIdentificacao || checklist.tubo_identificacao_ref), "");
      y += 12;
      drawRow(y, "Cilindro CO2", "Cylinder CO2", asChecked(checklist.cilindro_co2), asString(checklist.cilindro_co2 || checklist.ref_cilindro_co2), "");
      y += 13;

      drawSectionTitle(y, "Interior da Jangada", "Liferaft - Internal");
      y += 9;
      drawRow(y, "Luz Interior e Bateria", "Inside Light and Battery", asChecked(checklist.luz_interior_bateria), asString(checklist.ref_bateria || "30202206"), formatValidityShort(checklist.validade_bateria));
      y += 12;
      drawRow(y, "Facas de Segurança", "Safety Knifes", asChecked(checklist.faca_seguranca), "", "");
      y += 13;

      drawSectionTitle(y, "Equip. de Emergência", "Emergency Pack");
      y += 9;
      drawRow(y, "Água / Drinking Water", "Drinking Water", asChecked(checklist.saco_agua), asString(checklist.ref_agua || DRINKING_WATER_STOCK_REFERENCE), formatValidityShort(checklist.validade_agua));
      y += 12;
      drawRow(y, "Rações / Food Rations", "Food Rations", asChecked(checklist.racoes_alimentares), asString(checklist.ref_racoes || FOOD_RATIONS_STOCK_REFERENCE), formatValidityShort(checklist.validade_racoes));
      y += 12;
      drawRow(y, "Farmácia Solas / First Aid Kit", "First Aid Kit", asChecked(checklist.ambulancia), asString(checklist.ref_farmacia || "30202050"), formatValidityShort(checklist.validade_farmacia));
      y += 12;
      drawRow(y, "Comprimidos p/ Enjoo", "Seasickness Tablets", asChecked(checklist.comprimidos_enjoo), asString(checklist.ref_comprimidos || "30202051"), formatValidityShort(checklist.validade_comprimidos));
      y += 12;
      drawRow(y, "Foguetes Paraquedas", "Parachute Rockets", asChecked(checklist.foguetoes_paraquedas), asString(checklist.ref_paraquedas || "20500023"), formatValidityShort(checklist.validade_paraquedas));
      y += 12;
      drawRow(y, "Fachos de Mão", "Red Hand Flares", asChecked(checklist.fachos_mao), asString(checklist.ref_fachos || "20500035"), formatValidityShort(checklist.validade_fachos_mao));
      y += 12;
      drawRow(y, "Potes de Fumo", "Floating Smoke Signals", asChecked(checklist.potes_fumo), asString(checklist.ref_potes || "20500002"), formatValidityShort(checklist.validade_potes_fumo));
      y += 13;

      drawSectionTitle(y, "Ensaios e Testes", "Tests");
      y += 9;
      drawHeaderCell(10, y, 46, 12, "P1 CORR. INF", asString(checklist.p1_corrigida_inferior || "—"));
      drawHeaderCell(56, y, 46, 12, "P1 CORR. SUP", asString(checklist.p1_corrigida_superior || "—"));
      drawHeaderCell(102, y, 46, 12, "QUEDA INF (%)", asString(checklist.queda_real_inferior || "—"));
      drawHeaderCell(148, y, 52, 12, "QUEDA SUP (%)", asString(checklist.queda_real_superior || "—"));
      y += 12;
      drawHeaderCell(10, y, 130, 12, "RESULTADO WP", asString(checklist.aprovacao_wp || "—"));
      drawHeaderCell(140, y, 60, 12, "DATA INSPEÇÃO", formatDateLabel(inspection.date));

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Centro técnico: OREY · Técnico: ${inspection.responsavel || "—"}`, 12, 286);
      doc.text("Assinatura: __________________________", 130, 286);

      doc.save(`certificado_${raftSerial}_${certNumber}.pdf`);
    }

    const payload = raft || {
      serial: raftSerial,
      model: raftModel,
      owner: shipName,
      dataInspecao: inspection.date,
    };

    const response = await fetch("/api/exportar-raft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Falha ao gerar quadro de inspeção.");
    }

    const blob = await response.blob();
    const inspectionMonthYear = (() => {
      const raw = String(inspection.date || '').trim();
      if (!raw) return '';
      const iso = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
      if (iso) return `${iso[2]} ${iso[1]}`;
      const pt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (pt) return `${String(Number(pt[2])).padStart(2, '0')} ${pt[3]}`;
      return raw.replace(/[\/-]/g, ' ');
    })();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1]
      || `${[String(raftSerial || '').trim(), String(payload.raftModel || payload.model || '').trim(), (() => {
        const raw = String(payload.raftCapacity || payload.capacity || '').trim();
        const match = raw.match(/\d+/);
        return match ? `${Number(match[0])}P` : raw;
      })()].filter(Boolean).join(' ').trim() || 'jangada'}${inspectionMonthYear ? ` (${inspectionMonthYear})` : ''}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleQuickInspectionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setQuickInspection({ ...quickInspection, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    if (!showModal) return;
    if (String(quickInspection.certificadoNumero || "").trim()) return;

    let cancelled = false;

    const assignNextCertificate = async () => {
      try {
        const search = new URLSearchParams({ nextCertificate: "1" });
        if (String(quickInspection.date || "").trim()) {
          search.set("referenceDate", String(quickInspection.date).trim());
        }

        const response = await fetch(`/api/inspecoes?${search.toString()}`);
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const certificadoNumero = String(payload?.certificadoNumero || "").trim();
        if (!certificadoNumero || cancelled) return;

        setQuickInspection((prev) => {
          if (String(prev.certificadoNumero || "").trim()) return prev;
          return {
            ...prev,
            certificadoNumero,
          };
        });
      } catch {
        // Se falhar, o servidor ainda garante a sequência no momento de gravar.
      }
    };

    assignNextCertificate();

    return () => {
      cancelled = true;
    };
  }, [showModal, quickInspection.certificadoNumero, quickInspection.date]);

  const selectedRaft = useMemo(() => {
    if (checklistRaftDetails?.id && quickInspection.raftId && sameId(checklistRaftDetails.id, quickInspection.raftId)) {
      return checklistRaftDetails;
    }
    if (checklistRaftDetails?.serial && quickInspection.jangadaSerial && String(checklistRaftDetails.serial).toLowerCase() === String(quickInspection.jangadaSerial).toLowerCase()) {
      return checklistRaftDetails;
    }
    if (quickInspection.raftId) {
      return rafts.find((item: any) => sameId(item?.id, quickInspection.raftId));
    }
    if (quickInspection.jangadaSerial) {
      return rafts.find((item: any) => String(item?.serial || "").toLowerCase() === String(quickInspection.jangadaSerial).toLowerCase());
    }
    return null;
  }, [checklistRaftDetails, quickInspection.raftId, quickInspection.jangadaSerial, rafts]);

  const checklistSections = useMemo(() => {
    if (!isChecklistStart) return [];
    const raftInput = {
      serial: selectedRaft?.serial || quickInspection.jangadaSerial,
      brand: selectedRaft?.brand,
      model: selectedRaft?.model,
      capacity: selectedRaft?.capacity,
      owner: selectedRaft?.owner || quickInspection.navioNome,
      dataFabrico: selectedRaft?.dataFabrico,
      packType: selectedRaft?.packType,
      containerModel: selectedRaft?.containerModel,
      cylinderCabecaDisparoRef: selectedRaft?.cylinderCabecaDisparoRef,
      tuboIdentificacao: selectedRaft?.tuboIdentificacao,
      dataInspecao: quickInspection.date || selectedRaft?.dataInspecao,
      shipNameManual: quickInspection.navioNome || selectedRaft?.shipNameManual,
      cylinder: {
        serial: selectedRaft?.cylinderSerial,
        tara: selectedRaft?.cylinderTara,
        pesoBruto: selectedRaft?.cylinderPesoBruto,
        co2: selectedRaft?.cylinderCo2,
        n2: selectedRaft?.cylinderN2,
        dataTeste: selectedRaft?.cylinderDataTeste,
        dataProxTeste: selectedRaft?.cylinderDataProxTeste,
        sistema: selectedRaft?.cylinderSistema,
      },
      artigos: Array.isArray(selectedRaft?.artigos)
        ? selectedRaft.artigos
        : (() => {
            try {
              const raw = selectedRaft?.artigos;
              if (typeof raw !== "string") return [];
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })(),
    };
    return buildInspectionChecklistFromQuadro(raftInput);
  }, [isChecklistStart, selectedRaft, quickInspection.jangadaSerial, quickInspection.navioNome, quickInspection.date]);

  const currentChecklistSection = checklistSections[wizardStep];

  // Busca última inspeção da jangada para validades
  const lastInspection = useMemo(() => {
    if (!isChecklistStart || !quickInspection.jangadaSerial) return null;
    // Busca inspeções da mesma jangada, ordena por data desc
    const serial = String(quickInspection.jangadaSerial).toLowerCase();
    const filtered = inspections
      .filter(i => String(i.jangadaSerial || '').toLowerCase() === serial && i.sourceFile === 'checklist_quadro')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return filtered[0] || null;
  }, [isChecklistStart, quickInspection.jangadaSerial, inspections]);

  // Mapeia artigos e validades da última inspeção
  const lastInspectionValidities = useMemo(() => {
    if (!lastInspection || !lastInspection.artigos) return {};
    const map: Record<string, string> = {};
    for (const art of lastInspection.artigos) {
      if (art.name && art.validade) {
        map[String(art.name).toLowerCase()] = art.validade;
      }
    }
    return map;
  }, [lastInspection]);

  // Função para calcular meses entre datas
  function monthsBetween(date1: string, date2: string) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  }

  const stockByReference = useMemo(() => {
    const map: Record<string, any> = {};
    for (const item of stockCatalog) {
      const refKey = normalizeText(item?.referencia);
      const codeKey = normalizeText(item?.codigoFabricante);
      if (refKey) map[refKey] = item;
      if (codeKey && !map[codeKey]) map[codeKey] = item;
    }
    return map;
  }, [stockCatalog]);

  const sortedShips = useMemo(() => {
    return [...ships].sort((a, b) =>
      getShipDisplayName(a).localeCompare(getShipDisplayName(b), "pt-PT", { sensitivity: "base" })
    );
  }, [ships]);

  const getShipInputValue = (shipId?: unknown, manualName?: unknown) => {
    const selectedShip = sortedShips.find((ship) => sameId(ship?.id, shipId));
    return getShipDisplayName(selectedShip) || String(manualName || "");
  };

  const handleQuickInspectionShipInput = (value: string) => {
    const selectedShip = sortedShips.find((ship) => matchesShipDisplayName(ship, value));
    setQuickInspection((prev) => ({
      ...prev,
      shipId: selectedShip?.id ? String(selectedShip.id) : "",
      navioNome: value,
    }));
  };

  const handleEditInspectionShipInput = (value: string) => {
    const selectedShip = sortedShips.find((ship) => matchesShipDisplayName(ship, value));
    setEditModal((modal) => ({
      ...modal,
      item: modal.item
        ? {
            ...modal.item,
            shipId: selectedShip?.id ? String(selectedShip.id) : "",
            navioNome: value,
          }
        : modal.item,
    }));
  };

  const raftArticles = useMemo(() => {
    if (Array.isArray(selectedRaft?.artigos)) return dedupeRaftArticles(selectedRaft.artigos);
    return [];
  }, [selectedRaft]);

  const technicalModel = useMemo(() => {
    if (!selectedRaft?.brand || !selectedRaft?.model) return null;
    return findRaftTechnicalModel(String(selectedRaft.brand), String(selectedRaft.model));
  }, [selectedRaft?.brand, selectedRaft?.model]);

  const seaSafeSpec = useMemo(() => {
    return getSeaSafeSpec(String(selectedRaft?.model || technicalModel?.name || ""));
  }, [selectedRaft?.model, technicalModel?.name]);

  const technicalInventory = useMemo(() => {
    return [...(technicalModel?.serviceItems || []), ...(technicalModel?.spareParts || [])];
  }, [technicalModel]);

  const isThannerInflationSystem = useMemo(() => {
    const candidates = [
      selectedRaft?.cylinderSistema,
      technicalModel?.keyTechnicalData?.inflationSystem,
      ...(technicalModel?.inflationSystem || []),
    ];

    return candidates.some((value) => normalizeText(value).includes("thanner"));
  }, [selectedRaft?.cylinderSistema, technicalModel]);

  const isLeafieldInflationSystem = useMemo(() => {
    const candidates = [
      selectedRaft?.cylinderSistema,
      technicalModel?.keyTechnicalData?.inflationSystem,
      ...(technicalModel?.inflationSystem || []),
    ];

    return candidates.some((value) => normalizeText(value).includes("leafield"));
  }, [selectedRaft?.cylinderSistema, technicalModel]);

  const toIsoLike = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmYyyy) return `${mmYyyy[2]}-${String(Number(mmYyyy[1])).padStart(2, "0")}-01`;

    const mmYy = raw.match(/^(\d{1,2})\/(\d{2})$/);
    if (mmYy) return `${2000 + Number(mmYy[2])}-${String(Number(mmYy[1])).padStart(2, "0")}-01`;

    const mmDashYyyy = raw.match(/^(\d{1,2})-(\d{4})$/);
    if (mmDashYyyy) return `${mmDashYyyy[2]}-${String(Number(mmDashYyyy[1])).padStart(2, "0")}-01`;

    const mmDashYy = raw.match(/^(\d{1,2})-(\d{2})$/);
    if (mmDashYy) return `${2000 + Number(mmDashYy[2])}-${String(Number(mmDashYy[1])).padStart(2, "0")}-01`;

    return raw;
  };

  const formatMonthYear = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const iso = toIsoLike(raw);
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return raw;
    return `${String(parsed.getMonth() + 1).padStart(2, "0")}-${parsed.getFullYear()}`;
  };

  const getStockEntry = (...refs: string[]) => {
    for (const ref of refs) {
      const found = stockByReference[normalizeText(ref)];
      if (found) return found;
    }
    return null;
  };

  const uniqueStrings = (...values: unknown[]) => {
    const seen = new Set<string>();
    const result: string[] = [];

    values.flat().forEach((value: any) => {
      const normalizedValue = String(value || "").trim();
      if (!normalizedValue) return;
      const key = normalizeText(normalizedValue);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(normalizedValue);
    });

    return result;
  };

  const matchesTechnicalTokens = (value: unknown, tokens: string[]) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return false;
    return tokens.some((token) => normalizedValue.includes(normalizeText(token)));
  };

  const getModelTubeDetails = () => {
    if (!technicalModel) return [] as string[];

    if (technicalModel.keyTechnicalData?.tubes) {
      return [technicalModel.keyTechnicalData.tubes];
    }

    const knownByModel: Record<string, string[]> = {
      "SEASAVA PLUS": ["30202044 (mangueira superior)", "30203001 (mangueira inferior)"],
    };

    if (knownByModel[technicalModel.name]) {
      return knownByModel[technicalModel.name];
    }

    return technicalInventory
      .filter((item) => matchesTechnicalTokens(`${item?.name || ""} ${item?.reference || ""}`, ["hose", "tubo", "tubos", "mangueira", "mangueiras"]))
      .map((item) => item.reference ? `${item.name} (${item.reference})` : item.name);
  };

  const hasTechnicalInventoryToken = (...tokens: string[]) => {
    if (!tokens.length) return false;
    return technicalInventory.some((item) => {
      const searchable = `${item?.name || ""} ${item?.reference || ""} ${item?.notes || ""} ${item?.category || ""}`;
      return matchesTechnicalTokens(searchable, tokens);
    });
  };

  const hasDk99Head = hasTechnicalInventoryToken("dk99");
  const hasDk96Head = hasTechnicalInventoryToken("dk96");
  const hasYCoupling = hasTechnicalInventoryToken("y coupling");
  const hasTCoupling = hasTechnicalInventoryToken("t coupling");
  const hasRapidHose = hasTechnicalInventoryToken("rapid hose");
  const hasRapidElbowHose = hasTechnicalInventoryToken("rapid elbow hose");
  const hasFiringCable = hasTechnicalInventoryToken("firing cable", "actuator", "operating head screws", "protective tube");

  const getStockEntriesForReferences = (references: string[]) => {
    const seen = new Set<string>();
    const result: any[] = [];

    references.forEach((reference) => {
      const stockItem = getStockEntry(reference);
      if (!stockItem) return;
      const key = String(stockItem.id || stockItem.referencia || stockItem.codigoFabricante || reference);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(stockItem);
    });

    return result;
  };

  const getTechnicalInventoryItemsByTokens = (...tokens: string[]) => {
    if (!tokens.length) return [] as any[];
    const seen = new Set<string>();

    return technicalInventory.filter((item) => {
      const searchable = `${item?.name || ""} ${item?.reference || ""} ${item?.notes || ""} ${item?.category || ""}`;
      if (!matchesTechnicalTokens(searchable, tokens)) return false;
      const key = `${item?.name || ""}::${item?.reference || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getTechnicalInventoryReferenceLabels = (...tokens: string[]) => {
    return getTechnicalInventoryItemsByTokens(...tokens)
      .filter((item) => String(item?.reference || "").trim())
      .map((item) => `${item.name}: ${item.reference}`);
  };

  const getRaftArticle = (...tokens: string[]) => {
    const normalizedTokens = tokens.map((token) => normalizeText(token)).filter(Boolean);
    return raftArticles.find((item: any) => {
      const name = normalizeText(item?.name);
      return normalizedTokens.some((token) => name.includes(token) || token.includes(name));
    }) || null;
  };

  const getChecklistFieldStockConfig = (field: ChecklistField) => {
    const byName: Record<string, { refs?: string[]; articleTokens?: string[]; validityField?: string; quantity?: number; articleName?: string }> = {
      luz_exterior_bateria: { refs: ["30203190"], validityField: "validade_luzes_exteriores", quantity: 1, articleName: "Top Light and Battery" },
      luz_interior_bateria: { refs: ["30202206"], validityField: "validade_bateria", quantity: 1, articleName: "Inside Light and Battery" },
      bateria_litio: { refs: ["30202206"], validityField: "validade_bateria", quantity: 1, articleName: "Lithium Battery" },
      lanterna: { articleTokens: ["waterproof torch", "torch", "lanterna"], quantity: 1, articleName: field.label },
      jogo_reparacao: { refs: ["20909107"], articleTokens: ["repair kit", "jogo de reparacao", "jogo de reparação"], quantity: 1, articleName: field.label },
      reflector_radar: { refs: ["30070273"], articleTokens: ["radar reflector", "reflector de radar"], quantity: 1, articleName: field.label },
      saco_agua: { refs: [...DRINKING_WATER_REFERENCE_CANDIDATES], articleTokens: ["agua", "água", "water sachets"], validityField: "validade_agua", quantity: 1, articleName: field.label },
      racoes_alimentares: { refs: [...FOOD_RATIONS_REFERENCE_CANDIDATES], articleTokens: ["racao", "ração", "racoes", "rações", "food rations"], validityField: "validade_racoes", quantity: 1, articleName: field.label },
      ambulancia: { refs: ["30202050", "30202207", "MED-KIT-ISO", "MED-KIT-SOLAS"], articleTokens: ["first aid", "farmacia", "farmácia", "ambulancia", "ambulância"], validityField: "validade_farmacia", quantity: 1, articleName: field.label },
      comprimidos_enjoo: { refs: ["30202051", "TAB-SICKNESS"], articleTokens: ["comprimidos", "enjoo", "seasickness tablets", "seasickness tables", "seasickness tablet", "tables"], validityField: "validade_comprimidos", quantity: 1, articleName: field.label },
      foguetoes_paraquedas: { refs: ["20500023", "20577723"], articleTokens: ["paraquedas", "parachute rockets", "parachute rocket", "foguetoes", "foguetões"], validityField: "validade_paraquedas", quantity: 2, articleName: field.label },
      fachos_mao: { refs: ["20500035", "20577723"], articleTokens: ["facho", "fachos de mao", "fachos de mão", "handflares", "handflare"], validityField: "validade_fachos_mao", quantity: 2, articleName: field.label },
      potes_fumo: { refs: ["20500002"], articleTokens: ["pote de fumo", "potes de fumo", "smoke signals"], validityField: "validade_potes_fumo", quantity: 1, articleName: field.label },
      pilhas_lanterna: { refs: ["20903168"], articleTokens: ["torch batteries", "pilhas para lanterna"], validityField: "validade_pilhas_lanterna", quantity: 4, articleName: field.label },
      cinta_fecho: { refs: ["30202108"], articleTokens: ["bursting band", "cinta de fecho"], quantity: 1, articleName: field.label },
      saco_retenida: { refs: ["PAINTER-BAG"], articleTokens: ["painter line bag", "saco de retenida"], quantity: 1, articleName: field.label },
    };

    const sourceFieldName = field.packItem?.checklistName || CHECKLIST_SOURCE_FIELD_BY_VALIDITY[field.name] || field.name;
    const base = byName[sourceFieldName] || byName[field.name] || {};

    if (field.packItem) {
      return {
        sourceFieldName,
        refs: field.packItem.stockReferences || [],
        articleTokens: field.packItem.articleTokens || [],
        validityField: field.packItem.validityFieldName,
        quantity: Math.max(1, Number(field.packItem.quantity || 1)),
        articleName: field.packItem.label || field.label,
      };
    }

    return {
      sourceFieldName,
      refs: base.refs || [],
      articleTokens: base.articleTokens || [],
      validityField: base.validityField || CHECKLIST_VALIDITY_FIELD_BY_SOURCE[sourceFieldName],
      quantity: Math.max(1, Number(base.quantity || 1)),
      articleName: base.articleName || field.label,
    };
  };

  const getChecklistRowMeta = (field: ChecklistField) => {
    const config = getChecklistFieldStockConfig(field);
    const replacement = stockReplacements[config.sourceFieldName] || null;
    const stockEntry = replacement || (config.refs?.length ? getStockEntry(...config.refs) : null);
    const articleEntry = config.articleTokens?.length ? getRaftArticle(...config.articleTokens) : null;
    const validityValue = String(
      replacement?.validade
      || (config.validityField ? checklistValues[config.validityField] : "")
      || articleEntry?.validade
      || stockEntry?.validade
      || ""
    );
    const refValue = String(replacement?.referencia || articleEntry?.referencia || stockEntry?.referencia || "").trim();
    const quantityValue = Math.max(1, Number(replacement?.quantity || articleEntry?.quantidade || config.quantity || 1));
    const qtyValue = quantityValue > 1 ? `(${quantityValue})` : "";
    const validIso = toIsoLike(validityValue);
    const months = validIso ? monthsBetween(new Date().toISOString().slice(0, 10), validIso) : null;
    const expiring = months !== null && months < 12;

    return {
      sourceFieldName: config.sourceFieldName,
      refValue: [refValue, qtyValue].filter(Boolean).join(" ").trim(),
      referenceCode: refValue,
      quantityValue,
      validityValue,
      validityLabel: formatMonthYear(validityValue),
      validityFieldName: config.validityField,
      expiring,
      stockEntry,
      replacement,
    };
  };

  const getChecklistTechnicalGuide = (field: ChecklistField, rowMeta?: ReturnType<typeof getChecklistRowMeta>): ChecklistTechnicalGuide | null => {
    if (!technicalModel) return null;

    const buildGuide = (options: {
      title: string;
      detailValues?: unknown[];
      torqueTokens?: string[];
      itemTokens?: string[];
      extraReferences?: unknown[];
      extraNotes?: unknown[];
    }) => {
      const torques = (technicalModel.torques || []).filter((line) => options.torqueTokens?.length ? matchesTechnicalTokens(line, options.torqueTokens) : false);
      const matchedItems = technicalInventory.filter((item) => {
        const searchable = `${item?.name || ""} ${item?.reference || ""} ${item?.notes || ""} ${item?.category || ""}`;
        return options.itemTokens?.length ? matchesTechnicalTokens(searchable, options.itemTokens) : false;
      });

      const references = uniqueStrings(
        rowMeta?.referenceCode,
        ...(options.extraReferences || []),
        ...matchedItems.map((item) => item.reference),
      );
      const stockItems = getStockEntriesForReferences(references);
      const notes = uniqueStrings(
        ...(options.extraNotes || []),
        ...matchedItems.map((item) => item.notes),
      );
      const details = uniqueStrings(...(options.detailValues || []));

      if (!details.length && !torques.length && !references.length && !stockItems.length && !notes.length) {
        return null;
      }

      return {
        title: options.title,
        details,
        torques,
        references,
        stockItems,
        notes,
      } as ChecklistTechnicalGuide;
    };

    switch (field.name) {
      case "valvulas_seguranca":
        return buildGuide({
          title: "Dados técnicos das válvulas de segurança",
          detailValues: [
            technicalModel.keyTechnicalData?.inflationSystem && `Sistema: ${technicalModel.keyTechnicalData.inflationSystem}`,
            technicalModel.keyTechnicalData?.valves && `Válvulas: ${technicalModel.keyTechnicalData.valves}`,
            selectedRaft?.valvulasAlivio && `Configuração instalada: ${selectedRaft.valvulasAlivio}`,
          ],
          torqueTokens: ["relief", "alivio", "safety valve", "valvula", "valve assembly", "outlet nut", "a10", "b10", "ots65"],
          itemTokens: ["relief", "alivio", "safety valve", "valvula", "a10", "b10", "ots65"],
          extraReferences: [seaSafeSpec?.valvulaAlivioRef],
          extraNotes: [technicalModel.keyTechnicalData?.valves],
        });
      case "uniao_banjo_superior":
      case "uniao_banjo_inferior":
        return buildGuide({
          title: `Dados técnicos da ${field.label.toLowerCase()}`,
          detailValues: [
            technicalModel.keyTechnicalData?.inflationSystem && `Sistema: ${technicalModel.keyTechnicalData.inflationSystem}`,
            isThannerInflationSystem ? "M16 (THANNER) = união banjo / elbow / adaptação." : null,
            isThannerInflationSystem ? "Aqui mostrar banjo bolt, elbow banjo e adaptadores; DK99/DK96 e Y/T coupling ficam na cabeça de disparo." : null,
            ...getTechnicalInventoryReferenceLabels("banjo", "elbow connector", "connector thanner", "z5945", "z5946", "z5947"),
            field.name === "uniao_banjo_superior"
              ? (seaSafeSpec?.tuboCamaraSuperiorRef && `Referência associada (superior): ${seaSafeSpec.tuboCamaraSuperiorRef}`)
              : (seaSafeSpec?.tuboCamaraInferiorRef && `Referência associada (inferior): ${seaSafeSpec.tuboCamaraInferiorRef}`),
          ],
          torqueTokens: ["banjo", "elbow", "floating elbow", "union", ...(isThannerInflationSystem ? ["m16"] : [])],
          itemTokens: ["banjo", "elbow", "connector", "union", "z5945", "z5946", "z5947", "z63351", ...(isThannerInflationSystem ? ["m16"] : [])],
          extraReferences: [
            field.name === "uniao_banjo_superior" ? seaSafeSpec?.tuboCamaraSuperiorRef : seaSafeSpec?.tuboCamaraInferiorRef,
            ...getTechnicalInventoryItemsByTokens("banjo", "elbow connector", "connector thanner", "z5945", "z5946", "z5947").map((item) => item.reference),
          ],
          extraNotes: isThannerInflationSystem ? ["Nos sistemas THANNER, o M16 está associado à união/adaptação banjo e não deve ser mostrado como inlet valve genérica nesta linha."] : [],
        });
      case "tubos_alta_pressao":
        return buildGuide({
          title: "Dados técnicos dos tubos de alta pressão",
          detailValues: [
            technicalModel.keyTechnicalData?.inflationSystem && `Sistema: ${technicalModel.keyTechnicalData.inflationSystem}`,
            isThannerInflationSystem ? "M16 (THANNER) não é mostrado aqui; está na linha da união banjo." : "M16 (não THANNER) = conector do tubo na inlet valve.",
            "Torque a confirmar na ligação do tubo à inlet valve e à válvula do cilindro",
            isLeafieldInflationSystem ? "Rapid hose / rapid elbow hose ficam nesta linha; firing head e slave head ficam na cabeça de disparo." : null,
            hasRapidHose ? "Rapid hose = mangueira de alta pressão da linha inferior / ligação de serviço conforme o modelo." : null,
            hasRapidElbowHose ? "Rapid elbow hose = mangueira cotovelo de alta pressão da linha superior." : null,
            ...getTechnicalInventoryReferenceLabels("rapid hose", "rapid elbow hose", "hose m16", "g3/8", "m16-g3/8", "m16-m16"),
            ...getModelTubeDetails().map((tube) => `Tubos: ${tube}`),
          ],
          torqueTokens: ["hose", "mangueira", "tubo", ...(isThannerInflationSystem ? [] : ["m16"]), "g3 8", "rapid hose", "siphon tube", "inlet valve", "valvula entrada", "valvula do cilindro", "cylinder valve", "cilindro"],
          itemTokens: ["hose", "mangueira", "tubo", ...(isThannerInflationSystem ? [] : ["m16"]), "g3/8", "inlet valve", "valvula entrada", "valvula do cilindro", "cylinder valve"],
          extraReferences: [
            seaSafeSpec?.tuboCamaraSuperiorRef,
            seaSafeSpec?.tuboCamaraInferiorRef,
            ...getTechnicalInventoryItemsByTokens("rapid hose", "rapid elbow hose", "hose m16", "g3/8", "m16-g3/8", "m16-m16").map((item) => item.reference),
          ],
          extraNotes: [technicalModel.keyTechnicalData?.tubes, isThannerInflationSystem ? "Em THANNER, o M16 foi desviado para a linha da união banjo; aqui ficam os torques do tubo, inlet valve quando aplicável e ligação ao cilindro." : "Inclui o aperto do conector na inlet valve e a união do tubo à válvula do cilindro quando o manual do modelo o indicar."],
        });
      case "cabeca_disparo":
        return buildGuide({
          title: "Dados técnicos da cabeça de disparo",
          detailValues: [
            technicalModel.head && `Cabeça / firing head: ${technicalModel.head}`,
            technicalModel.keyTechnicalData?.inflationSystem && `Sistema: ${technicalModel.keyTechnicalData.inflationSystem}`,
            isThannerInflationSystem && hasDk99Head ? "DK99 = cabeça de disparo principal / firing head." : null,
            isThannerInflationSystem && hasDk96Head ? "DK96 = cabeça slave / segunda cabeça de descarga." : null,
            isThannerInflationSystem && hasYCoupling ? "Y coupling = distribuidor/acoplamento montado no conjunto da DK99." : null,
            isThannerInflationSystem && hasTCoupling ? "T coupling = variante de distribuidor do conjunto de disparo; não pertence à linha da união banjo." : null,
            isLeafieldInflationSystem ? "LEAFIELD: firing head e slave head ficam nesta linha; rapid hoses ficam nos tubos." : null,
            ...getTechnicalInventoryReferenceLabels("dk99", "dk96", "y coupling", "t coupling", "firing head", "slave head", "operating head"),
          ],
          torqueTokens: ["cabeca", "cabeça", "head", "firing", "operating head", "slave head", "dk96", "dk99", "acionamento", "y coupling"],
          itemTokens: ["head", "cabeca", "cabeça", "firing", "operating head", "slave", "dk96", "dk99", "y coupling", "t coupling"],
          extraReferences: [
            String(checklistValues[field.name] || "").trim(),
            selectedRaft?.cylinderCabecaDisparoRef,
            seaSafeSpec?.cabecaDisparoRef,
            ...getTechnicalInventoryItemsByTokens("dk99", "dk96", "y coupling", "t coupling", "firing head", "slave head", "operating head").map((item) => item.reference),
          ],
          extraNotes: [technicalModel.head, isThannerInflationSystem ? "Nos conjuntos THANNER, o Y coupling / T coupling pertence ao conjunto da cabeça DK99 e não à linha da união banjo." : null, isLeafieldInflationSystem ? "Nos conjuntos Leafield, esta linha representa a firing head principal e a slave head; as rapid hoses ficam na linha dos tubos." : null],
        });
      case "cabo_disparo":
        return buildGuide({
          title: "Dados técnicos do cabo de disparo",
          detailValues: [
            technicalModel.head && `Sistema cabeça/cabo: ${technicalModel.head}`,
            isLeafieldInflationSystem ? "Nesta linha mostrar actuator / firing cable / protective tube; não repetir rapid hoses nem slave/firing heads." : null,
            hasFiringCable ? "Firing cable / actuator = cabo de disparo; protective tube = proteção do cabo." : null,
            isThannerInflationSystem ? "Nos sistemas THANNER pode não existir cabo dedicado no catálogo; a cabeça DK99/DK96 continua na linha acima." : null,
            ...getTechnicalInventoryReferenceLabels("firing cable", "actuator", "protective tube", "operating head screws"),
          ],
          torqueTokens: ["operating head", "acionamento", "screws"],
          itemTokens: ["wire", "cabo", "lanyard", "actuator", "protective tube", "operating head screws"],
          extraReferences: [
            selectedRaft?.cylinderCabecaDisparoRef,
            seaSafeSpec?.cabecaDisparoRef,
            ...getTechnicalInventoryItemsByTokens("firing cable", "actuator", "protective tube", "operating head screws").map((item) => item.reference),
          ],
          extraNotes: [isLeafieldInflationSystem ? "Linha orientada para o cabo/actuador e respetiva proteção, separada das rapid hoses e das cabeças." : null],
        });
      case "valvulas_insuflacao":
        return buildGuide({
          title: "Dados técnicos das válvulas de insuflação",
          detailValues: [
            technicalModel.keyTechnicalData?.inflationSystem && `Sistema: ${technicalModel.keyTechnicalData.inflationSystem}`,
            technicalModel.keyTechnicalData?.valves && `Válvulas: ${technicalModel.keyTechnicalData.valves}`,
            isThannerInflationSystem ? "Em THANNER, o M16 fica associado à união banjo e não a esta linha de válvulas." : "Quando aplicável, o M16 aqui corresponde ao conector da inlet valve.",
          ],
          torqueTokens: ["inlet valve", "inflation valve", "valvula entrada", "m24", ...(isThannerInflationSystem ? [] : ["m16"]), "valve assembly", "valvula do cilindro", "rapid elbow hose"],
          itemTokens: ["inlet valve", "inflation valve", "valvula", "válvula", "leafield", "thanner", "service kit", ...(isThannerInflationSystem ? [] : ["m16"])],
          extraNotes: [technicalModel.keyTechnicalData?.valves, isThannerInflationSystem ? "A correspondência M16 foi removida desta linha para sistemas THANNER." : null],
        });
      case "valvulas_atestar_interior":
        return buildGuide({
          title: "Dados técnicos das válvulas de atestar",
          detailValues: [technicalModel.keyTechnicalData?.valves && `Válvulas: ${technicalModel.keyTechnicalData.valves}`],
          torqueTokens: ["reabastecimento", "top up", "topping", "vacuo", "vacuum", "atestar"],
          itemTokens: ["top up", "topping", "vacuum", "reabastecimento", "valvula"],
        });
      default:
        return null;
    }
  };

  const renderChecklistTechnicalGuide = (guide: ChecklistTechnicalGuide | null) => {
    if (!guide) return null;

    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Assistência técnica do modelo</div>
            <div className="text-sm font-bold text-slate-900">{guide.title}</div>
          </div>
          <div className="text-xs text-slate-500">
            Modelo técnico: <span className="font-semibold text-slate-700">{technicalModel?.name || selectedRaft?.model || "—"}</span>
          </div>
        </div>

        {guide.details.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {guide.details.map((detail) => (
              <span key={detail} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-800">
                {detail}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
          <div className="space-y-3">
            {guide.torques.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Torques aplicáveis</div>
                <ul className="space-y-1 text-xs text-slate-700">
                  {guide.torques.map((torque) => (
                    <li key={torque} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">{torque}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {guide.references.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Referências / códigos</div>
                <div className="flex flex-wrap gap-2">
                  {guide.references.map((reference) => (
                    <span key={reference} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                      {reference}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {guide.notes.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Notas</div>
                <ul className="space-y-1 text-xs text-slate-600">
                  {guide.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Fotos / esquema disponível</div>
            {guide.stockItems.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {guide.stockItems.slice(0, 3).map((item) => (
                  <div key={String(item.id || item.referencia || item.codigoFabricante)} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2">
                    {item.foto ? (
                      <img src={item.foto} alt={item.descricao || item.nome || item.referencia} className="h-16 w-16 flex-shrink-0 rounded-lg border object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border bg-slate-100 text-2xl">📷</div>
                    )}
                    <div className="min-w-0 text-xs">
                      <div className="line-clamp-2 font-semibold text-slate-800">{item.descricao || item.nome || "Artigo de stock"}</div>
                      <div className="text-slate-500">Ref: {item.referencia || "—"}</div>
                      {item.codigoFabricante ? <div className="text-slate-400">Fab: {item.codigoFabricante}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
                Sem foto ou esquema técnico associado no stock para estas referências.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const openStockPickerForField = async (field: ChecklistField) => {
    const config = getChecklistFieldStockConfig(field);
    setStockPicker({
      sourceFieldName: config.sourceFieldName,
      fieldLabel: field.label,
      articleName: config.articleName,
      validityFieldName: config.validityField,
      quantity: config.quantity,
      stockReferences: config.refs,
      articleTokens: config.articleTokens,
    });
    setStockSearch("");
    setStockBarcodeSearch("");
    setStockLoading(true);
    try {
      const res = await fetch("/api/stock?take=5000");
      if (!res.ok) throw new Error("Falha ao carregar stock");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setStockItems(data);
      } else {
        setStockItems(Array.isArray(stockCatalog) ? stockCatalog : []);
      }
    } catch {
      setStockItems(Array.isArray(stockCatalog) ? stockCatalog : []);
    } finally {
      setStockLoading(false);
    }
  };

  const handleStockPick = (item: any) => {
    if (!stockPicker) return;

    const validadeIso = item.validade ? toIsoLike(String(item.validade)) : "";
    setChecklistValues((prev) => ({
      ...prev,
      [stockPicker.sourceFieldName]: true,
      ...(stockPicker.validityFieldName ? { [stockPicker.validityFieldName]: validadeIso || String(item.validade || "") } : {}),
    }));

    setStockReplacements((prev) => ({
      ...prev,
      [stockPicker.sourceFieldName]: {
        sourceFieldName: stockPicker.sourceFieldName,
        fieldLabel: stockPicker.fieldLabel,
        articleName: stockPicker.articleName,
        validityFieldName: stockPicker.validityFieldName,
        quantity: Math.max(1, Number(stockPicker.quantity || 1)),
        stockId: Number(item.id),
        referencia: String(item.referencia || "").trim(),
        codigoFabricante: String(item.codigoFabricante || "").trim() || undefined,
        descricao: String(item.descricao || stockPicker.articleName || stockPicker.fieldLabel || "").trim(),
        validade: validadeIso || String(item.validade || "") || undefined,
        pickedAt: new Date().toISOString(),
      },
    }));

    setStockPicker(null);
  };

  const filteredStockItems = useMemo(() => {
    if (!stockPicker) return [] as any[];

    const manualQuery = normalizeText(stockSearch);
    const barcodeQuery = normalizeText(stockBarcodeSearch);
    const refs = new Set((stockPicker.stockReferences || []).map((value) => normalizeText(value)).filter(Boolean));
    const tokens = (stockPicker.articleTokens || []).map((value) => normalizeText(value)).filter(Boolean);

    return [...stockItems]
      .filter((item) => Number(item?.quantidade ?? 0) > 0)
      .filter((item) => {
        const descricao = normalizeText(item?.descricao);
        const referencia = normalizeText(item?.referencia);
        const codigoFabricante = normalizeText(item?.codigoFabricante);
        const inventario = normalizeText(item?.inventario);
        const lote = normalizeText(item?.lote);

        const matchesManual = !manualQuery || [descricao, referencia, codigoFabricante].some((value) => value.includes(manualQuery));
        const matchesBarcode = !barcodeQuery || [referencia, codigoFabricante, inventario, lote].some((value) => value.includes(barcodeQuery));
        return matchesManual && matchesBarcode;
      })
      .sort((a, b) => {
        const score = (item: any) => {
          const descricao = normalizeText(item?.descricao);
          const referencia = normalizeText(item?.referencia);
          const codigoFabricante = normalizeText(item?.codigoFabricante);
          const directRef = refs.has(referencia) || refs.has(codigoFabricante);
          const tokenMatch = tokens.some((token) => descricao.includes(token) || referencia.includes(token) || codigoFabricante.includes(token));
          return (directRef ? 1000 : 0) + (tokenMatch ? 100 : 0) + Math.max(0, Number(item?.quantidade ?? 0));
        };

        return score(b) - score(a);
      });
  }, [stockPicker, stockItems, stockSearch, stockBarcodeSearch]);

  // ── Scanner Lifecycle ──
  useEffect(() => {
    if (!isScanOpenInsp) {
      setUseCameraInsp(false);
    }
  }, [isScanOpenInsp]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const html5QrCode = new Html5Qrcode("reader-insp");
        scannerRefInsp.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            handleScanCodeInsp(decodedText);
            setUseCameraInsp(false);
          },
          () => {}
        );
      } catch (err) {
        console.error("Camera error (Inspections):", err);
        setScanErrorInsp("Erro ao ligar a câmara. Certifique-se de que deu permissões.");
        setUseCameraInsp(false);
      }
    };

    const stopCamera = () => {
      try {
        if (scannerRefInsp.current) {
          scannerRefInsp.current.stop().catch(() => {});
          scannerRefInsp.current = null;
        }
      } catch {}
    };

    if (useCameraInsp) {
      void startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [useCameraInsp]);

  const handleScanCodeInsp = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setScanErrorInsp(null);

    // Try to find a stock item matching by referencia or codigoBarras
    const matchedStockItem = stockItems.find(
      (stock) => stock.referencia === cleanCode || stock.codigoBarras === cleanCode
    );
    if (matchedStockItem) {
      // Fill barcode search field so the stock picker filters to this item
      setStockBarcodeSearch(cleanCode);
      setScanMockCodeInsp("");
      setIsScanOpenInsp(false);
      return;
    }

    // Fuzzy match: try normalized partial match
    const normalizedCode = normalizeText(cleanCode);
    const fuzzyMatch = stockItems.find((stock) => {
      const ref = normalizeText(stock.referencia);
      const barcode = normalizeText(stock.codigoBarras);
      const fab = normalizeText(stock.codigoFabricante);
      return ref.includes(normalizedCode) || barcode.includes(normalizedCode) || fab.includes(normalizedCode);
    });
    if (fuzzyMatch) {
      setStockBarcodeSearch(cleanCode);
      setScanMockCodeInsp("");
      setIsScanOpenInsp(false);
      return;
    }

    setScanErrorInsp(`Nenhum artigo em stock coincide com o código "${cleanCode}".`);
  };

  const buildChecklistSnapshot = () => {
    const snapshot: Record<string, string | number | boolean> = { ...checklistValues };

    checklistSections.forEach((section: any) => {
      (section?.fields || []).forEach((field: ChecklistField) => {
        const rowMeta = getChecklistRowMeta(field);
        const sourceFieldName = rowMeta.sourceFieldName || field.packItem?.checklistName || CHECKLIST_SOURCE_FIELD_BY_VALIDITY[field.name] || field.name;
        const referenceFieldName = CHECKLIST_REFERENCE_FIELD_BY_SOURCE[sourceFieldName];
        if (referenceFieldName && rowMeta.referenceCode) {
          snapshot[referenceFieldName] = rowMeta.referenceCode;
        }
        if (rowMeta.validityFieldName && rowMeta.validityValue) {
          snapshot[rowMeta.validityFieldName] = toIsoLike(rowMeta.validityValue) || rowMeta.validityValue;
        }
        if (field.type === "checkbox" && rowMeta.replacement) {
          snapshot[sourceFieldName] = true;
        }
      });
    });

    return snapshot;
  };

  const buildInspectionReplacementPayload = () => {
    return Object.values(stockReplacements).map((replacement) => ({
      stockId: replacement.stockId,
      referencia: replacement.referencia,
      codigoFabricante: replacement.codigoFabricante,
      descricao: replacement.descricao || replacement.articleName,
      quantidade: replacement.quantity,
      validade: replacement.validade,
      motivo: `Substituição checklist: ${replacement.fieldLabel}`,
    }));
  };

  const renderChecklistTableSection = (section: any) => {
    const visibleFields = (section?.fields || []).filter((field: ChecklistField) => !field.name.startsWith("validade_"));

    return (
      <div className="rounded-lg border border-gray-400 overflow-hidden bg-white">
        <div className="bg-gray-600 px-4 py-2 text-white">
          <div className="text-2xl font-bold uppercase tracking-tight">{section.title}</div>
          {section.englishTitle && <div className="text-xl text-gray-100">{section.englishTitle}</div>}
        </div>
        <table className="w-full table-fixed border-collapse text-sm">
          <tbody>
            {visibleFields.map((field: ChecklistField) => {
              const value = checklistValues[field.name];
              const rowMeta = getChecklistRowMeta(field);
              const technicalGuide = getChecklistTechnicalGuide(field, rowMeta);
              const isCheckbox = field.type === "checkbox";
              const isHighlighted = !!rowMeta.refValue || !!rowMeta.validityLabel;

              return (
                <React.Fragment key={field.name}>
                  <tr className="border-t border-gray-400 align-top">
                    <td className="w-[44%] bg-[#efefef] px-3 py-2">
                      <div className="text-[13px] font-bold text-black">{field.label}</div>
                      {field.englishLabel && <div className="text-[11px] text-gray-700">{field.englishLabel}</div>}
                    </td>
                    <td className="w-[8%] bg-[#efefef] px-2 py-2 text-center align-middle">
                      {isCheckbox ? (
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => setChecklistValues((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                        />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`w-[24%] px-2 py-2 align-middle ${isHighlighted ? 'bg-lime-400' : 'bg-white'}`}>
                      {isCheckbox ? (
                        <div className="text-right font-bold text-black">{rowMeta.refValue || ''}</div>
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          value={String(value ?? "")}
                          onChange={(e) => setChecklistValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          className={`w-full rounded border px-2 py-1 text-sm text-right text-gray-900 ${String(value ?? "").trim() ? 'bg-lime-400 font-bold' : 'bg-white'}`}
                        />
                      )}
                    </td>
                    <td className={`w-[16%] px-2 py-2 align-middle ${rowMeta.validityLabel ? 'bg-lime-400' : 'bg-white'}`}>
                      <div className="text-right font-bold text-black">{rowMeta.validityLabel || ''}</div>
                    </td>
                    <td className="w-[8%] px-2 py-2 align-middle text-right">
                      {rowMeta.expiring ? (
                        <button
                          type="button"
                          onClick={() => void openStockPickerForField(field)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Subst.
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {technicalGuide ? (
                    <tr className="border-t border-slate-200">
                      <td colSpan={5} className="bg-white px-3 py-3">
                        {renderChecklistTechnicalGuide(technicalGuide)}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderChecklistField = (field: ChecklistField) => {
    const value = checklistValues[field.name];

    // Se for artigo, mostrar validade e alerta
    let validityInfo = null;
    if (field.name.startsWith('artigo_')) {
      const artigoNome = field.label?.toLowerCase();
      const validade = lastInspectionValidities[artigoNome];
      if (validade) {
        // Considera data da inspeção anterior ou hoje
        const refDate = lastInspection?.date || new Date().toISOString().slice(0, 10);
        const months = monthsBetween(refDate, validade);
        const isExpiring = months < 12;
        validityInfo = (
          <span className={`ml-2 text-xs font-semibold ${isExpiring ? 'text-red-600' : 'text-gray-500'}`}>
            Validade: {(() => { const ym = normalizeMonthYearValue(validade); return ym ? `${ym.split('-')[1]}/${ym.split('-')[0]}` : '—'; })()} {isExpiring && <span className="ml-1 bg-red-100 text-red-700 px-2 py-0.5 rounded">Substituir</span>}
          </span>
        );
      }
    }

    // Para campos de validade do pack obrigatório: alerta + botão substituir
    let validadeAlert = null;
    if (field.name.startsWith('validade_') && field.type === 'date') {
      const dateStr = String(value ?? '');
      if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const today = new Date().toISOString().slice(0, 10);
        const months = monthsBetween(today, dateStr);
        if (months < 12) {
          validadeAlert = (
            <div className="flex items-center gap-2 mt-1 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <span className="font-semibold">⚠️ Validade em menos de {months <= 0 ? 'EXPIRADO' : `${months} meses`}!</span>
              <button
                type="button"
                onClick={() => void openStockPickerForField(field)}
                className="ml-auto px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition"
              >
                Substituir
              </button>
            </div>
          );
        }
      }
    }

    if (field.type === "checkbox") {
      return (
        <label key={field.name} className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setChecklistValues((prev) => ({ ...prev, [field.name]: e.target.checked }))}
          />
          <span>{field.label}</span>
          {validityInfo}
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.name} className="space-y-1">
          <label className="text-xs text-gray-700 font-medium">{field.label}</label>
          <select
            value={String(value ?? "")}
            onChange={(e) => setChecklistValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
            className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
          >
            <option value="">Selecionar...</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={field.name} className="space-y-1">
        <label className="text-xs text-gray-700 font-medium">{field.label} {validityInfo}</label>
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(e) => setChecklistValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
          className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
        />
        {validadeAlert}
      </div>
    );
  };

  // Cálculo automático dos testes WP (correções e queda real)
  useEffect(() => {
    if (!isChecklistStart) return;

    const parseNum = (value: unknown) => {
      const n = Number(String(value ?? "").replace(",", ".").trim());
      return Number.isFinite(n) ? n : null;
    };

    const at1 = parseNum(checklistValues.at1);
    const at2 = parseNum(checklistValues.at2);
    const p1Inf = parseNum(checklistValues.p1_inferior);
    const p1Sup = parseNum(checklistValues.p1_superior);
    const p2Inf = parseNum(checklistValues.p2_inferior);
    const p2Sup = parseNum(checklistValues.p2_superior);

    if ([at1, at2, p1Inf, p1Sup, p2Inf, p2Sup].some((v) => v === null)) return;

    const corrInf = (p1Inf as number) + ((at2 as number) - (at1 as number));
    const corrSup = (p1Sup as number) + ((at2 as number) - (at1 as number));

    const dropInf = corrInf > 0 ? Math.max(0, ((corrInf - (p2Inf as number)) / corrInf) * 100) : 0;
    const dropSup = corrSup > 0 ? Math.max(0, ((corrSup - (p2Sup as number)) / corrSup) * 100) : 0;

    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const nextAprovacao = dropInf <= 10 && dropSup <= 10 ? "Aprovado" : "Reprovado";

    setChecklistValues((prev) => {
      const next = {
        ...prev,
        p1_corrigida_inferior: round3(corrInf),
        p1_corrigida_superior: round3(corrSup),
        queda_real_inferior: round3(dropInf),
        queda_real_superior: round3(dropSup),
        aprovacao_wp: nextAprovacao,
      } as Record<string, string | number | boolean>;

      const unchanged =
        String(prev.p1_corrigida_inferior ?? "") === String(next.p1_corrigida_inferior ?? "") &&
        String(prev.p1_corrigida_superior ?? "") === String(next.p1_corrigida_superior ?? "") &&
        String(prev.queda_real_inferior ?? "") === String(next.queda_real_inferior ?? "") &&
        String(prev.queda_real_superior ?? "") === String(next.queda_real_superior ?? "") &&
        String(prev.aprovacao_wp ?? "") === String(next.aprovacao_wp ?? "");

      return unchanged ? prev : next;
    });
  }, [
    isChecklistStart,
    checklistValues.at1,
    checklistValues.at2,
    checklistValues.p1_inferior,
    checklistValues.p1_superior,
    checklistValues.p2_inferior,
    checklistValues.p2_superior,
  ]);

  const canProceedChecklistStep = (step: number) => {
    if (!isChecklistStart) return true;
    const section = checklistSections[step];
    if (!section) return false;

    const hasInvalidRequired = section.fields.some((field) => {
      if (!field.required) return false;
      const value = checklistValues[field.name];
      return value === undefined || value === null || String(value).trim() === "";
    });

    if (hasInvalidRequired) return false;

    if (step === 0) {
      const hasShip =
        !!String(quickInspection.shipId || "").trim() ||
        !!String(quickInspection.navioNome || "").trim() ||
        !!String(checklistValues.ship || "").trim();
      const hasRaft =
        !!String(quickInspection.raftId || "").trim() ||
        !!String(quickInspection.jangadaSerial || "").trim() ||
        !!String(checklistValues.serial || "").trim();
      return hasShip && hasRaft;
    }

    return true;
  };

  const handleChecklistNextStep = () => {
    if (!canProceedChecklistStep(wizardStep)) {
      alert("Preencha os campos obrigatórios deste passo antes de continuar.");
      return;
    }
    setWizardStep((prev) => Math.min(prev + 1, checklistSections.length - 1));
  };

  const handleChecklistPreviousStep = () => {
    setWizardStep((prev) => Math.max(prev - 1, 0));
  };

  const handleQuickInspectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checklistInspectionDate = String(checklistValues.data_inspecao || "").trim();
    const checklistShip = String(checklistValues.ship || "").trim();
    const checklistSerial = String(checklistValues.serial || "").trim();
    const effectiveDate = quickInspection.date || checklistInspectionDate;
    if (!effectiveDate) return;
    const resolvedStatus = isChecklistStart ? "Concluída" : (quickInspection.status || "Pendente");
    const resolvedCertificado = quickInspection.certificadoNumero || (isChecklistStart ? `CHECK-${Date.now()}` : "");
    const isExternalCertificate = isChecklistStart && quickInspection.certificateMode === "externo";

    const checklistSnapshot = buildChecklistSnapshot();
    const artigosSubstituidos = buildInspectionReplacementPayload();

    const newInspection = {
      id: Date.now().toString(),
      shipId: quickInspection.shipId || "",
      raftId: quickInspection.raftId || "",
      navioNome: quickInspection.navioNome || checklistShip || "",
      jangadaSerial: quickInspection.jangadaSerial || checklistSerial || "",
      date: effectiveDate,
      status: resolvedStatus,
      responsavel: quickInspection.responsavel || serviceTechnicians[0],
      certificadoNumero: resolvedCertificado,
      sourceFile: isChecklistStart ? "checklist_quadro" : null,
      checklistSnapshot,
      artigosSubstituidos,
    };
    let persistedInspection: any = {
      ...newInspection,
      artigos: artigosSubstituidos.map((item) => ({
        name: item.descricao,
        quantidade: item.quantidade,
        validade: item.validade,
        referencia: item.referencia,
        codigoFabricante: item.codigoFabricante,
      })),
    };

    try {
      const response = await fetch("/api/inspecoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInspection),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || "Falha ao guardar a inspeção.");
      }

      const savedInspection = await response.json();
      if (savedInspection) {
        persistedInspection = {
          ...normalizeInspection(savedInspection),
          sourceFile: savedInspection.sourceFile,
          artigos: Array.isArray(savedInspection.artigos) ? savedInspection.artigos : persistedInspection.artigos,
          responsavel: quickInspection.responsavel || serviceTechnicians[0],
          checklistSnapshot,
          artigosSubstituidos,
        };
      }
    } catch (error) {
      console.error("Erro ao guardar inspeção:", error);
      alert(error instanceof Error ? error.message : "Não foi possível guardar a inspeção.");
      return;
    }

    const updatedInspections = [...inspections, persistedInspection];
    setInspections(updatedInspections);
    localStorage.setItem("inspections", JSON.stringify(updatedInspections));
    addAudit("Cadastro rápido", persistedInspection);

    if (isChecklistStart) {
      markServiceStationFinalized(persistedInspection.raftId, persistedInspection.jangadaSerial);
      try {
        await emitAutomaticReports(persistedInspection, { emitInternalCertificate: !isExternalCertificate, checklistSnapshot });
      } catch (error) {
        console.error("Erro na emissão automática de relatórios:", error);
        alert("Checklist finalizada, mas houve erro ao emitir algum relatório automático.");
      }
    }

    if (isChecklistStart) {
      clearChecklistDraft(persistedInspection.raftId, persistedInspection.jangadaSerial);
      setChecklistValues({});
      setStockReplacements({});
    }
    setShowModal(false);
    setIsChecklistStart(false);
    setWizardStep(0);
    if (isChecklistStart && isExternalCertificate) {
      const params = new URLSearchParams({
        raftId: String(persistedInspection.raftId || ""),
        serial: String(persistedInspection.jangadaSerial || ""),
        shipName: String(persistedInspection.navioNome || ""),
        fromChecklist: "1",
      });
      window.location.href = `/fotos?${params.toString()}`;
      return;
    }

    const raftId = Number(persistedInspection.raftId);
    if (!isChecklistStart && Number.isFinite(raftId) && raftId > 0) {
      window.location.href = `/jangadas/${raftId}?startInspection=1`;
      return;
    }

    setQuickInspection({ shipId: "", raftId: "", navioNome: "", jangadaSerial: "", date: "", status: "", responsavel: serviceTechnicians[0], certificadoNumero: "", certificateMode: "interno" });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("startChecklist") !== "1") return;

    const serial = (params.get("serial") || "").trim();
    const shipName = (params.get("shipName") || "").trim();
    const raftId = (params.get("raftId") || "").trim();
    const responsavel = (params.get("responsavel") || serviceTechnicians[0]).trim();

    setIsChecklistStart(true);
    setShowModal(true);
    setPendingChecklistStart({ serial, shipName, raftId });

    const draft = readChecklistDraft(raftId, serial);
    if (draft?.data) {
      setQuickInspection((prev) => ({
        ...prev,
        ...draft.data,
      }));
      if (draft?.checklistValues && typeof draft.checklistValues === "object") {
        setChecklistValues(draft.checklistValues as Record<string, string | number | boolean>);
      }
      if (typeof draft.step === "number") {
        setWizardStep(Math.max(0, draft.step));
      }
    }

    setQuickInspection((prev) => ({
      ...prev,
      jangadaSerial: serial || prev.jangadaSerial,
      navioNome: shipName || prev.navioNome,
      responsavel: responsavel || prev.responsavel,
      raftId: raftId || prev.raftId,
      date: prev.date || new Date().toISOString().slice(0, 10),
      status: prev.status || "Pendente",
      certificateMode: prev.certificateMode || "interno",
    }));

    if (serial || raftId) {
      void updateServiceStationStatus({
        raftId: raftId || undefined,
        serial: serial || undefined,
        workflowStatus: "inspecao_em_curso",
        startedAt: new Date().toISOString(),
      }).catch(() => {
        // Ignora falhas laterais da estação
      });
    }

    window.history.replaceState({}, "", "/inspecoes");
  }, []);

  useEffect(() => {
    if (!pendingChecklistStart) return;

    const raftBySerial = pendingChecklistStart.serial
      ? rafts.find((item: any) => String(item?.serial || "").toLowerCase() === pendingChecklistStart.serial.toLowerCase())
      : undefined;

    const shipByName = pendingChecklistStart.shipName
      ? ships.find((item: any) => String(item?.nome || item?.name || "").toLowerCase() === pendingChecklistStart.shipName.toLowerCase())
      : undefined;

    setQuickInspection((prev) => ({
      ...prev,
      raftId: pendingChecklistStart.raftId || (raftBySerial?.id ? String(raftBySerial.id) : prev.raftId),
      jangadaSerial: pendingChecklistStart.serial || String(raftBySerial?.serial || "") || prev.jangadaSerial,
      shipId: shipByName?.id ? String(shipByName.id) : prev.shipId,
      navioNome: pendingChecklistStart.shipName || prev.navioNome,
    }));

    setPendingChecklistStart(null);
  }, [pendingChecklistStart, rafts, ships]);

  useEffect(() => {
    if (!isChecklistStart || !showModal) return;

    const raftId = String(quickInspection.raftId || "").trim();
    const serial = String(quickInspection.jangadaSerial || "").trim();
    if (!raftId && !serial) return;

    let cancelled = false;

    const loadRaftDetails = async () => {
      try {
        const endpoint = raftId
          ? `/api/jangadas/${encodeURIComponent(raftId)}`
          : `/api/jangadas/serial/${encodeURIComponent(serial)}`;

        const response = await fetch(endpoint);
        if (!response.ok) return;
        const data = await response.json();
        if (!data || cancelled) return;

        setChecklistRaftDetails(data);

        setQuickInspection((prev) => ({
          ...prev,
          raftId: prev.raftId || (data?.id ? String(data.id) : ""),
          jangadaSerial: prev.jangadaSerial || String(data?.serial || ""),
          navioNome: prev.navioNome || String(data?.shipNameManual || ""),
        }));
      } catch {
        // ignora erro e mantém fallback dos dados já carregados
      }
    };

    loadRaftDetails();

    return () => {
      cancelled = true;
    };
  }, [isChecklistStart, showModal, quickInspection.raftId, quickInspection.jangadaSerial]);

  useEffect(() => {
    if (!showModal || !isChecklistStart) return;
    saveChecklistDraft(wizardStep, quickInspection, checklistValues);
  }, [showModal, isChecklistStart, wizardStep, quickInspection, checklistValues]);

  useEffect(() => {
    if (!isChecklistStart || checklistSections.length === 0) return;

    const raftInput = {
      serial: selectedRaft?.serial || quickInspection.jangadaSerial,
      brand: selectedRaft?.brand,
      model: selectedRaft?.model,
      capacity: selectedRaft?.capacity,
      owner: selectedRaft?.owner || quickInspection.navioNome,
      dataFabrico: selectedRaft?.dataFabrico,
      packType: selectedRaft?.packType,
      containerModel: selectedRaft?.containerModel,
      cylinderCabecaDisparoRef: selectedRaft?.cylinderCabecaDisparoRef,
      tuboIdentificacao: selectedRaft?.tuboIdentificacao,
      dataInspecao: quickInspection.date || selectedRaft?.dataInspecao,
      shipNameManual: quickInspection.navioNome || selectedRaft?.shipNameManual,
      cylinder: {
        serial: selectedRaft?.cylinderSerial,
        tara: selectedRaft?.cylinderTara,
        pesoBruto: selectedRaft?.cylinderPesoBruto,
        co2: selectedRaft?.cylinderCo2,
        n2: selectedRaft?.cylinderN2,
        dataTeste: selectedRaft?.cylinderDataTeste,
        dataProxTeste: selectedRaft?.cylinderDataProxTeste,
        sistema: selectedRaft?.cylinderSistema,
      },
      artigos: Array.isArray(selectedRaft?.artigos) ? selectedRaft.artigos : [],
    };

    const initialValues = buildChecklistInitialValues(checklistSections, raftInput as any);
    setChecklistValues((prev) => {
      const merged = { ...prev } as Record<string, string | number | boolean>;
      Object.entries(initialValues).forEach(([key, value]) => {
        const current = prev[key];
        const isEmpty = current === undefined || current === null || (typeof current === "string" && current.trim() === "");
        if (isEmpty) {
          merged[key] = value;
        }
      });
      return merged;
    });
  }, [isChecklistStart, checklistSections, selectedRaft, quickInspection.jangadaSerial, quickInspection.navioNome, quickInspection.date]);

  useEffect(() => {
    if (!showModal || !isChecklistStart) return;
    markServiceStationInProgress(quickInspection.raftId, quickInspection.jangadaSerial);
  }, [showModal, isChecklistStart, quickInspection.raftId, quickInspection.jangadaSerial]);

  useEffect(() => {
    fetch("/api/inspecoes")
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const normalized = data.map(normalizeInspection);
          setInspections(normalized);
          localStorage.setItem("inspections", JSON.stringify(normalized));
        }
      })
      .catch(() => {
      });
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch("/api/navios").then((res) => (res.ok ? res.json() : [] as any[])).catch(() => [] as any[]),
      fetch("/api/jangadas").then((res) => (res.ok ? res.json() : [] as any[])).catch(() => [] as any[]),
      fetch("/api/stock?take=5000").then((res) => (res.ok ? res.json() : [] as any[])).catch(() => [] as any[]),
    ]).then(([shipsData, raftsData, stockData]) => {
      if (!mounted) return;
      const safeShips = Array.isArray(shipsData) ? shipsData : [];
      const safeRafts = Array.isArray(raftsData) ? raftsData : [];
      const safeStock = Array.isArray(stockData) ? stockData : [];
      setShips(safeShips);
      setRafts(safeRafts);
      setStockCatalog(safeStock);
      localStorage.setItem("ships", JSON.stringify(safeShips));
      localStorage.setItem("rafts", JSON.stringify(safeRafts));
    }).catch(() => {
      if (!mounted) return;
      try {
        setShips(JSON.parse(localStorage.getItem("ships") || "[]"));
      } catch {
        setShips([]);
      }
      try {
        setRafts(JSON.parse(localStorage.getItem("rafts") || "[]"));
      } catch {
        setRafts([]);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const [auditLog, setAuditLog] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("auditInspections") || "[]");
    } catch { return []; }
  });

  // Precompute status options as strings to avoid TS 'unknown' issues
  const statusOptions: string[] = Array.from(new Set((inspections as any[]).map((i:any) => i.status).filter(Boolean))).map(s => String(s));

  const addAudit = (action: string, inspection: any) => {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      inspection,
    };
    setAuditLog((prev) => {
      const updatedLog = [entry, ...prev];
      localStorage.setItem("auditInspections", JSON.stringify(updatedLog));
      return updatedLog;
    });
  };

  const persistInspections = (items: any[]) => {
    setInspections(items);
    localStorage.setItem("inspections", JSON.stringify(items));
  };

  const removeInspectionAttachments = (ids: string[]) => {
    if (ids.length === 0) return;
    setAttachments((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        delete next[id];
      });
      localStorage.setItem("attachmentsInspections", JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteInspections = async (ids: string[]) => {
    const normalizedIds = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)));
    if (normalizedIds.length === 0) return;

    const targets = inspections.filter((inspection) => normalizedIds.includes(String(inspection.id)));
    const remaining = inspections.filter((inspection) => !normalizedIds.includes(String(inspection.id)));

    persistInspections(remaining);
    setSelectedInspectionIds((prev) => prev.filter((id) => !normalizedIds.includes(id)));
    removeInspectionAttachments(normalizedIds);
    targets.forEach((inspection) => addAudit(normalizedIds.length > 1 ? "Excluído em lote" : "Excluído", inspection));

    const numericIds = normalizedIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    try {
      if (numericIds.length > 1) {
        const response = await fetch("/api/inspecoes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: numericIds }),
        });
        if (!response.ok) throw new Error(await response.text());
        return;
      }

      const singleId = numericIds[0];
      if (singleId) {
        const response = await fetch(`/api/inspecoes?id=${singleId}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await response.text());
      }
    } catch (error) {
      console.error("Erro ao apagar inspeções:", error);
      alert("As inspeções foram removidas da lista local, mas houve erro ao apagar na base de dados.");
    }
  };

  // Funções de backup/restauração
  const handleBackup = () => {
    const data = {
      inspections,
      auditLog,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_inspecoes_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.inspections) {
          setInspections(data.inspections);
          localStorage.setItem("inspections", JSON.stringify(data.inspections));
        }
        if (data.auditLog) {
          setAuditLog(data.auditLog);
          localStorage.setItem("auditInspections", JSON.stringify(data.auditLog));
        }
      } catch {}
    };
    reader.readAsText(file);
  };

  // Estado para anexos
  const [attachments, setAttachments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("attachmentsInspections") || "{}") as Record<string, Array<{name:string, url:string}>>
    } catch { return {}; }
  });

  // Função para anexar arquivos
  const handleAttach = (inspectionId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: Array<{name:string, url:string}> = [];
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        newFiles.push({ name: file.name, url });
        const updated = { ...attachments };
        updated[inspectionId] = [...(updated[inspectionId] || []), ...newFiles];
        setAttachments(updated);
        localStorage.setItem("attachmentsInspections", JSON.stringify(updated));
      };
      reader.readAsDataURL(file);
    });
  };

  // Função para exportar inspeção para Outlook (ICS)
  const exportToOutlook = (inspection: any) => {
    const ship = ships.find((s: { id: string; name: string }) => s.id === inspection.shipId);
    const raft = rafts.find((r: { id: string; model: string; serial?: string }) => r.id === inspection.raftId);
    const title = `Inspeção: ${ship?.nome || "Navio"} - ${raft?.model || "Jangada"}`;
    const description = `Status: ${inspection.status || ""}`;
    const date = inspection.date;
    const dtStart = date ? date.replace(/-/g, "") + "T090000" : "";
    const dtEnd = date ? date.replace(/-/g, "") + "T100000" : "";
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${title}\nDESCRIPTION:${description}\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics.replace(/\n/g, "\r\n")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspecao_${inspection.id}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Função para exportar inspeção para Google Calendar
  const exportToGoogleCalendar = (inspection: any) => {
    const ship = ships.find(s => s.id === inspection.shipId);
    const raft = rafts.find(r => r.id === inspection.raftId);
    const title = `Inspeção: ${ship?.nome || "Navio"} - ${raft?.model || "Jangada"}`;
    const description = `Status: ${inspection.status || ""}`;
    const date = inspection.date;
    if (!date) return;
    // Google Calendar espera formato YYYYMMDDTHHMMSSZ
    const start = `${date.replace(/-/g, "")}T09:00:00`; // 9h local
    const end = `${date.replace(/-/g, "")}T10:00:00`; // 10h local
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(description)}&dates=${start}/${end}`;
    window.open(url, "_blank");
  };

  // Função para exportar relatório customizado em PDF
  const exportReportPDF = async (email: string) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.text("Relatório de Inspeções", 14, 16);
    const filtered = inspections.filter((i: any) => i.responsavel === email);
    const rows = filtered.map((i: any) => {
      const ship = ships.find(s => s.id === i.shipId);
      const raft = rafts.find(r => r.id === i.raftId);
      return [
        ship?.nome || "Navio",
        raft?.model || "Jangada",
        i.date,
        i.status,
      ];
    });
    autoTable(doc, {
      head: [["Navio", "Jangada", "Data", "Status"]],
      body: rows,
      startY: 24,
    });
    doc.save(`relatorio_inspecoes_${email}.pdf`);
  };

  // Função para exportar relatório customizado em Excel
  const exportReportExcel = async (email: string) => {
    const XLSX = await import("xlsx");
    const filtered = inspections.filter((i: any) => i.responsavel === email);
      const rows = filtered.map((i: any) => {
      const ship = ships.find(s => s.id === i.shipId);
      const raft = rafts.find(r => r.id === i.raftId);
      return {
        Navio: ship?.nome || "Navio",
        Jangada: raft?.model || "Jangada",
        Data: i.date,
        Status: i.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inspeções");
    XLSX.writeFile(wb, `relatorio_inspecoes_${email}.xlsx`);
  };

  // Função para importar CSV
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const XLSX = await import("xlsx");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = XLSX.read(ev.target?.result, { type: "binary" });
      const sheet = data.Sheets[data.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      const importedInspections = rows.map((r: any) => ({
        id: Date.now().toString() + Math.random().toString().slice(2, 8),
        shipId: r.shipId || r.Navio || "",
        raftId: r.raftId || r.Jangada || "",
        date: r.date || r.Data || "",
        status: r.status || r.Status || "",
        responsavel: r.responsavel || r.Responsavel || "",
      }));
      const updatedInspections = [...inspections, ...importedInspections];
      setInspections(updatedInspections);
      localStorage.setItem("inspections", JSON.stringify(updatedInspections));
    };
    reader.readAsBinaryString(file);
  };

  // Visualização do relatório na aplicação
  const [reportEmail, setReportEmail] = useState("");
  const filteredReport = inspections.filter((i: any) => i.responsavel === reportEmail);
  const filteredInspections = inspections.filter((i) =>
    (!filterStatus || i.status === filterStatus) &&
    (!search ||
      (String(i.certificadoNumero || "").toLowerCase().includes(search.toLowerCase())) ||
      (getShipNameById(ships, i.shipId).toLowerCase().includes(search.toLowerCase())) ||
      (getRaftLabelById(rafts, i.raftId).toLowerCase().includes(search.toLowerCase())) ||
      (String(i.navioNome || "").toLowerCase().includes(search.toLowerCase())) ||
      (String(i.jangadaSerial || "").toLowerCase().includes(search.toLowerCase())) ||
      (i.status && i.status.toLowerCase().includes(search.toLowerCase()))
    )
  );
  const filteredInspectionIds = filteredInspections.map((inspection) => String(inspection.id));
  const allFilteredSelected = filteredInspectionIds.length > 0 && filteredInspectionIds.every((id) => selectedInspectionIds.includes(id));
  const hasSelectedInspections = selectedInspectionIds.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 mb-1">Lista de Inspeções</h2>
          <p className="text-gray-600">Gerencie as inspeções com o mesmo padrão da lista de navios</p>
        </div>
        <button
          className="bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          onClick={() => {
            setIsChecklistStart(false);
            setWizardStep(0);
            setQuickInspection({ shipId: "", raftId: "", navioNome: "", jangadaSerial: "", date: "", status: "", responsavel: serviceTechnicians[0], certificadoNumero: "", certificateMode: "interno" });
            setShowModal(true);
          }}
        >
          + Cadastrar Nova Inspeção
        </button>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className={`bg-white p-6 rounded-xl shadow-lg w-full border border-gray-200 ${isChecklistStart ? 'max-w-6xl' : 'max-w-md'}`}>
            <h3 className="text-lg font-bold mb-4">{isChecklistStart ? "Iniciar checklist da jangada agendada" : "Cadastro rápido de Inspeção"}</h3>
            <form onSubmit={handleQuickInspectionSubmit} className="space-y-3">
              {!isChecklistStart && (
                <>
                  <input
                    list="inspection-ship-options"
                    type="text"
                    value={getShipInputValue(quickInspection.shipId, quickInspection.navioNome)}
                    onChange={(e) => handleQuickInspectionShipInput(e.target.value)}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                    placeholder="Navio (pesquisar ou escrever manualmente)"
                  />
                  <datalist id="inspection-ship-options">
                    {sortedShips.map((ship) => {
                      const label = getShipDisplayName(ship) || `Navio ${ship.id}`;
                      return <option key={ship.id} value={label} />;
                    })}
                  </datalist>
                  <select
                    name="raftId"
                    value={quickInspection.raftId}
                    onChange={(e) => {
                      handleQuickInspectionChange(e);
                      if (e.target.value) {
                        setQuickInspection((prev) => ({ ...prev, jangadaSerial: "" }));
                      }
                    }}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                  >
                    <option value="">Jangada</option>
                    {rafts.map(r => (
                      <option key={r.id} value={r.id}>{r.model} ({r.serial})</option>
                    ))}
                  </select>
                  <input
                    name="jangadaSerial"
                    type="text"
                    value={quickInspection.jangadaSerial}
                    onChange={(e) => {
                      handleQuickInspectionChange(e);
                      if (e.target.value.trim()) {
                        setQuickInspection((prev) => ({ ...prev, raftId: "" }));
                      }
                    }}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                    placeholder="Jangada/serial (manual, opcional)"
                  />
                  <input
                    name="date"
                    type="date"
                    value={quickInspection.date}
                    onChange={handleQuickInspectionChange}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                    required
                  />
                  <select
                    name="status"
                    value={quickInspection.status}
                    onChange={handleQuickInspectionChange}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                  >
                    <option value="">Status (opcional)</option>
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                    <option value="Pendente">Pendente</option>
                    <option value="Concluída">Concluída</option>
                  </select>
                  <select
                    name="responsavel"
                    value={quickInspection.responsavel}
                    onChange={handleQuickInspectionChange}
                    className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                  >
                    {serviceTechnicians.map((tecnico) => (
                      <option key={tecnico} value={tecnico}>{tecnico}</option>
                    ))}
                  </select>
                </>
              )}

              {isChecklistStart && (
                <>
                  <div className="border rounded-md p-3 bg-gray-50">
                    <p className="text-xs text-gray-600">Passo {wizardStep + 1} de {checklistSections.length}</p>
                    <p className="text-base font-semibold text-gray-900">{currentChecklistSection?.title || "Checklist"}</p>
                    {currentChecklistSection?.englishTitle && <p className="text-sm text-gray-600">{currentChecklistSection.englishTitle}</p>}
                  </div>
                  <div className="max-h-[70vh] overflow-auto rounded-md bg-white">
                    {!currentChecklistSection ? null : (currentChecklistSection.title === 'Dados Gerais')
                      ? (
                        <div className="border rounded-md p-3 space-y-2 bg-white">
                          {(currentChecklistSection.fields || []).map((field) => renderChecklistField(field))}
                        </div>
                      )
                      : renderChecklistTableSection(currentChecklistSection)}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={wizardStep === 0}
                      onClick={handleChecklistPreviousStep}
                      className="px-3 py-2 rounded bg-gray-200 text-gray-800 disabled:opacity-50"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={wizardStep >= checklistSections.length - 1}
                      onClick={handleChecklistNextStep}
                      className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
                    >
                      Próximo passo
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      name="certificadoNumero"
                      type="text"
                      value={quickInspection.certificadoNumero}
                      onChange={handleQuickInspectionChange}
                      className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                      placeholder="Número do certificado"
                    />
                    <select
                      name="certificateMode"
                      value={quickInspection.certificateMode}
                      onChange={handleQuickInspectionChange}
                      className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                    >
                      <option value="interno">Certificado interno</option>
                      <option value="externo">Certificado externo</option>
                    </select>
                    <select
                      name="responsavel"
                      value={quickInspection.responsavel}
                      onChange={handleQuickInspectionChange}
                      className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                    >
                      {serviceTechnicians.map((tecnico) => (
                        <option key={tecnico} value={tecnico}>{tecnico}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {!isChecklistStart && (
                <input
                  name="certificadoNumero"
                  type="text"
                  value={quickInspection.certificadoNumero}
                  onChange={handleQuickInspectionChange}
                  className="border rounded px-2 py-1 w-full text-gray-900 bg-white"
                  placeholder="Número do certificado"
                />
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => { setShowModal(false); setIsChecklistStart(false); }}>Cancelar</button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                  disabled={isChecklistStart && wizardStep < checklistSections.length - 1}
                >
                  {isChecklistStart ? "Finalizar checklist" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar navio, jangada, status..."
          className="border rounded px-2 py-1 w-1/2"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Todos os Status</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
        </select>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleBackup}>Backup</button>
        <label className="bg-yellow-500 text-white px-3 py-1 rounded cursor-pointer">
          Restaurar
          <input type="file" accept="application/json" className="hidden" onChange={handleRestore} />
        </label>
      </div>
      <div className="mb-4">
        <label className="bg-blue-600 text-white px-3 py-1 rounded cursor-pointer">
          Importar CSV
          <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportCSV} />
        </label>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!hasSelectedInspections) return;
            const total = selectedInspectionIds.length;
            if (!window.confirm(`Confirma exclusão de ${total} inspeção${total > 1 ? "ões" : ""}?`)) return;
            void handleDeleteInspections(selectedInspectionIds);
          }}
          disabled={!hasSelectedInspections}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-red-300"
        >
          Apagar selecionadas{hasSelectedInspections ? ` (${selectedInspectionIds.length})` : ""}
        </button>
        {hasSelectedInspections ? (
          <button
            type="button"
            onClick={() => setSelectedInspectionIds([])}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            Limpar seleção
          </button>
        ) : null}
      </div>
      <div className="flex gap-2 mb-4">
        {([
          { key: "quadros", label: "Quadros" },
          { key: "lista", label: "Lista" },
          { key: "detalhes", label: "Detalhes" }
        ] as const).map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => setViewMode(mode.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${viewMode === mode.key ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 ${viewMode === "lista" ? "" : "hidden"}`}>
      <h3 className="text-lg font-bold mb-2">Inspeções</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="p-2 whitespace-nowrap text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => {
                    setSelectedInspectionIds((prev) => {
                      if (e.target.checked) {
                        return Array.from(new Set([...prev, ...filteredInspectionIds]));
                      }
                      return prev.filter((id) => !filteredInspectionIds.includes(id));
                    });
                  }}
                  aria-label="Selecionar inspeções visíveis"
                />
              </th>
              <th className="p-2 whitespace-nowrap">Certificado</th>
              <th className="p-2 whitespace-nowrap">Navio</th>
              <th className="p-2 whitespace-nowrap">Jangada</th>
              <th className="p-2 whitespace-nowrap">Data</th>
              <th className="p-2 whitespace-nowrap">Status</th>
              <th className="p-2 whitespace-nowrap">Anexos</th>
              <th className="p-2 whitespace-nowrap">Outlook</th>
              <th className="p-2 whitespace-nowrap">Google</th>
            </tr>
          </thead>
          <tbody>
            {filteredInspections.map((i) => {
              const ship = ships.find(s => sameId(s.id, i.shipId));
              const raft = rafts.find(r => sameId(r.id, i.raftId));
              const inspectionId = String(i.id);
              const isSelected = selectedInspectionIds.includes(inspectionId);
              return (
                <tr key={i.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedInspectionIds((prev) => (
                          e.target.checked
                            ? Array.from(new Set([...prev, inspectionId]))
                            : prev.filter((id) => id !== inspectionId)
                        ));
                      }}
                      aria-label={`Selecionar inspeção ${i.certificadoNumero || inspectionId}`}
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap">{i.certificadoNumero || "-"}</td>
                  <td className="p-2 whitespace-nowrap">{ship?.nome || i.navioNome || <span className="text-gray-400">-</span>}</td>
                  <td className="p-2 whitespace-nowrap">{raft?.model || i.jangadaSerial || <span className="text-gray-400">-</span>}</td>
                  <td className="p-2 whitespace-nowrap">{i.date}</td>
                  <td className="p-2 whitespace-nowrap">{i.status}</td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <label className="bg-blue-200 px-2 py-1 rounded cursor-pointer text-xs">
                        Anexar
                        <input type="file" multiple className="hidden" onChange={e => handleAttach(i.id, e.target.files)} />
                      </label>
                      {attachments[i.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {attachments[i.id].map((att, idx) => (
                            <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 text-xs">
                              {att.name.endsWith(".jpg") || att.name.endsWith(".png") ? (
                                <img src={att.url} alt={att.name} className="w-12 h-12 object-cover rounded border" />
                              ) : att.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <button className="bg-blue-500 text-white px-2 py-1 rounded text-xs" onClick={() => exportToOutlook(i)}>
                      Outlook
                    </button>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <button className="bg-green-500 text-white px-2 py-1 rounded text-xs" onClick={() => exportToGoogleCalendar(i)}>
                      Google
                    </button>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs" title="Ver ficha" onClick={() => setViewModal({open:true, item:i})}>Ver ficha</button>
                      <button className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs" title="Editar ficha" onClick={() => setEditModal({open:true, item:i})}>Editar ficha</button>
                      <button className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs" title="Excluir" onClick={() => {
                        if(window.confirm('Confirma exclusão?')) {
                          void handleDeleteInspections([inspectionId]);
                        }
                      }}>🗑️</button>
                      <button className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs" title="Exportar" onClick={() => {
                        const blob = new Blob([JSON.stringify(i, null, 2)], {type:'application/json'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `inspecao_${i.id}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}>⬇️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredInspections.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <span>Nenhuma inspeção encontrada.</span>
                    <button
                      type="button"
                      onClick={() => setShowModal(true)}
                      className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                    >
                      + Cadastrar Nova Inspeção
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
      {/* Modal de Visualizar */}
      {viewModal.open && viewModal.item && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Ficha da Inspeção</h3>
            <ul className="mb-4">
              <li><b>Navio:</b> {ships.find(s => sameId(s.id, viewModal.item.shipId))?.name || viewModal.item.navioNome || viewModal.item.shipId}</li>
              <li><b>Jangada:</b> {rafts.find(r => sameId(r.id, viewModal.item.raftId))?.model || viewModal.item.jangadaSerial || viewModal.item.raftId}</li>
              <li><b>Certificado:</b> {viewModal.item.certificadoNumero || '-'}</li>
              <li><b>Data:</b> {viewModal.item.date}</li>
              <li><b>Status:</b> {viewModal.item.status}</li>
              <li><b>Responsável:</b> {viewModal.item.responsavel}</li>
            </ul>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded"
                onClick={() => {
                  setEditModal({ open: true, item: viewModal.item });
                  setViewModal({ open: false });
                }}
              >
                Editar ficha
              </button>
              <button className="px-4 py-2 bg-gray-300 rounded" onClick={() => setViewModal({open:false})}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Editar */}
      {editModal.open && editModal.item && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Editar Inspeção</h3>
            <form onSubmit={e => {
              e.preventDefault();
              if (!editModal.item) return;
              const updatedItem = {
                ...editModal.item,
                shipId: editModal.item.shipId ?? "",
                raftId: editModal.item.raftId ?? "",
                navioNome: editModal.item.navioNome ?? "",
                jangadaSerial: editModal.item.jangadaSerial ?? "",
                date: editModal.item.date ?? "",
                status: editModal.item.status ?? "",
                responsavel: editModal.item.responsavel ?? ""
              };
              setInspections((prev: any[]) => prev.map((ins: any) => ins.id === updatedItem.id ? updatedItem : ins));
              addAudit('Editado', updatedItem);
              fetch(`/api/inspecoes?id=${updatedItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedItem),
              });
              setEditModal({open:false});
            }} className="space-y-3">
              <input
                list="edit-inspection-ship-options"
                value={getShipInputValue(editModal.item.shipId, editModal.item.navioNome)}
                onChange={e => handleEditInspectionShipInput(e.target.value)}
                className="border rounded px-2 py-1 w-full"
                placeholder="Navio (pesquisar ou escrever manualmente)"
              />
              <datalist id="edit-inspection-ship-options">
                {sortedShips.map((ship) => {
                  const label = getShipDisplayName(ship) || `Navio ${ship.id}`;
                  return <option key={ship.id} value={label} />;
                })}
              </datalist>
              <select name="raftId" value={editModal.item.raftId} onChange={e => setEditModal(m => ({...m, item: {...m.item!, raftId: e.target.value, jangadaSerial: e.target.value ? "" : (m.item?.jangadaSerial || "")}}))} className="border rounded px-2 py-1 w-full">
                <option value="">Jangada</option>
                {rafts.map(r => (
                  <option key={r.id} value={r.id}>{r.model} ({r.serial})</option>
                ))}
              </select>
              <input name="jangadaSerial" value={editModal.item.jangadaSerial || ""} onChange={e => setEditModal(m => ({...m, item: {...m.item!, jangadaSerial: e.target.value, raftId: e.target.value.trim() ? "" : (m.item?.raftId || "")}}))} className="border rounded px-2 py-1 w-full" placeholder="Jangada/serial (manual, opcional)" />
              <input name="date" type="date" value={editModal.item.date} onChange={e => setEditModal(m => ({...m, item: {...m.item!, date: e.target.value}}))} className="border rounded px-2 py-1 w-full" required />
              <input name="certificadoNumero" value={editModal.item.certificadoNumero || ""} onChange={e => setEditModal(m => ({...m, item: {...m.item!, certificadoNumero: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Número de certificado" />
              <select name="status" value={editModal.item.status} onChange={e => setEditModal(m => ({...m, item: {...m.item!, status: e.target.value}}))} className="border rounded px-2 py-1 w-full">
                <option value="">Status (opcional)</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
                <option value="Pendente">Pendente</option>
                <option value="Concluída">Concluída</option>
              </select>
              <select name="responsavel" value={editModal.item.responsavel || serviceTechnicians[0]} onChange={e => setEditModal(m => ({...m, item: {...m.item!, responsavel: e.target.value}}))} className="border rounded px-2 py-1 w-full">
                {serviceTechnicians.map((tecnico) => (
                  <option key={tecnico} value={tecnico}>{tecnico}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => setEditModal({open:false})}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {viewMode === "quadros" && (
        <div className="space-y-6 mb-6">
          {Object.values(filteredInspections.reduce((acc: any, i: any) => {
            const ship = ships.find(s => sameId(s.id, i.shipId));
            const navioLabel = ship?.nome || i.navioNome || "Desconhecido";
            const key = `NAV-${navioLabel}-DATE-${i.date || 'sem-data'}`; if (!acc[key]) { acc[key] = { key, navioNome: navioLabel, date: i.date,
                inspecoes: []
              };
            }
            acc[key].inspecoes.push(i);
            return acc;
          }, {}) as any[]).map((obra: any) => (
            <div key={obra.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Obra / Navio: {obra.navioNome}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Total de Jangadas: {obra.inspecoes.length} | Data: {obra.date || "-"}</p>
                </div>
                <div className="mt-3 sm:mt-0 flex gap-2">
                  <button className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm text-white font-medium shadow-sm flex items-center gap-2" 
                    onClick={() => { /* Gerar certificado desta obra (PDF consolidado) ou link para o ficheiro */ alert("Funcionalidade Emitir Certificado para a obra em breve!"); }}>
                    Emitir / Ver Certificado
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {obra.inspecoes.map((i: any) => {
                  const raft = rafts.find(r => sameId(r.id, i.raftId));
                  return (
                    <div key={i.id} className="border border-gray-200 rounded-lg bg-gray-50 p-4 transition hover:shadow-md">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-800">Quadro de Inspeção</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${i.status === 'Concluída' || i.status === 'aprovado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {i.status || "Pendente"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">Jangada: <strong>{raft?.model || "-"}</strong></p>
                      <p className="text-xs text-gray-600 mb-3">Série: <strong>{i.jangadaSerial || "-"}</strong></p>
                        <p className="text-xs text-gray-600 mb-3">Certificado N: <strong>{i.certificadoNumero || "S/N"}</strong></p>
                      
                      <div className="flex gap-2 border-t border-gray-200 mt-3 pt-3">
                        <button className="w-full bg-slate-200 hover:bg-slate-300 px-2 py-1.5 rounded text-xs text-slate-700 font-medium" onClick={() => setViewModal({open:true, item:i})}>
                          Ver Ficha
                        </button>
                        <button className="w-full bg-white border border-blue-200 hover:bg-blue-50 px-2 py-1.5 rounded text-xs text-blue-700 font-medium" onClick={() => setEditModal({open:true, item:i})}>
                          Editar Quadro
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredInspections.length === 0 && (
            <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500 mb-3">Nenhuma inspeção encontrada.</p>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                + Cadastrar Nova Inspeção
              </button>
            </div>
          )}
        </div>
      )}
      {viewMode === "detalhes" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-3">
          {filteredInspections.map((i: any) => {
            const ship = ships.find(s => sameId(s.id, i.shipId));
            const raft = rafts.find(r => sameId(r.id, i.raftId));
            return (
              <div key={i.id} className="border border-gray-200 rounded-lg bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{i.certificadoNumero || "Inspeção"}</h3>
                  <div className="flex gap-2">
                    <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white" onClick={() => setViewModal({open:true, item:i})}>Ver ficha</button>
                    <button className="bg-yellow-500 px-2 py-1 rounded text-xs text-white" onClick={() => setEditModal({open:true, item:i})}>Editar ficha</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
                  <p><b>Navio:</b> {ship?.nome || i.navioNome || "-"}</p>
                  <p><b>Jangada:</b> {raft?.model || i.jangadaSerial || "-"}</p>
                  <p><b>Data:</b> {i.date || "-"}</p>
                  <p><b>Status:</b> {i.status || "-"}</p>
                  <p><b>Responsável:</b> {i.responsavel || "-"}</p>
                  <p><b>ID:</b> {i.id}</p>
                </div>
              </div>
            );
          })}
          {filteredInspections.length === 0 && (
            <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500 mb-3">Nenhuma inspeção encontrada.</p>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                + Cadastrar Nova Inspeção
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-8">
        <h3 className="text-lg font-bold mb-2">Histórico de alterações</h3>
        <ul className="bg-gray-50 rounded p-2 max-h-48 overflow-auto text-xs">
          {auditLog.map((entry: any, idx: number) => (
            <li key={idx} className="mb-1">
              <span className="font-semibold">{entry.action}</span> - {entry.inspection.shipId} em {new Date(entry.timestamp).toLocaleString()}
            </li>
          ))}
          {auditLog.length === 0 && <li className="text-gray-400">Nenhuma alteração registrada.</li>}
        </ul>
      </div>
      <div className="my-4 flex flex-col sm:flex-row gap-2 items-center">
        <select
          value={reportEmail}
          onChange={e => setReportEmail(e.target.value)}
          className="border rounded px-2 py-1 w-full sm:w-64"
        >
          <option value="">Responsável</option>
          {serviceTechnicians.map((tecnico) => (
            <option key={tecnico} value={tecnico}>{tecnico}</option>
          ))}
        </select>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={() => exportReportPDF(reportEmail)}
          disabled={!reportEmail}
        >
          Exportar PDF
        </button>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => exportReportExcel(reportEmail)}
          disabled={!reportEmail}
        >
          Exportar Excel
        </button>
      </div>
      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-bold mb-2">Visualização do Relatório</h3>
        <table className="min-w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="p-2 whitespace-nowrap">Navio</th>
              <th className="p-2 whitespace-nowrap">Jangada</th>
              <th className="p-2 whitespace-nowrap">Data</th>
              <th className="p-2 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredReport.map((i: any, idx: number) => {
              const ship = ships.find(s => sameId(s.id, i.shipId));
              const raft = rafts.find(r => sameId(r.id, i.raftId));
              return (
                <tr key={idx} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{ship?.nome || i.navioNome || "Navio"}</td>
                  <td className="p-2 whitespace-nowrap">{raft?.model || i.jangadaSerial || "Jangada"}</td>
                  <td className="p-2 whitespace-nowrap">{i.date}</td>
                  <td className="p-2 whitespace-nowrap">{i.status}</td>
                </tr>
              );
            })}
            {filteredReport.length === 0 && (
              <tr><td colSpan={4} className="p-2 text-gray-400">Nenhum registro encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Stock Picker Modal */}
      {stockPicker && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={() => setStockPicker(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-900 text-base">Substituir: <span className="text-blue-700">{stockPicker.fieldLabel}</span></h3>
              <button onClick={() => setStockPicker(null)} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">&times;</button>
            </div>
            <div className="p-3 border-b">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  autoFocus
                  placeholder="Pesquisar artigo por nome ou referência..."
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  className="border rounded-lg px-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                />
                <input
                  placeholder="Leitor / código de barras / fabricante..."
                  value={stockBarcodeSearch}
                  onChange={e => setStockBarcodeSearch(e.target.value)}
                  className="border rounded-lg px-3 py-2 w-full text-sm focus:ring-2 focus:ring-emerald-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsScanOpenInsp(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all whitespace-nowrap"
                  title="Abrir leitor óptico / câmara"
                >
                  📷 Leitor
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Pode procurar manualmente ou usar o leitor de código de barras ligado ao posto para filtrar por referência, código do fabricante, inventário ou lote.
              </div>
              <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Substituição prevista: <span className="font-semibold">{stockPicker.quantity} un.</span> de <span className="font-semibold">{stockPicker.articleName}</span>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {stockLoading ? (
                <div className="flex justify-center py-10 text-gray-400">A carregar...</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredStockItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleStockPick(item)}
                        className="border border-gray-200 rounded-xl p-3 text-left hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100 transition flex gap-3 items-start"
                      >
                        {item.foto ? (
                          <img src={item.foto} alt={item.descricao} className="w-16 h-16 object-cover rounded-lg border flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg border flex items-center justify-center text-2xl flex-shrink-0">📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight">{item.descricao}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{item.referencia}</div>
                          {item.codigoFabricante && (
                            <div className="text-[11px] text-gray-400 mt-0.5">Fab: {item.codigoFabricante}</div>
                          )}
                          {item.validade && (
                            <div className="text-xs text-blue-600 mt-1 font-medium">Val: {formatValidityDisplay(item.validade)}</div>
                          )}
                          {item.quantidade != null && (
                            <div className="text-xs text-gray-400">Stock: {item.quantidade}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  {filteredStockItems.length === 0 && (
                    <div className="col-span-2 py-10 text-center text-gray-400">Nenhum artigo encontrado.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Leitor Óptico / Scanner de Código de Barras (Inspeções) ── */}
      {isScanOpenInsp && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <style>{`
            @keyframes scanInsp {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
            .animate-scan-insp {
              position: absolute;
              height: 3px;
              width: 100%;
              background-color: #10b981;
              box-shadow: 0 0 10px #10b981;
              animation: scanInsp 2.5s linear infinite;
            }
          `}</style>
          
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-100 to-indigo-100 text-slate-900 px-4 py-3 flex items-center justify-between border-b border-sky-200">
              <div className="flex items-center gap-2">
                <span className="text-indigo-700 text-lg">📷</span>
                <h3 className="font-semibold text-sm">Leitor Óptico — Inspeções</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsScanOpenInsp(false)}
                className="text-slate-500 hover:text-slate-900 transition-colors text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Viewfinder Area */}
            <div className="relative bg-black h-56 flex items-center justify-center overflow-hidden">
              {useCameraInsp ? (
                <div id="reader-insp" className="w-full h-full absolute inset-0 bg-black" />
              ) : (
                <>
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]"></div>
                  {/* Scan Line */}
                  <div className="animate-scan-insp" />
                  {/* Viewfinder corner brackets */}
                  <div className="absolute top-4 left-4 h-6 w-6 border-t-2 border-l-2 border-emerald-500"></div>
                  <div className="absolute top-4 right-4 h-6 w-6 border-t-2 border-r-2 border-emerald-500"></div>
                  <div className="absolute bottom-4 left-4 h-6 w-6 border-b-2 border-l-2 border-emerald-500"></div>
                  <div className="absolute bottom-4 right-4 h-6 w-6 border-b-2 border-r-2 border-emerald-500"></div>
                  
                  <div className="text-center text-xs text-slate-400 z-10 space-y-1">
                    <p className="font-semibold text-amber-500 uppercase tracking-widest text-[10px]">Câmara Desligada</p>
                    <p className="text-[10px] text-slate-500">Ligue a câmara abaixo ou use a simulação manual</p>
                  </div>
                </>
              )}
            </div>

            {/* Simulation Controls & Suggestions */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 mb-2">
                <span className="font-semibold text-slate-700">Leitor Físico:</span>
                <button
                  type="button"
                  onClick={() => setUseCameraInsp(c => !c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                    useCameraInsp 
                      ? "bg-red-600 hover:bg-red-700 text-white" 
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {useCameraInsp ? "Desligar Câmara" : "Ligar Câmara"}
                </button>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-slate-700">Simulação de Leitura Manual</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanMockCodeInsp}
                    onChange={(e) => setScanMockCodeInsp(e.target.value)}
                    placeholder="Introduzir código de barras ou referência..."
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleScanCodeInsp(scanMockCodeInsp);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleScanCodeInsp(scanMockCodeInsp)}
                    className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                  >
                    Simular
                  </button>
                </div>
                {scanErrorInsp && (
                  <p className="text-red-600 font-medium">{scanErrorInsp}</p>
                )}
              </div>

              {/* Suggestions Box */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-1.5">Códigos de Stock Disponíveis (Consumo)</h4>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {stockItems.filter(item => item.referencia || item.codigoBarras).map((item) => {
                      const code = item.codigoBarras || item.referencia || "";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setScanMockCodeInsp(code);
                            handleScanCodeInsp(code);
                          }}
                          className="px-2 py-1 rounded border border-emerald-100 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50 text-left transition-all"
                        >
                          <span className="font-bold font-mono block text-[9px]">{code}</span>
                          <span className="text-[10px] block truncate max-w-[150px]">{item.descricao || "Sem descrição"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsScanOpenInsp(false)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







