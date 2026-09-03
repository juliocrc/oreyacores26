"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { 
  ClipboardList, 
  Wrench, 
  Package, 
  Cylinder, 
  AlertCircle, 
  FileText, 
  ChevronRight,
  ChevronLeft,
  Edit3, 
  Save, 
  Play, 
  Ship, 
  Calendar, 
  FileCheck, 
  Plus, 
  Trash2,
  X,
  History,
  Anchor,
  Shield,
  Gauge,
  FileSpreadsheet,
  QrCode,
  ShieldAlert,
  Send,
  ClipboardCheck,
  Info,
  Box,
  Printer,
  RefreshCw,
  ExternalLink,
  Upload,
  Loader2,
  Smartphone,
  ShieldCheck,
  Clock,
  Copy
} from 'lucide-react';
import { appToast } from "@/lib/app-toast";
import { useWhatsAppAllowed, WHATSAPP_ALLOWED_USER_EMAIL } from "@/lib/use-whatsapp-allowed";
import JangadaWizardLoader from '@/modules/JangadaWizard/JangadaWizardLoader';
import WizardRouter from '@/modules/JangadaWizard/WizardRouter';
import { SubstituirArtigoDialog } from '@/components/jangadas/SubstituirArtigoDialog';
import { EditarArtigoDialog } from '@/components/jangadas/EditarArtigoDialog';
import { EditarArtigoSubstituidoDialog } from '@/components/jangadas/EditarArtigoSubstituidoDialog';
import { InspecaoDetalhesDialog } from '@/components/jangadas/InspecaoDetalhesDialog';
import { findMatchingArticleForPackItem, dedupeRaftArticles, isArticleNonExpiring, type MandatoryPackItem } from '@/modules/rafts/mandatoryPack';
import { getTestRecommendations } from '@/modules/rafts/testRules';
import { buildWpDerivedValues, convertMbarToUnit } from '@/lib/quadro-payload';
import { raftModelData } from '@/modules/rafts/raftModelData';
import QrLabelGeneratorDialog from '@/components/jangadas/QrLabelGeneratorDialog';
import InspectionCompareDialog from '@/components/InspectionCompareDialog';
import HistoricaInspecaoDialog from '@/components/jangadas/HistoricaInspecaoDialog';
import LiferaftDiagram from '@/components/jangadas/LiferaftDiagram';
import { formatDate, getLocalDateKey, getLocalMidnight, toLocalISO } from '@/lib/date-utils';
import { buildInspectionIcs, downloadIcsFile } from '@/lib/ics';
import { formatValidityDisplay } from '@/lib/date-display';
import { fmtPeso } from '@/lib/liferaft-diagram-helpers';
import { getContainerClosureMatchBundle } from '@/modules/rafts/containerClosureStraps';
import DgrmIdentificationForm, { type JangadaData as DgrmJangadaData } from '@/components/shared/DgrmIdentificationForm';

const translateArticleName = (name: string): string => {
  if (!name) return name;
  const normalized = name.trim();
  const dictionary: Record<string, string> = {
    "Reflective Tape": "Fita Refletora",
    "Retro reflective tape": "Fita Retro-refletora",
    "Retro Reflective Tape": "Fita Retro-refletora",
    "Grab Handles": "Pegas de Mão",
    "Grab line and patches": "Cabo de Salvação Exterior e Remendos",
    "Grabline Internal": "Cabo de Salvação Interior",
    "Painter Line": "Cabo de Retenida",
    "Painter Line Bag": "Saco do Cabo de Retenida",
    "Sponge": "Esponja",
    "Sponges": "Esponjas",
    "Bellows": "Fole",
    "Paddles": "Pagaias",
    "Bailer": "Batedouro",
    "Drinking Cup": "Copo Graduado",
    "Immediate Action Instructions": "Instruções de Ação Imediata",
    "Rescue Signal Table": "Quadro de Sinais de Salvamento",
    "Signalling Table": "Quadro de Sinais",
    "Sea Anchor": "Âncora Flutuante com Linha",
    "Sea Anchor with Line": "Âncora Flutuante com Linha",
    "Tin Openers": "Abre-latas",
    "Tin Opener": "Abre-latas",
    "Waterproof Torch": "Lanterna",
    "Torch with Spares": "Lanterna",
    "Torch Batteries": "Pilhas para Lanterna",
    "Leafield operating head (GIST)": "Cabeça de Operação Leafield (GIST)",
    "Inflate/deflate valve": "Válvula de Insuflação/Desinsuflação",
    "Inflate/deflate valve cap": "Tampa da Válvula de Insuflação",
    "GiST inlet check valve 2.2 mm": "Válvula de Admissão GIST 2.2 mm",
    "GiST inlet check valve 2.8 mm": "Válvula de Admissão GIST 2.8 mm",
    "GiST PRV B10 2.8 psi": "Válvula de Alívio GIST B10 2.8 psi",
    "B10 PRV cap": "Tampa da Válvula de Alívio B10",
    "Internal lamp unit RL5": "Luz Interna RL5",
    "Rescue line and quoit assembly": "Cabo de Resgate e Anel",
    "Inlet side banjo union protection pad": "Proteção do Banjo Lateral de Admissão",
    "Operating head protection pad": "Proteção da Cabeça de Operação",
    "Painter loading machine": "Carregador de Retenida",
    "Do Not Cut tape": "Fita Adesiva 'Não Cortar'",
    "Heat sealing tool 230V": "Ferramenta de Selagem Térmica 230V",
    "Vacuum valve plug tool": "Ferramenta do Bujão da Válvula de Vácuo",
    "Repair Kit": "Jogo de Reparação",
    "Repar Kit": "Jogo de Reparação",
    "Floating Knife": "Faca",
    "Safety Knifes": "Faca",
    "Top Light and Battery": "Luz Exterior e Bateria",
    "Inside Light and Battery": "Luz Interior e Bateria",
    "Lithium Battery": "Bateria de Lítio",
    "Survival Manual": "Manual de Sobrevivência",
    "Signalling Mirror": "Heliógrafo",
    "Seasickness Bags": "Sacos para Enjoo",
    "Seasickness Tablets": "Comprimidos p/ Enjoo",
    "First Aid Kit": "Farmácia Solas",
    "Thermal Protective Aids": "Ajudas Térmicas",
    "Closure for Canopy": "Fecho da Cobertura",
    "Canopy External": "Cobertura Exterior",
    "Seam Protective Tapes": "Fita Adesiva Protetora de Costuras",
    "Seam Protecting Tapes": "Fita Adesiva Protetora de Costuras",
    "Water Collectors": "Coletores de Água",
    "Aerial Outlet": "Saída de Antena",
    "Identificatior card / tube": "Tubo de Identificação",
    "Tubes and Floor Fabric": "Tecido de Câmara e Fundo",
    "Fastening for Emergency Pack": "Fecho do Saco de Emergência",
    "Smoke Signals": "Potes de Fumo",
    "Righting System": "Sistema de Endireitar",
    "Stabilizing Pockets": "Bolsas de Estabilização",
    "Inflation Valves": "Válvulas de Insuflação",
    "Topping Up Valves": "Válvulas de Atestar",
    "Aerial Support": "Suporte de Antena",
    "Arch and Rubber Band": "Arco e Cinta de Remate",
    "Relief Valves and Stoppers": "Válvulas de Segurança e Tampões",
    "Bursting Band / Tape": "Cinta de Fecho",
    "Markings on Container": "Marcas do Invólucro",
    "High Pressure Hoses": "Tubos de Alta Pressão",
    "Operating Head": "Cabeça de Disparo",
    "Operating Wire": "Cabo de Disparo",
    "Cover for Inflation System": "Capa do Sistema de Insuflação",
    "Cylinder Pocket": "Bolsa do Cilindro",
    "Entrance Ladder": "Escada de Entrada",
    "Radar Reflector": "Refletor de Radar",
    "Water Sachets": "Sacos de Água",
    "Food Rations 0,5 Kg": "Rações Alimentares 0,5 Kg",
    "Pressure Unit": "Unidade de Pressão",
    "Atm. Temperature": "Temperatura Atmosférica",
    "Atm. Pressure": "Pressão Atmosférica",
    "Upper Tube + Arch": "Câmara Superior + Arco",
    "Lower Tube": "Câmara Inferior",
    "Floor": "Fundo (Chão)",
    "Boarding Ramp": "Rampa de Entrada",
    "Boarding Ramp or Ladder": "Rampa ou Escada",
    "Service Station": "Estação de Serviço",
    "Inspection Date": "Data de Inspeção",
    "Signature": "Assinatura"
  };
  return dictionary[normalized] || name;
};

type ServiceBulletinStatus = "APLICADO" | "EM_VERIFICACAO" | "POR_APLICAR";

const SERVICE_BULLETIN_STATUS_LABELS: Record<ServiceBulletinStatus, string> = {
  APLICADO: "Aplicado",
  EM_VERIFICACAO: "Em verificação",
  POR_APLICAR: "Por aplicar",
};

const SERVICE_BULLETIN_STATUS_ORDER: ServiceBulletinStatus[] = [
  "POR_APLICAR",
  "EM_VERIFICACAO",
  "APLICADO",
];

function isServiceBulletinStatus(value: unknown): value is ServiceBulletinStatus {
  return typeof value === "string" && value in SERVICE_BULLETIN_STATUS_LABELS;
}

function normalizeBulletinStatus(value: unknown): ServiceBulletinStatus {
  if (isServiceBulletinStatus(value)) return value;
  if (value === true || value === "true" || value === 1 || value === "1") return "APLICADO";
  return "POR_APLICAR";
}

/**
 * Devolve true se o artigo NÃO tem validade de consumível.
 * Derivado directamente das PACK_FIELD_DEFINITIONS — sem lista hardcoded.
 */
function isNonExpiringItem(name: string): boolean {
  if (!name) return false;
  return isArticleNonExpiring({ name });
}

function findExpectedGasWeights(brand?: string, model?: string, capacity?: number | string, launchType?: string) {
  if (!brand || !model || !capacity) return null;
  const brandKey = Object.keys(raftModelData).find(
    (k) => k.toLowerCase() === brand.toLowerCase()
  );
  if (!brandKey) return null;
  const models = raftModelData[brandKey];
  if (!models) return null;

  const modelEntry = models.find((m) => {
    const nameMatch = m.name.toLowerCase() === model.toLowerCase();
    const aliasMatch = m.aliases?.some(
      (alias) => alias.toLowerCase() === model.toLowerCase()
    );
    return nameMatch || aliasMatch;
  });
  if (!modelEntry || !modelEntry.specifications) return null;

  const targetCapacity = Number(capacity);
  const isDL = String(launchType).toLowerCase().includes('davit') || String(launchType).toLowerCase().includes('turco');

  const matchingSpecs = modelEntry.specifications.filter((s) => s.capacity === targetCapacity);
  if (matchingSpecs.length === 0) return null;

  let spec = matchingSpecs.find((s) => {
    const config = (s.configuration || '').toLowerCase();
    if (isDL) return config.includes('dl') || config.includes('davit');
    return config.includes('to') || config.includes('throw');
  });

  if (!spec) {
    spec = matchingSpecs[0];
  }

  return spec.cylinder || null;
}

type Artigo = {
  id: number;
  name: string;
  quantidade: number;
  validade: string | null;
  referencia: string | null;
  codigoFabricante: string | null;
  stockId?: number | null;
  foto?: string | null;
};

type JangadaCatalogOption = { marca: string; modelo: string; };

interface Ship {
  id: number;
  nome: string;
  matricula?: string;
  tipoPesca?: string;
  tipoNavio?: string;
  bandeira?: string;
  imo?: string;
  callSignal?: string;
  cliente?: { id?: number; nome?: string; telmovel?: string | null; telefone?: string | null };
}

interface Tecnico {
  id: number;
  nome: string;
}

interface Movimento {
  id: number;
  data: string;
  origemShipNome?: string;
  destinoShipNome?: string;
  motivo?: string;
}

interface Inspecao {
  id: number;
  certificadoNumero?: string;
  dataInspecao: string;
  dataProxInspecao?: string;
  responsavel?: string;
  usuario?: string;
  status?: string;
  navioNome?: string;
  artigos?: Artigo[];
  signatureBase64?: string;
  numeroObra?: string;
  cylinderSerialSnapshot?: string | null;
  integrityHash?: string | null;
  integrityHashShort?: string | null;
  integrityTimestamp?: string | null;
  integrityVersion?: number | null;
  integrityValid?: boolean | null;
}

interface Recall {
  id: number;
  titulo?: string;
  descricao?: string;
  acaoRequerida?: string;
  fabricante?: string;
  modeloPattern?: string;
  serialPattern?: string;
}

interface StockItem {
  id: number;
  descricao: string;
  referencia?: string;
  codigoFabricante?: string;
  validade?: string;
  quantidade?: number;
  categoria?: string;
  associavelJangada: boolean;
}

interface ApplicableServiceBulletin {
  id: string;
  title: string;
  bulletinNumber?: string;
  shortDescription?: string;
  issueDate?: string;
  manufacturer: string;
  description: string;
  fileName: string;
  fileUrl: string;
  matchedBrand: string;
  matchedModel: string;
  matchedRuleLabel: string;
  reason: string;
}

export interface JangadaFormData {
  id?: number;
  brand?: string;
  model?: string;
  serial?: string;
  capacity?: string | number;
  packType?: string;
  fabricType?: string;
  launchType?: string;
  tipoLancamento?: string;
  lightType?: string;
  hruSerial?: string | null;
  painterLength?: string;
  maxStowageHeight?: string;
  owner?: string;
  ownerDisplay?: string;
  ownerClientId?: string | number;
  shipDetails?: unknown;
  dataFabrico?: string;
  shipId?: number | null;
  shipNameManual?: string;
  containerModel?: string;
  ultimoCertificadoNumero?: string;
  certificadoExternoNumero?: string;
  certificadoExternoUrl?: string;
  numeroObra?: string;
  testeWP?: string;
  dataInspecao?: string;
  dataProxInspecao?: string;
  cylinderSerial?: string;
  cylinderSistema?: string;
  cylinderInflationSystem?: string;
  cylinderPesoBruto?: string | number;
  cylinderTara?: string | number;
  cylinderCo2?: string | number;
  cylinderN2?: string | number;
  cylinderDataTeste?: string;
  cylinderDataProxTeste?: string;
  cylinderCabecaDisparoRef?: string;
  cylinderCabecaDisparoSerial?: string;
  cylinderTuboCamaraSuperiorRef?: string;
  cylinderTuboCamaraInferiorRef?: string;
  valvulasAlivio?: string;
  valvulasAtestar?: string;
  hruReferencia?: string;
  hruDataInstalacao?: string;
  hruValidade?: string;
  radarReflector?: string;
  radarReflectorValidade?: string;
  testeWPUnidadePressao?: string;
  testeWPHoraInicio?: string;
  testeWPHoraFim?: string;
  testeWPTemperaturaInicial?: string;
  testeWPTemperaturaFinal?: string;
  testeWPPressaoAtmosfericaInicial?: string;
  testeWPPressaoAtmosfericaFinal?: string;
  testeWPCamaraSuperiorInicio?: string;
  testeWPCamaraSuperiorFim?: string;
  testeWPCamaraInferiorInicio?: string;
  testeWPCamaraInferiorFim?: string;
  testeWPCamaraSuperiorQueda?: string;
  testeWPCamaraInferiorQueda?: string;
  testeNAP?: string;
  testeFS?: string;
  testeGI?: string;
  testeDL?: string;
  inspectionChecklistValues?: Record<string, unknown>;
  mandatoryPackItems?: Array<Record<string, unknown>>;
  mandatoryPackSource?: string;
  inspecoes?: Inspecao[];
  artigos?: Artigo[];
  certificadoAtivo?: unknown;
  certificadosExtraidos?: unknown;
  applicableServiceBulletins?: ApplicableServiceBulletin[];
  serviceBulletinsApplied?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  serviceStationStatus?: string;
  serviceStationWorkflowStatus?: string;
  responsavel?: string;
  signatureBase64?: string;
  [key: string]: unknown;
}

type Props = {
  jangadaId: number;
  initialData: JangadaFormData | null;
  ships: Ship[];
};

export default function JangadaDetailPageClient({ jangadaId, initialData, ships }: Props) {
  const router = useRouter();
  const [isInspecting, setIsInspecting] = useState(false);
  const [isVistoriaAtual, setIsVistoriaAtual] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inspecaoFormDirty, setInspecaoFormDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'artigos' | 'pack' | 'contentor' | 'historico' | 'testeWP' | 'boletins' | 'dgrm'>('dados');
  const [data, setData] = useState<JangadaFormData>(initialData || {});
  const [editForm, setEditForm] = useState<JangadaFormData>(initialData ? { ...initialData } : {});
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(!initialData);
  const [errorData, setErrorData] = useState(false);
  const [selectedInspecao, setSelectedInspecao] = useState<Inspecao | null>(null);
  const [printMode, setPrintMode] = useState<'dossier' | 'checklist'>('dossier');
  const [offlineDraftsCount, setOfflineDraftsCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [catalogOptions, setCatalogOptions] = useState<JangadaCatalogOption[]>([]);
  const [availablePackTypeOptions, setAvailablePackTypeOptions] = useState<string[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTecnico, setScheduleTecnico] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulingError, setSchedulingError] = useState("");
  const [schedulingSuccess, setSchedulingSuccess] = useState("");

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveDate, setReceiveDate] = useState("");
  const [receiveTecnico, setReceiveTecnico] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveSuccess, setReceiveSuccess] = useState("");

  const [isQrOpen, setIsQrOpen] = useState(false);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [expandedInspectionId, setExpandedInspectionId] = useState<number | null>(null);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState<number | 'todos'>('todos');
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isCertificadoExternoOpen, setIsCertificadoExternoOpen] = useState(false);
  const [certExtNumero, setCertExtNumero] = useState(String(data.certificadoExternoNumero || ""));
  const [certExtUrl, setCertExtUrl] = useState(String(data.certificadoExternoUrl || ""));
  const [certExtSaving, setCertExtSaving] = useState(false);
  const [isDuplicarOpen, setIsDuplicarOpen] = useState(false);
  const [duplicarSerial, setDuplicarSerial] = useState("");
  const [duplicarCopiarArtigos, setDuplicarCopiarArtigos] = useState(true);
  const [duplicarSaving, setDuplicarSaving] = useState(false);
  const [isHistoricaOpen, setIsHistoricaOpen] = useState(false);
  const [matchingRecalls, setMatchingRecalls] = useState<Recall[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; warning?: string; summary?: { added: number; updated: number; stockLinked: number; total: number }; hasSnapshot?: boolean; details?: string; packSource?: string } | null>(null);
  const [showSyncResult, setShowSyncResult] = useState(false);

  const handleDuplicar = async () => {
    const novoSerial = duplicarSerial.trim();
    if (!novoSerial) {
      appToast.error("Indique o número de série da nova jangada.");
      return;
    }
    try {
      setDuplicarSaving(true);
      const res = await fetch(`/api/jangadas/${jangadaId}/duplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novoSerial, copiarArtigos: duplicarCopiarArtigos }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao duplicar jangada");
      appToast.success(`Jangada S/N ${novoSerial} criada com sucesso!`);
      setIsDuplicarOpen(false);
      setDuplicarSerial("");
      router.push(`/jangadas/${json.id}`);
      router.refresh();
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao duplicar jangada");
    } finally {
      setDuplicarSaving(false);
    }
  };

  const [bulletinsApplied, setBulletinsApplied] = useState<Record<string, ServiceBulletinStatus>>(() => {
    const raw = (initialData?.serviceBulletinsApplied || {}) as Record<string, unknown>;
    return Object.entries(raw).reduce<Record<string, ServiceBulletinStatus>>((acc, [key, value]) => {
      acc[key] = normalizeBulletinStatus(value);
      return acc;
    }, {});
  });
  const [bulletinsSaving, setBulletinsSaving] = useState(false);
  const [bulletinsSaveError, setBulletinsSaveError] = useState("");

  useEffect(() => {
    if (data?.brand) {
      fetch("/api/recalls")
        .then((res) => res.json())
        .then((recallsList) => {
          if (Array.isArray(recallsList)) {
            const matches = recallsList.filter((r) => {
              const brandMatch = String(r.fabricante).trim().toUpperCase() === String(data.brand).trim().toUpperCase();
              
              let modelMatch = true;
              if (r.modeloPattern && data.model) {
                modelMatch = String(data.model).trim().toUpperCase().includes(String(r.modeloPattern).trim().toUpperCase());
              }

              let serialMatch = true;
              if (r.serialPattern && r.serialPattern !== "*" && data.serial) {
                const regexStr = "^" + String(r.serialPattern).replace(/\*/g, ".*") + "$";
                const regex = new RegExp(regexStr, "i");
                serialMatch = regex.test(String(data.serial).trim());
              }

              return brandMatch && modelMatch && serialMatch;
            });
            setMatchingRecalls(matches);
          }
        })
        .catch((err) => console.error("Error loading recalls:", err));
    }
  }, [data?.brand, data?.model, data?.serial]);

  useEffect(() => {
    if (data?.serial) {
      fetch(`/api/equipamento/movimentos?serial=${data.serial}`)
        .then(res => res.json())
        .then(json => setMovimentos(json))
        .catch(err => console.error(err));
    }
  }, [data?.serial]);

  const printJangadaLabel = (labelFormat?: string) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const itemUrl = `${window.location.origin}/jangadas/serial/${encodeURIComponent(data.serial ?? "")}`;
    const brandModel = `${data.brand || ''} ${data.model || ''}`.trim();
    const isMulti = labelFormat === "avery" || labelFormat === "a4";
    win.document.write(`
      <html>
        <head>
          <title>Etiqueta ${data.serial}</title>
          <style>
            body { font-family: 'Courier New', monospace; margin: 0; padding: 0; }
            .label { width: 60mm; height: 30mm; border: 1px solid #333; box-sizing: border-box;
                     padding: 3mm; display: flex; flex-direction: column; align-items: center;
                     justify-content: center; overflow: hidden; page-break-inside: avoid;
                     ${isMulti ? 'float: left; margin: 0;' : 'margin: 10mm auto;'} }
            .title { font-size: 7pt; font-weight: bold; text-align: center; letter-spacing: 1px;
                     color: #1e3a8a; white-space: nowrap; }
            .serial { font-size: 12pt; font-weight: bold; text-align: center; margin: 1mm 0; }
            .model { font-size: 6pt; text-align: center; color: #333; }
            @media print {
              @page { margin: 0; size: 60mm 30mm; }
              body { margin: 0; padding: 0; }
              .label { border: none; width: 60mm; height: 30mm; padding: 2mm; margin: 0; float: none; }
            }
            @page label-avery { margin: 5mm; size: auto; }
            @media print and (min-width: 190mm) {
              body { margin: 5mm; }
              .label { float: left; margin: 0 1mm 1mm 0; border: 1px dashed #999; }
            }
          </style>
        </head>
        <body onload="${isMulti ? '' : 'window.print(); window.close();'}">
          ${isMulti ? Array(24).fill(0).map(() => `
          <div class="label">
            <div class="title">OREY AÇORES</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(itemUrl)}" width="50" height="50" style="image-rendering:pixelated" />
            <div class="serial">${data.serial}</div>
            <div class="model">${brandModel} (${data.capacity || ''}P)</div>
          </div>
          `).join('') : `
          <div class="label">
            <div class="title">OREY AÇORES</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(itemUrl)}" width="100" height="100" style="image-rendering:pixelated" />
            <div class="serial">${data.serial}</div>
            <div class="model">${brandModel} (${data.capacity || ''}P)</div>
          </div>
          `}
          ${isMulti ? '<script>window.print(); window.close();<' + '/script>' : ''}
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleOpenSchedule = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const localISOTime = toLocalISO(tomorrow);
    
    setScheduleDate(localISOTime);
    setScheduleTecnico(data.responsavel || "");
    setScheduleNote("");
    setSchedulingError("");
    setSchedulingSuccess("");
    setIsScheduleModalOpen(true);

    try {
      const res = await fetch("/api/tecnicos?includeInactive=false");
      if (res.ok) {
        const raw = await res.json();
        const list: Tecnico[] = [];
        if (Array.isArray(raw.stations)) {
          raw.stations.forEach((station: { tecnicos?: Tecnico[] }) => {
            if (Array.isArray(station.tecnicos)) {
              station.tecnicos.forEach((tech: Tecnico) => list.push(tech));
            }
          });
        }
        if (Array.isArray(raw.unassigned)) {
          (raw.unassigned as Tecnico[]).forEach((tech: Tecnico) => list.push(tech));
        }
        
        const unique: Tecnico[] = [];
        const seen = new Set();
        list.forEach(item => {
          if (item && item.nome && !seen.has(item.nome)) {
            seen.add(item.nome);
            unique.push(item);
          }
        });
        setTecnicos(unique);
      }
    } catch (err) {
      console.error("Error loading technicians:", err);
    }
  };

  const handleSaveSchedule = async () => {
    setIsScheduling(true);
    setSchedulingError("");
    setSchedulingSuccess("");

    try {
      const parsedDate = new Date(scheduleDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Por favor, introduza uma data e hora válidas.");
      }

      // 1. Grava o agendamento na API da Agenda/Calendário
      const agendaPayload = {
        title: `Inspeção: ${data.shipNameManual || data.owner || "Jangada"} - ${data.serial}`,
        raftSerial: data.serial,
        date: parsedDate.toISOString(),
        responsavel: scheduleTecnico || "Operador",
        status: "scheduled",
        type: "Inspeção",
        inspectionType: "outro"
      };

      const agendaRes = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agendaPayload)
      });

      if (!agendaRes.ok) {
        const errorJson = await agendaRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao criar agendamento na agenda.");
      }

      // 2. Insere a jangada na fila da estação de serviço com o estado 'agendada'
      const queueBody = {
        raftId: data.id,
        status: "agendada",
        tecnico: scheduleTecnico || undefined,
        observacao: scheduleNote || undefined,
        scheduledAt: parsedDate.toISOString(),
        expectedDeliveryDate: parsedDate.toISOString()
      };

      const queueRes = await fetch("/api/service-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queueBody)
      });

      if (!queueRes.ok) {
        const errorJson = await queueRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao adicionar a jangada à fila da estação.");
      }

      setSchedulingSuccess("Inspeção agendada com sucesso!");
      setTimeout(() => {
        setIsScheduleModalOpen(false);
      }, 1500);
    } catch (err: unknown) {
      setSchedulingError(err instanceof Error ? err.message : "Erro ao agendar.");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleOpenReceive = async () => {
    const today = new Date();
    const localISOTime = toLocalISO(today);
    setReceiveDate(localISOTime);
    setReceiveTecnico(data.responsavel || "");
    setReceiveNote("");
    setReceiveError("");
    setReceiveSuccess("");
    setIsReceiveModalOpen(true);

    try {
      const res = await fetch("/api/tecnicos?includeInactive=false");
      if (res.ok) {
        const raw = await res.json();
        const list: Tecnico[] = [];
        if (Array.isArray(raw.stations)) {
          raw.stations.forEach((station: { tecnicos?: Tecnico[] }) => {
            if (Array.isArray(station.tecnicos)) {
              station.tecnicos.forEach((tech: Tecnico) => list.push(tech));
            }
          });
        }
        if (Array.isArray(raw.unassigned)) {
          (raw.unassigned as Tecnico[]).forEach((tech: Tecnico) => list.push(tech));
        }

        const unique: Tecnico[] = [];
        const seen = new Set();
        list.forEach(item => {
          if (item && item.nome && !seen.has(item.nome)) {
            seen.add(item.nome);
            unique.push(item);
          }
        });
        setTecnicos(unique);
      }
    } catch (err) {
      console.error("Error loading technicians:", err);
    }
  };

  const handleSaveReceive = async () => {
    setIsReceiving(true);
    setReceiveError("");
    setReceiveSuccess("");

    try {
      const parsedDate = new Date(receiveDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Por favor, introduza uma data e hora válidas.");
      }

      const queueBody = {
        raftId: data.id,
        workflowStatus: "entrada_estacao",
        status: "aguardar",
        tecnico: receiveTecnico || undefined,
        observacao: receiveNote || undefined,
        arrivalDate: parsedDate.toISOString().slice(0, 10),
        arrivedViaForwarder: false,
        expectedDeliveryDate: receiveDate
      };

      const queueRes = await fetch("/api/service-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queueBody)
      });

      if (!queueRes.ok) {
        const errorJson = await queueRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao marcar a jangada como recebida na estação.");
      }

      setReceiveSuccess("Jangada recebida na estação de serviço com sucesso!");
      fetchJangadaData();
      setTimeout(() => {
        setIsReceiveModalOpen(false);
      }, 1500);
    } catch (err: unknown) {
      setReceiveError(err instanceof Error ? err.message : "Erro ao receber a jangada.");
    } finally {
      setIsReceiving(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
      const drafts = JSON.parse(localStorage.getItem('offline_inspections') || '[]');
      setOfflineDraftsCount(drafts.length);
    }
  }, [isInspecting]);

  // Fetch catalog options and pack types for dropdowns
  useEffect(() => {
    fetchJangadaCatalogOptions();
    fetchAvailablePackTypeOptions();
  }, []);

  async function fetchJangadaCatalogOptions() {
    try {
      const res = await fetch('/api/jangadas/catalog-options');
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Erro HTTP ${res.status}`);
      }
      const nextOptions = Array.isArray(data?.options)
        ? data.options.filter((item: unknown): item is JangadaCatalogOption => {
            if (!item || typeof item !== 'object') return false;
            const candidate = item as Partial<JangadaCatalogOption>;
            return Boolean(String(candidate.marca || '').trim()) && Boolean(String(candidate.modelo || '').trim());
          })
        : [];
      setCatalogOptions(nextOptions);
    } catch (err) {
      console.error('Error fetching jangada catalog options:', err);
      setCatalogOptions([]);
    }
  }

  async function fetchAvailablePackTypeOptions() {
    try {
      const res = await fetch('/api/jangadas/pack-types', { cache: 'no-store' });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Erro HTTP ${res.status}`);
      }
      setAvailablePackTypeOptions(
        Array.isArray(data?.options)
          ? data.options.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : []
      );
    } catch (err) {
      console.error('Error fetching available pack type options:', err);
      setAvailablePackTypeOptions([]);
    }
  }

  const syncOfflineDrafts = async () => {
    const drafts = JSON.parse(localStorage.getItem('offline_inspections') || '[]');
    if (drafts.length === 0) return;
    
    let successCount = 0;
    setSaving(true);
    for (const draft of drafts) {
      try {
        const method = typeof draft.payload.id === 'string' && draft.payload.id.startsWith('offline_') ? "POST" : (draft.payload.id ? "PUT" : "POST");
        const url = method === "PUT" ? `/api/inspecoes?id=${draft.payload.id}` : '/api/inspecoes';
        
        const jangadaPayload = { ...draft.payload };
        delete jangadaPayload.checklist;
        delete jangadaPayload.packItems;
        delete jangadaPayload.artigosSubstituidos;
        if (typeof jangadaPayload.id === 'string' && jangadaPayload.id.startsWith('offline_')) {
          delete jangadaPayload.id;
        }
        
        await fetch(`/api/jangadas/${draft.jangadaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jangadaPayload)
        });

        const cleanPayload = { ...draft.payload };
        if (typeof cleanPayload.id === 'string' && cleanPayload.id.startsWith('offline_')) {
          delete cleanPayload.id;
        }

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanPayload)
        });
        
        if (res.ok) successCount++;
      } catch (err) {
        console.error("Erro ao sincronizar rascunho offline:", err);
      }
    }
    setSaving(false);
    
    if (successCount === drafts.length) {
      localStorage.removeItem('offline_inspections');
      alert(`Sincronização concluída com sucesso! ${successCount} inspeção(ões) enviada(s) para o servidor.`);
      setOfflineDraftsCount(0);
      
      const raftRes = await fetch(`/api/jangadas/${jangadaId}`);
      if (raftRes.ok) {
        const raftData = await raftRes.json();
        setData(raftData);
        setEditForm(raftData);
      }
    } else {
      alert(`Sincronização concluída parcialmente: ${successCount} de ${drafts.length} rascunhos sincronizados.`);
      const remaining = drafts.slice(successCount);
      localStorage.setItem('offline_inspections', JSON.stringify(remaining));
      setOfflineDraftsCount(remaining.length);
    }
  };
  
  const [isAddingInspecao, setIsAddingInspecao] = useState(false);
  const [editingInspecao, setEditingInspecao] = useState<Inspecao | null>(null);
  const [inspecaoForm, setInspecaoForm] = useState({
    certificadoNumero: '',
    dataInspecao: '',
    dataProxInspecao: '',
    responsavel: '',
    status: 'Concluída',
    navioNome: '',
  });

  // Helper para actualizar campos do formulário de inspeção e marcar como editado
  const updateInspecaoField = (field: string, value: string) => {
    setInspecaoFormDirty(true);
    setInspecaoForm(prev => ({ ...prev, [field]: value }));
  };

  React.useEffect(() => {
    if (editingInspecao) {
      setInspecaoForm({
        certificadoNumero: editingInspecao.certificadoNumero || '',
        dataInspecao: editingInspecao.dataInspecao || '',
        dataProxInspecao: editingInspecao.dataProxInspecao || '',
        responsavel: editingInspecao.responsavel || editingInspecao.usuario || '',
        status: editingInspecao.status || 'Concluída',
        navioNome: editingInspecao.navioNome || data.shipNameManual || '',
      });
      setInspecaoFormDirty(false);
    } else if (!inspecaoFormDirty) {
      setInspecaoForm({
        certificadoNumero: '',
        dataInspecao: '',
        dataProxInspecao: '',
        responsavel: '',
        status: 'Concluída',
        navioNome: data.shipNameManual || '',
      });
    }
  }, [editingInspecao, isAddingInspecao, data]);

  React.useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode('dossier');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Aviso de alterações não guardadas ao sair da página
  React.useEffect(() => {
    if (!isEditing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditing]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('startInspection') === '1') {
        setIsInspecting(true);
      }
    }
  }, []);

  const [artigos, setArtigos] = useState<Artigo[]>(dedupeRaftArticles(initialData?.artigos || []));
  const [newArtigo, setNewArtigo] = useState<Partial<Artigo>>({ name: '', quantidade: 1, validade: '', referencia: '', codigoFabricante: '', stockId: undefined });
  const [isAddingArtigo, setIsAddingArtigo] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  useEffect(() => {
    fetchStockItems();
  }, []);

  async function fetchStockItems() {
    try {
      const res = await fetch('/api/stock');
      if (res.ok) {
        const json = await res.json();
        setStockItems(json || []);
      }
    } catch (err) {
      console.error('Error fetching stock items:', err);
    }
  }

  const fetchJangadaData = async () => {
    try {
      const res = await fetch(`/api/jangadas/${jangadaId}`);
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      setData(json);
      setEditForm(json);
      const rawBulletins = (json.serviceBulletinsApplied || {}) as Record<string, unknown>;
      setBulletinsApplied(
        Object.entries(rawBulletins).reduce<Record<string, ServiceBulletinStatus>>((acc, [key, value]) => {
          acc[key] = normalizeBulletinStatus(value);
          return acc;
        }, {})
      );
      if (json.artigos) {
        setArtigos(dedupeRaftArticles(json.artigos));
      }
    } catch (err) {
      console.error('Erro ao recarregar dados da jangada:', err);
    }
  };

  React.useEffect(() => {
    if (!initialData) {
      setLoadingData(true);
      fetchJangadaData()
        .then(() => setLoadingData(false))
        .catch(() => {
          setErrorData(true);
          setLoadingData(false);
        });
    }
  }, [jangadaId, initialData]);

  if (loadingData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-500 font-medium text-sm">A carregar ficha de jangada...</p>
        </div>
      </div>
    );
  }

  if (errorData || !data || !data.id) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-red-200 text-red-600 max-w-lg mx-auto mt-12 shadow-sm">
        <AlertCircle className="mx-auto mb-4" size={48} />
        <h2 className="text-xl font-bold">Jangada Não Encontrada</h2>
        <p className="mt-2 text-sm text-slate-500">O identificador da jangada solicitado é inválido ou não existe na base de dados.</p>
      </div>
    );
  }

  const handleEditChange = (field: string, value: unknown) => {
    setEditForm((prev: JangadaFormData) => {
      const updated = { ...prev, [field]: value } as JangadaFormData;
      // Limpar modelo quando a marca muda
      if (field === 'brand') {
        updated.model = '';
      }
      if (field === 'dataInspecao' && value) {
        const tomorrow = getLocalMidnight();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateKey(tomorrow);
        let valToUse = value;
        if (value > tomorrowStr) {
          alert('A data de inspeção não pode ser posterior a amanhã.');
          valToUse = tomorrowStr;
          updated.dataInspecao = tomorrowStr;
        }
        const brandNorm = (updated.brand || '').toUpperCase().trim();
        const isRfdDsb = brandNorm === 'RFD' || brandNorm === 'DSB';
        let years = 1;
        if (!isRfdDsb && linkedShip) {
          const haystack = `${linkedShip.tipoPesca || ''} ${linkedShip.tipoNavio || ''}`.toLowerCase();
          if (haystack.includes("recreio")) {
            years = 3;
          }
        }
        const parts = String(valToUse ?? "").split('-');
        if (parts[0] && parts[0].length === 4) {
          const year = parseInt(parts[0]) + years;
          const month = parts[1] || '01';
          const day = parts[2] || '01';
          updated.dataProxInspecao = `${year}-${month}-${day}`;
        }
      }
      if (field === 'hruDataInstalacao') {
        if (value) {
          const parts = String(value ?? "").split('-');
          if (parts[0] && parts[0].length === 4) {
            const year = parseInt(parts[0]) + 2;
            const month = parts[1] || '01';
            const day = parts[2];
            updated.hruValidade = day ? `${year}-${month}-${day}` : `${year}-${month}`;
          }
        } else {
          updated.hruValidade = '';
        }
      }
      if (field === 'shipId') {
        const shipIdNum = value ? Number(value) : null;
        const selectedShip = shipIdNum ? ships.find((s) => s.id === shipIdNum) : null;
        if (selectedShip?.cliente?.nome) {
          updated.owner = selectedShip.cliente.nome;
        } else if (!updated.owner) {
          updated.owner = '';
        }
      }
      return updated;
    });
  };

  const handleWpFieldChange = (field: string, value: unknown) => {
    setEditForm((prev: JangadaFormData) => {
      const updated: Record<string, unknown> = { ...prev, [field]: value };

      const derived = buildWpDerivedValues({
        pressureUnit: updated.testeWPUnidadePressao,
        startTime: updated.testeWPHoraInicio,
        tempInitial: updated.testeWPTemperaturaInicial,
        tempFinal: updated.testeWPTemperaturaFinal,
        baroInitial: updated.testeWPPressaoAtmosfericaInicial,
        baroFinal: updated.testeWPPressaoAtmosfericaFinal,
        upperStart: updated.testeWPCamaraSuperiorInicio,
        upperEnd: updated.testeWPCamaraSuperiorFim,
        lowerStart: updated.testeWPCamaraInferiorInicio,
        lowerEnd: updated.testeWPCamaraInferiorFim,
      });

      updated.testeWPHoraFim = derived.endTime;
      updated.testeWPCamaraSuperiorQueda = derived.upper.dropDisplay;
      updated.testeWPCamaraInferiorQueda = derived.lower.dropDisplay;

      // Auto-save pressure unit when changed outside edit mode
      if (!isEditing && field === 'testeWPUnidadePressao') {
        const payload = { testeWPUnidadePressao: value };
        fetch(`/api/jangadas/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(async (res) => {
          if (res.ok) {
            const saved = await res.json();
            setData((prev: JangadaFormData) => ({ ...prev, testeWPUnidadePressao: saved.testeWPUnidadePressao ?? value }));
          } else {
            alert('Erro ao guardar unidade de pressão. Tente novamente.');
          }
        }).catch(() => {
          alert('Erro de ligação ao guardar unidade de pressão.');
        });
      }

      return updated as JangadaFormData;
    });
  };

  const fetchLocalPressure = async (field: 'testeWPPressaoAtmosfericaInicial' | 'testeWPPressaoAtmosfericaFinal') => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      appToast.error("Geolocalização não é suportada pelo seu navegador.");
      return;
    }

    appToast.info("A obter localização GPS...");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=pressure_msl`);
        if (!res.ok) throw new Error("Erro na API meteorológica");
        const weatherData = await res.json();
        const pressureHpa = weatherData?.current?.pressure_msl;
        if (pressureHpa) {
          handleWpFieldChange(field, String(Math.round(pressureHpa)));
          appToast.success(`Pressão obtida: ${Math.round(pressureHpa)} hPa`);
        } else {
          throw new Error("Dados de pressão inválidos");
        }
      } catch (err) {
        appToast.error("Não foi possível obter a pressão atmosférica atual.");
      }
    }, () => {
      appToast.error("Acesso à localização recusado. Introduza a pressão manualmente.");
    });
  };

  const { allowed: whatsappAllowed } = useWhatsAppAllowed();

  const sendWhatsAppAlert = () => {
    if (!whatsappAllowed) {
      appToast.warning(`WhatsApp disponível apenas para o administrador ${WHATSAPP_ALLOWED_USER_EMAIL}.`);
      return;
    }
    const serial = data.serial || '—';
    const model = data.model || '—';
    const capacity = data.capacity || '—';
    const ship = data.shipNameManual || linkedShip?.nome || '—';
    const owner = linkedShip?.cliente?.nome || data.owner || 'Exmo. Cliente';
    const rawDate = data.dataProxInspecao;
    const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('pt-PT') : '—';

    const message = `Olá ${owner},\n\nRelembramos que a vistoria técnica da jangada salva-vidas ${model} (${capacity}P, Série: ${serial}) instalada na embarcação "${ship}" tem validade prevista até ${formattedDate}.\n\nPara garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado.\n\nFicamos a aguardar o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`;

    const clientePhone = linkedShip?.cliente?.telmovel || linkedShip?.cliente?.telefone || '';
    let phoneNum = clientePhone.replace(/[^\d+]/g, '');
    if (phoneNum.startsWith('00')) phoneNum = `+${phoneNum.slice(2)}`;
    if (/^[89]\d{8}$/.test(phoneNum)) phoneNum = `+351${phoneNum}`;
    const whatsappUrl = phoneNum
      ? `https://wa.me/${phoneNum.replace('+', '')}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const [smsSending, setSmsSending] = useState(false);

  const downloadIcs = () => {
    if (!data.dataProxInspecao) {
      appToast.info('Sem data de próxima inspeção definida.');
      return;
    }
    const serial = data.serial || '—';
    const model = data.model || '—';
    const ship = data.shipNameManual || linkedShip?.nome || '—';
    const owner = linkedShip?.cliente?.nome || data.owner || '';
    const content = buildInspectionIcs({
      uid: `inspecao-${jangadaId}-${data.dataProxInspecao}`,
      title: `Inspeção da Jangada ${model} (S/N ${serial})`,
      startDate: data.dataProxInspecao,
      description: `Vistoria técnica da jangada salva-vidas ${model} (${data.capacity || '?'}P, Série: ${serial})${owner ? ` — ${owner}` : ''}.`,
      location: ship !== '—' ? ship : undefined,
      alarmMinutesBefore: 7 * 24 * 60,
    });
    if (content) downloadIcsFile(content, `inspecao-jangada-${serial.replace(/[^\w.-]+/g, '_')}.ics`);
  };

  const sendSMSAlert = async () => {
    const serial = data.serial || '—';
    const model = data.model || '—';
    const capacity = data.capacity || '—';
    const ship = data.shipNameManual || linkedShip?.nome || '—';
    const owner = linkedShip?.cliente?.nome || data.owner || 'Exmo. Cliente';
    const rawDate = data.dataProxInspecao;
    const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('pt-PT') : '—';

    const message = `Olá ${owner},\n\nRelembramos que a vistoria técnica da jangada salva-vidas ${model} (${capacity}P, Série: ${serial}) instalada na embarcação "${ship}" tem validade prevista até ${formattedDate}.\n\nPara garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado.\n\nFicamos a aguardar o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`;

    setSmsSending(true);
    try {
      const res = await fetch('/api/comunicacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'SMS',
          mensagem: message,
          jangadaId,
          clienteId: linkedShip?.cliente?.id || undefined,
          refTipo: 'Jangada',
          refId: jangadaId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        appToast.error(json.error || 'Falha ao enviar SMS.');
      } else {
        appToast.success('SMS enviado com sucesso!');
      }
    } catch {
      appToast.error('Erro ao enviar SMS.');
    } finally {
      setSmsSending(false);
    }
  };

  const handleCylinderChange = (field: string, value: unknown) => {
    setEditForm((prev: JangadaFormData) => {
      const updated = {
        ...prev,
        [field]: value
      } as JangadaFormData;
      if (field === 'cylinderDataTeste' && value) {
        const parts = String(value ?? "").split('-');
        if (parts[0] && parts[0].length === 4) {
          const year = parseInt(parts[0]) + 5;
          const month = parts[1] || '01';
          const day = parts[2];
          updated.cylinderDataProxTeste = day ? `${year}-${month}-${day}` : `${year}-${month}`;
        }
      }
      return updated;
    });
  };

  const handleSyncPack = async () => {
    if (!confirm('Deseja sincronizar os artigos com o template do pack? Isto adicionará artigos obrigatórios em falta e atualizará quantidades.')) return;
    setSyncLoading(true);
    setSyncResult(null);
    setShowSyncResult(true);
    try {
      const res = await fetch(`/api/jangadas/${jangadaId}/sync-pack`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setSyncResult({ success: false, warning: json.details || json.error || 'Erro desconhecido' });
      } else {
        setSyncResult(json);
        fetchJangadaData();
      }
    } catch (err: unknown) {
      setSyncResult({ success: false, warning: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSaveBulletins = async () => {
    setBulletinsSaving(true);
    setBulletinsSaveError("");
    try {
      const res = await fetch(`/api/jangadas/${jangadaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceBulletinsApplied: bulletinsApplied }),
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Código ${res.status}`);
      }
      const updated = await res.json();
      setData((prev: JangadaFormData) => ({ ...prev, serviceBulletinsApplied: updated.serviceBulletinsApplied }));
    } catch (err: unknown) {
      setBulletinsSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulletinsSaving(false);
    }
  };

  const handleSave = async () => {
    // Validação do teste WP antes de gravar
    const wpCheck = buildWpDerivedValues({
      pressureUnit: editForm.testeWPUnidadePressao,
      startTime: editForm.testeWPHoraInicio,
      tempInitial: editForm.testeWPTemperaturaInicial,
      tempFinal: editForm.testeWPTemperaturaFinal,
      baroInitial: editForm.testeWPPressaoAtmosfericaInicial,
      baroFinal: editForm.testeWPPressaoAtmosfericaFinal,
      upperStart: editForm.testeWPCamaraSuperiorInicio,
      upperEnd: editForm.testeWPCamaraSuperiorFim,
      lowerStart: editForm.testeWPCamaraInferiorInicio,
      lowerEnd: editForm.testeWPCamaraInferiorFim,
    });
    const otherTestKeysV = ['testeNAP', 'testeFS', 'testeGI', 'testeDL'] as const;
    const wpHasData = !!(editForm.testeWP || editForm.testeWPCamaraSuperiorInicio || editForm.testeWPCamaraInferiorInicio || editForm.testeWPTemperaturaInicial);
    if (wpHasData) {
      const anyFailed = wpCheck.upper.passes === false || wpCheck.lower.passes === false
        || wpCheck.temperatureWithinManual === false
        || otherTestKeysV.some((k) => editForm[k] === 'REPROVOU');
      if (wpCheck.temperatureWithinManual === false) {
        if (!confirm('A variação térmica (ΔT) excede 3.5°C do manual. O resultado será considerado REPROVADO. Pretende gravar mesmo assim?')) return;
      } else if (anyFailed) {
        if (!confirm('O resultado do teste é REPROVADO / NÃO EM CONFORMIDADE. Pretende gravar mesmo assim?')) return;
      }
    }
    setSaving(true);
    try {
      // Enviar campos editáveis + artigos (para sincronizar no servidor)
      const {
        inspecoes, certificadoAtivo, certificadosExtraidos,
        ownerDisplay, ownerClientId, shipDetails,
        mandatoryPackItems, mandatoryPackSource,
        applicableServiceBulletins,
        createdAt, updatedAt,
        serviceStationStatus, serviceStationWorkflowStatus,
        ...editableFields
      } = editForm;

      const response = await fetch(`/api/jangadas/${jangadaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editableFields,
          artigos: editForm.artigos || [],
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Código ${response.status}`);
      }

      const updated = await response.json();
      setData(updated);
      setEditForm(updated);
      if (updated.artigos) setArtigos(dedupeRaftArticles(updated.artigos));
      setIsEditing(false);

      // Auto-sync se o packType mudou
      const oldPackType = data.packType;
      const newPackType = editableFields.packType;
      if (newPackType && oldPackType && newPackType !== oldPackType) {
        if (confirm(`O tipo de pack mudou de "${oldPackType}" para "${newPackType}". Deseja sincronizar os artigos com o novo pack?`)) {
          handleSyncPack();
        }
      } else {
        alert('Alterações guardadas com sucesso!');
      }
    } catch (err: unknown) {
      alert('Erro ao guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const buildChecklistPayload = () => {
    const checklist: Record<string, unknown> = {
      ...(data.inspectionChecklistValues || {})
    };

    const normalizeText = (text: string) => {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    };

    const findArticle = (tokens: string[]) => {
      const dedupedArticles = dedupeRaftArticles(data.artigos || []);
      return dedupedArticles.find((art: Artigo) => {
        const nameNorm = normalizeText(art.name || '');
        return tokens.every(token => nameNorm.includes(normalizeText(token)));
      });
    };

    const mapArticle = (tokens: string[], refKey?: string, valKey?: string, qtyKey?: string, statusKey?: string, loteKey?: string, explicitReplacementKey?: string) => {
      const art = findArticle(tokens);
      if (art) {
        if (refKey && art.referencia) checklist[refKey] = art.referencia;
        if (valKey && art.validade) {
          const valStr = String(art.validade);
          if (valStr.includes('T')) {
            checklist[valKey] = valStr.slice(0, 7);
          } else {
            checklist[valKey] = valStr;
          }
        }
        if (qtyKey && art.quantidade !== undefined) checklist[qtyKey] = art.quantidade;
        if (statusKey) checklist[statusKey] = 'YES';
        if (loteKey && art.codigoFabricante) {
          const lote = String(art.codigoFabricante).trim();
          checklist[loteKey] = lote.toUpperCase().startsWith('LOTE') ? lote : `LOTE ${lote}`;
        }
        if (explicitReplacementKey) {
          const replacedItem = (lastInspecao?.artigos || []).find((r) => (r.referencia && art.referencia && r.referencia === art.referencia) || (r.name && art.name && normalizeText(r.name).includes(normalizeText(art.name))));
          const replacedQty = replacedItem ? Number(replacedItem.quantidade || 0) : 0;
          if (replacedQty > 0) {
            checklist[explicitReplacementKey] = replacedQty;
          } else {
            delete checklist[explicitReplacementKey];
          }
        }
      } else if (statusKey) {
        checklist[statusKey] = 'NO';
      }
    };

    mapArticle(['farmacia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapArticle(['ambulancia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapArticle(['first', 'aid'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapArticle(['socorros'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');

    mapArticle(['comprimido'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapArticle(['pastilha'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapArticle(['enjoo'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapArticle(['seasick'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapArticle(['tables'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');

    mapArticle(['paraquedas'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
    if (!checklist.ref_paraquedas) mapArticle(['parachute'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
    if (!checklist.ref_paraquedas) mapArticle(['rocket'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');

    mapArticle(['facho'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');
    if (!checklist.ref_fachos) mapArticle(['handflare'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');
    if (!checklist.ref_fachos) mapArticle(['handflares'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');

    mapArticle(['fumo'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapArticle(['smoke'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapArticle(['fumigeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapArticle(['fumígeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');

    mapArticle(['lanterna'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna', 'lote_lanterna');
    if (!checklist.ref_lanterna) mapArticle(['torch'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna', 'lote_lanterna');

    mapArticle(['pilha'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'lote_bateria', 'substituicao_explicita__pilhas_para_lanterna');
    if (!checklist.ref_bateria) mapArticle(['torch', 'batter'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'lote_bateria', 'substituicao_explicita__pilhas_para_lanterna');

    // Sincronizar bateria de lítio com pilhas se não houver artigo separado
    if (!checklist.ref_bateria_litio) {
      const bateriaLitio = findArticle(['bateria', 'litio']);
      if (!bateriaLitio) {
        const pilha = findArticle(['pilha']);
        if (pilha) {
          if (pilha.referencia) checklist.ref_bateria_litio = pilha.referencia;
          if (pilha.validade) {
            const valStr = String(pilha.validade);
            checklist.validade_bateria = valStr.includes('T') ? valStr.slice(0, 7) : valStr;
          }
          if (pilha.quantidade !== undefined) checklist.qtd_bateria_litio = pilha.quantidade;
          if (pilha.codigoFabricante) {
            const lote = String(pilha.codigoFabricante).trim();
            checklist.lote_bateria_litio = lote.toUpperCase().startsWith('LOTE') ? lote : `LOTE ${lote}`;
          }
          checklist.bateria_litio = 'YES';
        }
      }
    }

    mapArticle(['bateria', 'litio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');
    if (!checklist.ref_bateria_litio) mapArticle(['bateria', 'lítio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');
    if (!checklist.ref_bateria_litio) mapArticle(['bateria', 'lithium'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');

    // Sincronizar inversamente: se houver bateria litio mas não pilhas
    if (!checklist.ref_bateria) {
      const bateriaLitio = findArticle(['bateria', 'litio']);
      if (bateriaLitio) {
        if (bateriaLitio.referencia) checklist.ref_bateria = bateriaLitio.referencia;
        if (bateriaLitio.validade) {
          const valStr = String(bateriaLitio.validade);
          checklist.validade_pilhas_lanterna = valStr.includes('T') ? valStr.slice(0, 7) : valStr;
        }
        if (bateriaLitio.quantidade !== undefined) checklist.qtd_pilhas_lanterna = bateriaLitio.quantidade;
        if (bateriaLitio.codigoFabricante) {
          const lote = String(bateriaLitio.codigoFabricante).trim();
          checklist.lote_bateria = lote.toUpperCase().startsWith('LOTE') ? lote : `LOTE ${lote}`;
        }
        checklist.pilhas_lanterna = 'YES';
      }
    }

    mapArticle(['cinta', 'fecho'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
    if (!checklist.ref_cinta_fecho) mapArticle(['bursting', 'band'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
    if (!checklist.ref_cinta_fecho) mapArticle(['bursting', 'tape'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');

    mapArticle(['jogo', 'repara'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');
    if (!checklist.ref_jogo_reparacao) mapArticle(['repair', 'kit'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');

    mapArticle(['luz', 'ext'], undefined, 'validade_luzes_exteriores', undefined, 'luz_exterior_bateria');
    mapArticle(['luz', 'int'], undefined, 'validade_bateria', undefined, 'luz_interior_bateria');

    mapArticle(['agua'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
    if (!checklist.ref_agua) mapArticle(['água'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
    if (!checklist.ref_agua) mapArticle(['water'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');

    mapArticle(['racao'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
    if (!checklist.ref_racoes) mapArticle(['ração'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
    if (!checklist.ref_racoes) mapArticle(['racoes'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
    if (!checklist.ref_racoes) mapArticle(['rações'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
    if (!checklist.ref_racoes) mapArticle(['ration'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
    if (!checklist.ref_racoes) mapArticle(['food'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');

    checklist.teste_wp = data.testeWP || 'N/A';
    checklist.teste_nap = data.testeNAP || 'N/A';
    checklist.teste_fs = data.testeFS || 'N/A';
    checklist.teste_gi = data.testeGI || 'N/A';
    checklist.teste_dl = data.testeDL || 'N/A';

    // HRU validade com dias restantes
    if (data.hruValidade) {
      checklist.hru_val = data.hruValidade.includes('T') ? data.hruValidade.slice(0, 7) : data.hruValidade;
      const refDate = data.dataInspecao ? new Date(data.dataInspecao) : new Date();
      const [vYear, vMonth] = String(checklist.hru_val).split('-').map(Number);
      const expDate = new Date(vYear, (vMonth || 1) - 1, 1);
      const diffDays = Math.ceil((expDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
      checklist.hru_days = diffDays;
    }

    // Cilindro teste hidrostático com dias restantes
    if (data.cylinderDataTeste) {
      checklist.cyl_test_val = data.cylinderDataTeste.includes('T') ? data.cylinderDataTeste.slice(0, 7) : data.cylinderDataTeste;
      const refDate = data.dataInspecao ? new Date(data.dataInspecao) : new Date();
      // Próximo teste = 5 anos após último
      const [tYear, tMonth] = String(checklist.cyl_test_val).split('-').map(Number);
      const nextTestDate = new Date((tYear || 0) + 5, (tMonth || 1) - 1, 1);
      const diffDays = Math.ceil((nextTestDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
      checklist.cyl_test_days = diffDays;
    }

    return checklist;
  };

  const handleExportCertificadoExcel = async () => {
    try {
      const payload = {
        certNumber: lastInspecao?.certificadoNumero || data.ultimoCertificadoNumero || '',
        inspectionDate: lastInspecao?.dataInspecao || data.dataInspecao || '',
        nextInspectionDate: lastInspecao?.dataProxInspecao || data.dataProxInspecao || '',
        shipName: data.shipNameManual || linkedShip?.nome || '',
        shipFlag: linkedShip?.bandeira || '',
        shipImo: linkedShip?.imo || '',
        shipCallSign: linkedShip?.callSignal || '',
        owner: data.ownerDisplay || data.owner || linkedShip?.cliente?.nome || '',
        brand: data.brand || '',
        raftModel: data.model || '',
        raftCapacity: data.capacity || '',
        raftSerial: data.serial || '',
        manufactureDate: data.dataFabrico || '',
        fabricType: data.fabricType || '',
        painterLength: data.painterLength || '',
        maxStowageHeight: data.maxStowageHeight || '',
        cylinderSerial: data.cylinderSerial || '',
        cylinderCo2: data.cylinderCo2 || '',
        cylinderN2: data.cylinderN2 || '',
        cylinderHydroTestDate: data.cylinderDataTeste || '',
        packType: data.packType || '',
        hruReference: data.hruReferencia || '',
        hruExpiry: data.hruValidade || '',
        radarReflector: data.radarReflector || '',
        radarReflectorExpiry: data.radarReflectorValidade || '',
        technician: lastInspecao?.responsavel || 'Técnico Autorizado',
        status: lastInspecao?.status || 'Concluída',
        checklist: buildChecklistPayload()
      };

      const res = await fetch('/api/certificados/orey?format=xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao gerar o ficheiro excel');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename: [certNumber] [shipName].xlsx
      a.download = `${payload.certNumber} ${payload.shipName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert('Erro ao exportar certificado: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleExportQuadroExcel = async () => {
    try {
      const derivedWp = buildWpDerivedValues({
        pressureUnit: data.testeWPUnidadePressao,
        startTime: data.testeWPHoraInicio,
        tempInitial: data.testeWPTemperaturaInicial,
        tempFinal: data.testeWPTemperaturaFinal,
        baroInitial: data.testeWPPressaoAtmosfericaInicial,
        baroFinal: data.testeWPPressaoAtmosfericaFinal,
        upperStart: data.testeWPCamaraSuperiorInicio,
        upperEnd: data.testeWPCamaraSuperiorFim,
        lowerStart: data.testeWPCamaraInferiorInicio,
        lowerEnd: data.testeWPCamaraInferiorFim,
      });

      const payload = {
        numeroObra: data.numeroObra || '',
        certNumber: lastInspecao?.certificadoNumero || data.ultimoCertificadoNumero || '',
        inspectionDate: lastInspecao?.dataInspecao || data.dataInspecao || '',
        nextInspectionDate: lastInspecao?.dataProxInspecao || data.dataProxInspecao || '',
        shipName: data.shipNameManual || linkedShip?.nome || '',
        brand: data.brand || '',
        raftModel: data.model || '',
        raftCapacity: data.capacity || '',
        raftSerial: data.serial || '',
        manufactureDate: data.dataFabrico || '',
        cylinderSerial: data.cylinderSerial || '',
        cylinderGrossWeight: data.cylinderPesoBruto || '',
        cylinderTara: data.cylinderTara || '',
        cylinderTare: data.cylinderTara || '',
        cylinderCo2: data.cylinderCo2 || '',
        cylinderN2: data.cylinderN2 || '',
        cylinderHydroTestDate: data.cylinderDataTeste || '',
        packType: data.packType || '',
        pressureUnit: data.testeWPUnidadePressao || 'inh2o',
        tempInitial: data.testeWPTemperaturaInicial || '',
        tempFinal: data.testeWPTemperaturaFinal || '',
        baroInitial: data.testeWPPressaoAtmosfericaInicial || '',
        baroFinal: data.testeWPPressaoAtmosfericaFinal || '',
        wpStartTime: data.testeWPHoraInicio || '',
        wpEndTime: data.testeWPHoraFim || '',
        wpUpperStart: data.testeWPCamaraSuperiorInicio || '',
        wpUpperEnd: data.testeWPCamaraSuperiorFim || '',
        wpUpperCorrected: derivedWp.upper.correctedEndDisplay || '',
        wpUpperDrop: derivedWp.upper.dropDisplay || '',
        wpUpperDropPercent: derivedWp.upper.dropPercentDisplay || '',
        wpLowerStart: data.testeWPCamaraInferiorInicio || '',
        wpLowerEnd: data.testeWPCamaraInferiorFim || '',
        wpLowerCorrected: derivedWp.lower.correctedEndDisplay || '',
        wpLowerDrop: derivedWp.lower.dropDisplay || '',
        wpLowerDropPercent: derivedWp.lower.dropPercentDisplay || '',
        napTestDone: data.testeNAP || '',
        fsTestDone: data.testeFS || '',
        giTestDone: data.testeGI || '',
        dlTestDone: data.testeDL || '',
        checklist: buildChecklistPayload(),
        substituicoes: (artigos || []).map((art) => ({
          descricao: art.name,
          referencia: art.referencia || undefined,
          quantidade: art.quantidade,
          validade: art.validade || undefined,
          codigoFabricante: art.codigoFabricante || undefined
        }))
      };

      const res = await fetch('/api/exportar-raft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao gerar o ficheiro excel');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename: [raftSerial] [raftModel] [capacity]P (MM YYYY).xlsx
      const inspectionDate = new Date(payload.inspectionDate);
      const month = String(inspectionDate.getMonth() + 1).padStart(2, '0');
      const year = inspectionDate.getFullYear();
      const monthYear = `${month} ${year}`;
      a.download = `${payload.raftSerial} ${payload.raftModel} ${payload.raftCapacity}P (${monthYear}).xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert('Erro ao exportar quadro: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleExportQuadroPDF = async () => {
    try {
      const derivedWp = buildWpDerivedValues({
        pressureUnit: data.testeWPUnidadePressao,
        startTime: data.testeWPHoraInicio,
        tempInitial: data.testeWPTemperaturaInicial,
        tempFinal: data.testeWPTemperaturaFinal,
        baroInitial: data.testeWPPressaoAtmosfericaInicial,
        baroFinal: data.testeWPPressaoAtmosfericaFinal,
        upperStart: data.testeWPCamaraSuperiorInicio,
        upperEnd: data.testeWPCamaraSuperiorFim,
        lowerStart: data.testeWPCamaraInferiorInicio,
        lowerEnd: data.testeWPCamaraInferiorFim,
      });

      const payload = {
        numeroObra: data.numeroObra || '',
        certNumber: lastInspecao?.certificadoNumero || data.ultimoCertificadoNumero || '',
        inspectionDate: lastInspecao?.dataInspecao || data.dataInspecao || '',
        nextInspectionDate: lastInspecao?.dataProxInspecao || data.dataProxInspecao || '',
        shipName: data.shipNameManual || linkedShip?.nome || '',
        brand: data.brand || '',
        raftModel: data.model || '',
        raftCapacity: data.capacity || '',
        raftSerial: data.serial || '',
        manufactureDate: data.dataFabrico || '',
        cylinderSerial: data.cylinderSerial || '',
        cylinderGrossWeight: data.cylinderPesoBruto || '',
        cylinderTara: data.cylinderTara || '',
        cylinderTare: data.cylinderTara || '',
        cylinderCo2: data.cylinderCo2 || '',
        cylinderN2: data.cylinderN2 || '',
        cylinderHydroTestDate: data.cylinderDataTeste || '',
        packType: data.packType || '',
        pressureUnit: data.testeWPUnidadePressao || 'inh2o',
        tempInitial: data.testeWPTemperaturaInicial || '',
        tempFinal: data.testeWPTemperaturaFinal || '',
        baroInitial: data.testeWPPressaoAtmosfericaInicial || '',
        baroFinal: data.testeWPPressaoAtmosfericaFinal || '',
        wpStartTime: data.testeWPHoraInicio || '',
        wpEndTime: data.testeWPHoraFim || '',
        wpUpperStart: data.testeWPCamaraSuperiorInicio || '',
        wpUpperEnd: data.testeWPCamaraSuperiorFim || '',
        wpUpperCorrected: derivedWp.upper.correctedEndDisplay || '',
        wpUpperDrop: derivedWp.upper.dropDisplay || '',
        wpUpperDropPercent: derivedWp.upper.dropPercentDisplay || '',
        wpLowerStart: data.testeWPCamaraInferiorInicio || '',
        wpLowerEnd: data.testeWPCamaraInferiorFim || '',
        wpLowerCorrected: derivedWp.lower.correctedEndDisplay || '',
        wpLowerDrop: derivedWp.lower.dropDisplay || '',
        wpLowerDropPercent: derivedWp.lower.dropPercentDisplay || '',
        napTestDone: data.testeNAP || '',
        fsTestDone: data.testeFS || '',
        giTestDone: data.testeGI || '',
        dlTestDone: data.testeDL || '',
        checklist: buildChecklistPayload(),
        substituicoes: (artigos || []).map((art) => ({
          descricao: art.name,
          referencia: art.referencia || undefined,
          quantidade: art.quantidade,
          validade: art.validade || undefined,
          codigoFabricante: art.codigoFabricante || undefined
        }))
      };

      const res = await fetch('/api/exportar-raft-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao gerar o PDF');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const inspectionDate = new Date(payload.inspectionDate);
      const month = String(inspectionDate.getMonth() + 1).padStart(2, '0');
      const year = inspectionDate.getFullYear();
      const monthYear = `${month} ${year}`;
      a.download = `${payload.raftSerial} ${payload.raftModel} ${payload.raftCapacity}P (${monthYear}).pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert('Erro ao exportar quadro PDF: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleExportDgrmJson = async () => {
    try {
      const res = await fetch(`/api/jangadas/${jangadaId}/dgrm`);
      if (!res.ok) throw new Error('Falha ao exportar dados da DGRM.');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DGRM_${data.serial}_${data.ultimoCertificadoNumero || "DECL"}.json`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert('Erro ao exportar DGRM: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const addStrapToStock = async (strap: { strapQuantity: number; stockReference: string; description: string; containerFamily: string; completePartNumber?: string; upperPartNumber?: string; strapPartNumber?: string; containerLabel: string }) => {
    const qty = prompt('Quantidade de cintas a adicionar ao stock?', String(strap.strapQuantity));
    if (!qty) return;
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencia: strap.stockReference,
          descricao: strap.description,
          quantidade: Number(qty),
          categoria: strap.containerFamily,
          codigoFabricante: strap.completePartNumber || strap.upperPartNumber || strap.strapPartNumber || '',
          observacoes: 'Cinta de fecho - ' + strap.containerLabel
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao adicionar ao stock');
      }
      alert('Cinta adicionada ao stock com sucesso!');
    } catch (e: unknown) {
      alert('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  };

  const addManualStrapToStock = async (ref: string, desc: string, qty: number) => {
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencia: ref,
          descricao: desc,
          quantidade: qty,
          categoria: 'CINTAS_FECHO',
          observacoes: 'Cinta de fecho - adicionada manualmente'
        })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Erro');
      }
      alert('Cinta adicionada ao stock!');
      const refEl = document.getElementById('manual-strap-ref') as HTMLInputElement | null;
      const descEl = document.getElementById('manual-strap-desc') as HTMLInputElement | null;
      if (refEl) refEl.value = '';
      if (descEl) descEl.value = '';
    } catch (e: unknown) {
      alert('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  };

  const handleAddArtigo = async () => {
    if (!newArtigo.name) {
      alert('Por favor insira o nome do artigo.');
      return;
    }
    try {
      const response = await fetch(`/api/jangadas/${jangadaId}/artigos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newArtigo),
      });
      if (!response.ok) throw new Error('Erro ao adicionar artigo');
      const added = await response.json();
      setArtigos((prev) => [...prev, added]);
      setNewArtigo({ name: '', quantidade: 1, validade: '', referencia: '', codigoFabricante: '', stockId: undefined });
      setIsAddingArtigo(false);
      fetchJangadaData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteArtigo = async (artigoId: number) => {
    if (!confirm('Tem a certeza que deseja eliminar este artigo da jangada?')) return;
    try {
      const response = await fetch(`/api/jangadas/${jangadaId}/artigos/${artigoId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Erro ao apagar artigo');
      setArtigos((prev) => prev.filter((a) => a.id !== artigoId));
      fetchJangadaData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveInspecao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingInspecao 
        ? `/api/inspecoes?id=${editingInspecao.id}` 
        : `/api/inspecoes`;
      const method = editingInspecao ? 'PUT' : 'POST';
      const body = {
        ...inspecaoForm,
        jangadaId: Number(jangadaId),
        jangadaSerial: data.serial,
        applyStockMovements: false,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Falha ao guardar inspeção');
      
      setIsAddingInspecao(false);
      setEditingInspecao(null);
      setInspecaoFormDirty(false);
      fetchJangadaData();
    } catch (err: unknown) {
      alert('Erro ao guardar inspeção: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInspecao = async (id: number) => {
    if (!window.confirm('Tem a certeza que deseja eliminar esta inspeção?')) return;
    try {
      const res = await fetch(`/api/inspecoes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao eliminar');
      fetchJangadaData();
    } catch (err: unknown) {
      alert('Erro ao eliminar inspeção: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const formatMonthYear = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const str = String(dateStr);
    const parts = str.split('-');
    if (parts.length >= 2) {
      return `${parts[1]}/${parts[0]}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
  };

  const handleStampInspecao = async (id: number) => {
    try {
      const res = await fetch(`/api/inspecoes/${id}/integrity`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Falha ao aplicar carimbo temporal.');
      appToast.success('Carimbo temporal aplicado com sucesso.');
      fetchJangadaData();
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const toMonthInputFormat = (dateStr?: string | null) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}$/.test(dateStr)) return dateStr;
    const mmYyyy = dateStr.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmYyyy) {
      return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  };

  const isExpired = (expiryStr?: string | null) => {
    if (!expiryStr) return false;
    const expiry = new Date(expiryStr);
    if (isNaN(expiry.getTime())) return false;
    return expiry < new Date();
  };

  const getInspectionStatus = (dateStr?: string | null): {
    label: string;
    color: 'green' | 'yellow' | 'orange' | 'red' | 'gray';
    daysLeft: number | null;
  } => {
    if (!dateStr) return { label: 'Sem data', color: 'gray', daysLeft: null };
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return { label: 'Sem data', color: 'gray', daysLeft: null };
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'Expirada', color: 'red', daysLeft };
    if (daysLeft <= 30) return { label: `${daysLeft}d`, color: 'orange', daysLeft };
    if (daysLeft <= 60) return { label: `${daysLeft}d`, color: 'yellow', daysLeft };
    return { label: 'OK', color: 'green', daysLeft };
  };

  const inspectionStatus = getInspectionStatus(data.dataProxInspecao);

  const statusStyles = {
    green:  { dot: 'bg-emerald-500', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', banner: null },
    yellow: { dot: 'bg-yellow-400',  badge: 'bg-yellow-50 border-yellow-200 text-yellow-700',   banner: 'bg-yellow-50 border-yellow-200' },
    orange: { dot: 'bg-orange-500',  badge: 'bg-orange-50 border-orange-200 text-orange-700',   banner: 'bg-orange-50 border-orange-200' },
    red:    { dot: 'bg-red-500',     badge: 'bg-red-50 border-red-200 text-red-700',            banner: 'bg-red-50 border-red-200' },
    gray:   { dot: 'bg-slate-300',   badge: 'bg-slate-50 border-slate-200 text-slate-500',      banner: null },
  };

  const getComplianceSummary = () => {
    const items = data.mandatoryPackItems || [];
    const total = items.length;
    let complete = 0;
    let incomplete = 0;
    let missing = 0;
    let expired = 0;

    for (const item of items) {
      const matched = findMatchingArticleForPackItem(item as MandatoryPackItem, artigos || []);
      if (!matched) {
        missing++;
      } else {
        const presentQty = Number(matched.quantidade || 0);
        if (presentQty < Number(item.quantity)) {
          incomplete++;
        } else {
          complete++;
        }
        
        if (isExpired(matched.validade)) {
          expired++;
        }
      }
    }

    const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
    return { total, complete, incomplete, missing, expired, percent };
  };

  // If in inspect mode, render the multi-step wizard
  if (isInspecting) {
    return (
      <div className="min-h-screen bg-slate-50 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Inspeção da Jangada</h1>
              <p className="text-sm text-slate-500 mt-1">Série: <span className="font-semibold text-slate-700">{data.serial}</span> · Modelo: <span className="font-semibold text-slate-700">{data.brand} {data.model}</span></p>
            </div>
            <button 
              onClick={() => {
                if (confirm('Deseja interromper a inspeção? O rascunho atual será preservado.')) {
                  setIsInspecting(false);
                }
              }}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold transition-all text-sm"
            >
              Sair da Inspeção
            </button>
          </div>
          <JangadaWizardLoader jangadaId={jangadaId}>
            <WizardRouter />
          </JangadaWizardLoader>
        </div>
      </div>
    );
  }

  const linkedShip = ships.find((s) => s.id === data.shipId);
  const lastInspecao = data.inspecoes && data.inspecoes.length > 0
    ? [...data.inspecoes].sort((a: Inspecao, b: Inspecao) => new Date(b.dataInspecao).getTime() - new Date(a.dataInspecao).getTime())[0]
    : null;

  const expectedGas = findExpectedGasWeights(
    isEditing ? editForm.brand : data.brand,
    isEditing ? editForm.model : data.model,
    isEditing ? editForm.capacity : data.capacity,
    isEditing ? editForm.launchType : data.launchType
  );

  const gasDiff = (field: 'co2' | 'n2') => {
    const expected = expectedGas?.[field];
    if (expected === undefined || expected === null) return null;
    const recordedRaw = isEditing ? editForm.cylinderCo2 : data.cylinderCo2;
    const recordedStr = String(recordedRaw || '').trim();
    if (!recordedStr) return null;
    const recorded = Number(recordedStr.replace(',', '.'));
    if (Number.isNaN(recorded)) return null;
    return recorded - Number(expected);
  };

  const inspectionList = data.inspecoes || [];

  const cylinderChangedMap = useMemo(() => {
    const map = new Map<number, { prevSerial: string | null; changed: boolean }>();
    const sorted = [...inspectionList].sort((a, b) =>
      String(b.dataInspecao).localeCompare(String(a.dataInspecao))
    );
    let prevSerial: string | null = null;
    for (const insp of sorted) {
      const currSerial = insp.cylinderSerialSnapshot ?? null;
      const changed = prevSerial !== null && currSerial !== null && prevSerial !== currSerial;
      map.set(insp.id, { prevSerial, changed });
      if (currSerial !== null) prevSerial = currSerial;
    }
    return map;
  }, [inspectionList]);

  const currentSerial = isEditing ? editForm.cylinderSerial : data.cylinderSerial;
  const cylinderChangedVersusLastInspection = useMemo(() => {
    const sorted = [...inspectionList].sort((a, b) =>
      String(b.dataInspecao).localeCompare(String(a.dataInspecao))
    );
    const lastWithSerial = sorted.find((insp) => insp.cylinderSerialSnapshot);
    if (!lastWithSerial || !currentSerial) return false;
    const lastSerial = lastWithSerial.cylinderSerialSnapshot || "";
    return String(currentSerial).trim() !== String(lastSerial).trim();
  }, [inspectionList, currentSerial]);

  const cylinderChangedText = (insp: Inspecao) => {
    const info = cylinderChangedMap.get(insp.id);
    if (!info || !info.changed) return null;
    return info.prevSerial;
  };

  const exportPdf = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.querySelector('.print-dossier-page') as HTMLElement;
    const opt = {
      margin: [5, 8],
      filename: `dossier-${jangadaId}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    };
    html2pdf().set(opt as Record<string, unknown>).from(element).save();
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50/30 to-white py-8 print:bg-white print:py-0 ${
      printMode === 'checklist' ? 'print-checklist-only' : 'print-dossier-only'
    }`}>
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 4mm 6mm;
          }
          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, button, nav, footer, .no-print, [role="tablist"], .MuiDrawer-root, .MuiAppBar-root {
            display: none !important;
          }
          .print-dossier-only .screen-container-dossier {
            display: none !important;
          }
          .print-dossier-only .print-dossier-page {
            display: block !important;
            width: 297mm;
            height: 210mm;
            overflow: hidden;
          }
          .print-checklist-only .screen-container-dossier {
            display: block !important;
          }
          .print-checklist-only .print-dossier-page {
            display: none !important;
          }
          .print-dossier-only .refletor-row { display: none; }
          .print-dossier-page .camara-sup-row,
          .print-dossier-page .camara-inf-row,
          .print-dossier-page .valvulas-alivio-row,
          .print-dossier-page .valvulas-atestar-row,
          .print-dossier-page .contentor-mod-row {
            display: none !important;
          }
          .max-w-7xl {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .shadow-sm, .shadow-md, .shadow-lg {
            box-shadow: none !important;
            border: 1px solid #888888 !important;
          }
          .bg-white {
            background-color: white !important;
          }

          /* Print-Only Compact Dossier styling overrides */
          .print-dossier-page {
            display: block !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 10.5px !important;
            line-height: 1.25 !important;
            max-height: 202mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          
          /* Dark colors and border visibility */
          .print-dossier-page * {
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-dossier-page,
          .print-dossier-page div,
          .print-dossier-page table,
          .print-dossier-page tr,
          .print-dossier-page th,
          .print-dossier-page td {
            border-color: #888888 !important;
          }
          
          /* Custom background for section headers */
          .print-dossier-page .bg-slate-50 {
            background-color: #e2e8f0 !important;
            color: #000000 !important;
            font-size: 9.5px !important;
            font-weight: 800 !important;
            padding: 2px 4px !important;
          }
          
          /* Semantic colors preserved but darkened for print */
          .print-dossier-page .text-emerald-600,
          .print-dossier-page .text-emerald-800,
          .print-dossier-page [class*="text-emerald"] {
            color: #047857 !important;
          }
          .print-dossier-page .text-rose-600,
          .print-dossier-page .text-red-850,
          .print-dossier-page .text-red-800,
          .print-dossier-page [class*="text-red"],
          .print-dossier-page [class*="text-rose"] {
            color: #b91c1c !important;
          }
          .print-dossier-page .text-amber-800,
          .print-dossier-page [class*="text-amber"] {
            color: #b45309 !important;
          }

          .print-dossier-page h1 {\n            letter-spacing: 0.05em;\n          }
            font-size: 14px !important;
            font-weight: 900 !important;
            color: #000000 !important;
            margin: 0 !important;
            text-transform: uppercase !important;
            line-height: 1.2 !important;
          }
          .print-dossier-page h2 {
            font-size: 10.5px !important;
            font-weight: 800 !important;
            color: #000000 !important;
            margin: 0 !important;
          }
          .print-dossier-page .grid-cols-2 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .print-dossier-page .space-y-2 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 5px !important;
          }
          .print-dossier-page .mt-1\.5 {
            margin-top: 5px !important;
          }
          .print-dossier-page .mt-2 {
            margin-top: 5px !important;
            padding-top: 5px !important;
          }
          .print-dossier-page .grid-cols-3 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
          .print-dossier-page .grid-cols-4 {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 5px !important;
          }
          .print-dossier-page table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
          }
          .print-dossier-page th, .print-dossier-page td {
            padding: 2px 3.5px !important;
            font-size: 9px !important;
            vertical-align: middle !important;
            word-wrap: break-word !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }
          .print-dossier-page td span {
            font-size: 9px !important;
          }
          .print-dossier-page td.font-bold,
          .print-dossier-page td.font-semibold,
          .print-dossier-page td strong,
          .print-dossier-page td span.font-bold,
          .print-dossier-page td span.font-semibold {
            font-weight: 800 !important;
          }
          .print-dossier-page .grid-cols-3 span {
            font-size: 9px !important;
            color: #000000 !important;
          }
          .print-dossier-page .grid-cols-3 span.font-mono {
            font-size: 8.5px !important;
            color: #000000 !important;
            font-weight: bold !important;
          }
          .print-dossier-page .grid-cols-4 span {
            font-size: 9px !important;
          }
          .print-dossier-page .text-\[8px\], 
          .print-dossier-page .text-\[9px\], 
          .print-dossier-page .text-\[7\.2px\] {
            font-size: 9px !important;
          }
          .print-dossier-page .text-\[6\.5px\] {
            font-size: 8.5px !important;
          }
          .print-dossier-page .text-\[6\.5px\].text-slate-400 {
            font-size: 8.5px !important;
            font-weight: 800 !important;
          }
          .print-dossier-page .flex-row-print {
            display: flex !important;
          }
          /* New header/footer styles */
          .print-header, .print-footer {
            display: block !important;
            width: 100%;
            text-align: center;
            font-family: Georgia, serif;
            color: #000;
          }
          .print-header { border-bottom: 1px solid #000; margin-bottom: 2mm; }
          .print-footer { border-top: 1px solid #000; margin-top: 2mm; }
          .print-footer .page-number::after { content: counter(page); }
          .print-dossier-page .flex-row-print {
            display: flex !important;
            justify-content: space-between !important;
            gap: 6px !important;
          }
          .print-dossier-page .col-print {
            width: 32.5% !important;
          }
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-500 screen-container-dossier">
        
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="no-print flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors"
              title="Voltar"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="bg-indigo-600 text-white rounded-2xl p-4 shadow-md shadow-indigo-600/10">
              <Anchor size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">Dossier Técnico da Jangada</span>
                <span className="text-xs font-semibold text-slate-400">ID: #{jangadaId}</span>
                {/* Semáforo de Estado */}
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusStyles[inspectionStatus.color].badge}`}>
                  <span className={`w-2 h-2 rounded-full ${statusStyles[inspectionStatus.color].dot} animate-${inspectionStatus.color === 'red' ? 'pulse' : 'none'}`} />
                  {inspectionStatus.color === 'gray' ? 'Sem inspecção' :
                   inspectionStatus.color === 'red' ? 'GI Expirada' :
                   inspectionStatus.color === 'orange' ? `GI em ${inspectionStatus.daysLeft}d` :
                   inspectionStatus.color === 'yellow' ? `GI em ${inspectionStatus.daysLeft}d` :
                   'GI em dia'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-1">
                {data.brand || 'EUROVINIL'} {data.model || 'COMPACT DRY'}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">Nº de Série: <span className="font-mono font-bold text-slate-700">{data.serial}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-3 no-print">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
                >
                  <Save size={18} />
                  {saving ? 'A guardar...' : 'Guardar'}
                </button>
                <button
                  onClick={() => {
                    setEditForm({ ...data });
                    setIsEditing(false);
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setPrintMode('dossier');
                    setTimeout(() => { window.print(); }, 50);
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileText size={18} />
                  Imprimir Dossier
                </button>
                <button
                  onClick={() => setIsQrOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <QrCode size={18} className="text-indigo-600" />
                  Gerar Etiqueta QR
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
                    <FileText size={18} className="text-indigo-600" />
                    Imprimir Etiqueta ▾
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white border border-slate-200 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50 overflow-hidden">
                    <button
                      onClick={() => printJangadaLabel("single")}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-indigo-50 flex items-center gap-2 border-b border-slate-100"
                    >
                      <FileSpreadsheet size={15} /> Etiqueta individual
                    </button>
                    <button
                      onClick={() => printJangadaLabel("avery")}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-indigo-50 flex items-center gap-2 border-b border-slate-100"
                    >
                      <FileSpreadsheet size={15} /> Folha A4 (24 etiquetas)
                    </button>
                    <button
                      onClick={() => printJangadaLabel("avery")}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet size={15} /> Etiqueta 60×30mm
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleExportCertificadoExcel}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                  Gerar Certificado Excel
                </button>
                <button
                  onClick={handleExportQuadroExcel}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileSpreadsheet size={18} className="text-blue-600" />
                  Gerar Quadro Excel
                </button>
                <button
                  onClick={() => printJangadaLabel()}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-sm"
                >
                  <QrCode size={18} className="text-sky-400" />
                  Etiqueta QR Code
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Edit3 size={18} />
                  Editar Ficha
                </button>
                <button
                  onClick={() => {
                    setDuplicarSerial("");
                    setDuplicarCopiarArtigos(true);
                    setIsDuplicarOpen(true);
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Copy size={18} className="text-cyan-600" />
                  Duplicar Ficha
                </button>
                <a
                  href="https://survitec2.my.site.com/HarbourOne/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <ExternalLink size={18} />
                  HarbourOne
                </a>
                <button
                  onClick={() => setIsCertificadoExternoOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileText size={18} className="text-amber-600" />
                  Certificado Externo
                  {data.certificadoExternoNumero && (
                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-extrabold">Ativo</span>
                  )}
                </button>
                <button
                  onClick={() => setIsInspecting(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 hover:scale-105"
                >
                  <ClipboardCheck size={18} />
                  Registar Vistoria
                </button>
                {currentUrl && (
                  <div className="hidden md:flex flex-col items-center gap-0.5 border-l border-slate-150 pl-3 shrink-0">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(currentUrl)}`} 
                      alt="QR Code" 
                      className="w-10 h-10 p-0.5 border border-slate-200 rounded bg-white shadow-sm"
                    />
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">QR Ficha</span>
                  </div>
                )}
              </>
            )}
          </div>
        </header>

        {/* Banner de alerta de validade da inspecção */}
        {(inspectionStatus.color === 'red' || inspectionStatus.color === 'orange' || inspectionStatus.color === 'yellow') && (
          <div className={`${statusStyles[inspectionStatus.color].banner} border rounded-3xl p-5 flex items-center gap-4 no-print shadow-sm`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              inspectionStatus.color === 'red' ? 'bg-red-100 text-red-600' :
              inspectionStatus.color === 'orange' ? 'bg-orange-100 text-orange-600' :
              'bg-yellow-100 text-yellow-600'
            }`}>
              <AlertCircle size={24} />
            </div>
            <div>
              <p className={`font-extrabold text-base ${
                inspectionStatus.color === 'red' ? 'text-red-900' :
                inspectionStatus.color === 'orange' ? 'text-orange-900' :
                'text-yellow-900'
              }`}>
                {inspectionStatus.color === 'red'
                  ? '⛔ Inspecção expirada'
                  : inspectionStatus.color === 'orange'
                  ? '🔶 Inspecção urgente'
                  : '⚠️ Inspecção próxima'}
              </p>
              <p className={`text-sm mt-0.5 ${
                inspectionStatus.color === 'red' ? 'text-red-700' :
                inspectionStatus.color === 'orange' ? 'text-orange-700' :
                'text-yellow-700'
              }`}>
                {inspectionStatus.color === 'red'
                  ? `A próxima inspecção estava prevista para ${formatDate(data.dataProxInspecao)} — há ${Math.abs(inspectionStatus.daysLeft!)} dias.`
                  : `A próxima inspecção é a ${formatDate(data.dataProxInspecao)} — faltam ${inspectionStatus.daysLeft} dias.`}
              </p>
            </div>
          </div>
        )}

        {offlineDraftsCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print shadow-sm animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <ShieldAlert size={24} />
              </div>
              <div>
                <p className="font-extrabold text-amber-900 text-base">Rascunhos Offline Detetados</p>
                <p className="text-sm text-amber-700 mt-0.5">Tem {offlineDraftsCount} inspeção(ões) pendente(s) salvas no dispositivo. Sincronize com o servidor.</p>
              </div>
            </div>
            <button 
              onClick={syncOfflineDrafts}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-6 py-3.5 rounded-xl text-sm shadow-md shadow-amber-600/10 transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "A Sincronizar..." : "Sincronizar Rascunhos"}
            </button>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl border border-slate-200 w-full sm:w-max no-print">
          <button
            onClick={() => setActiveTab('dados')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'dados' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList size={16} />
            Ficha Técnica
          </button>
          <button
            onClick={() => setActiveTab('artigos')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'artigos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package size={16} />
            Artigos ({artigos.length})
          </button>
          <button
            onClick={() => setActiveTab('pack')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'pack' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield size={16} />
            Pack de Emergência
          </button>
          <button
            onClick={() => setActiveTab('contentor')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'contentor' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Box size={16} />
            Contentor
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'historico' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History size={16} />
            Histórico
          </button>
          <button
            onClick={() => setActiveTab('testeWP')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'testeWP' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Gauge size={16} />
            Testes
          </button>
          <button
            onClick={() => setActiveTab('boletins')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'boletins' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck size={16} />
            Boletins de Serviço ({(data.applicableServiceBulletins || []).length})
          </button>
          <button
            onClick={() => setActiveTab('dgrm')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto justify-center ${
              activeTab === 'dgrm' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={16} />
            Ficha DGRM
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'dados' && (
          <div className="space-y-6">
            {/* Recall/Safety alerts block */}
            {matchingRecalls.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm">
                  <ShieldAlert size={20} className="text-rose-600 animate-bounce" />
                  <span>ALERTA DE SEGURANÇA / RECALL VIGENTE</span>
                </div>
                {matchingRecalls.map((recall) => (
                  <div key={recall.id} className="text-xs text-rose-750 bg-white/75 border border-rose-100 p-4 rounded-2xl space-y-1.5 shadow-sm">
                    <p className="font-extrabold text-slate-800 text-[13px]">{recall.titulo}</p>
                    <p className="font-medium text-slate-650">{recall.descricao}</p>
                    <div className="pt-2 border-t border-rose-100/60 mt-2 text-[11px]">
                      <span className="font-extrabold text-slate-700 uppercase tracking-wide">Ação Requerida: </span>
                      <span className="font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">{recall.acaoRequerida}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Bloco 1: Identificação Geral */}
            <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
                <ClipboardList className="text-indigo-600" />
                Características Gerais
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Marca</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.brand || ''}
                      onChange={(e) => handleEditChange('brand', e.target.value)}
                    >
                      <option value="">Selecione a marca</option>
                      {Array.from(new Set(catalogOptions.map(o => o.marca))).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.brand || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Modelo</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.model || ''}
                      onChange={(e) => handleEditChange('model', e.target.value)}
                    >
                      <option value="">Selecione o modelo</option>
                      {catalogOptions
                        .filter((o) => o.marca === (editForm.brand || data.brand))
                        .map((o) => o.modelo)
                        .filter((v, i, arr) => arr.indexOf(v) === i)
                        .map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                    </select>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.model || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Nº de Série</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.serial || ''} 
                      onChange={(e) => handleEditChange('serial', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.serial || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Capacidade (Pessoas)</span>
                  {isEditing ? (
                    <input 
                      type="number"
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.capacity ?? ''} 
                      onChange={(e) => handleEditChange('capacity', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.capacity ?? '—'} P</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo de Pack</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.packType || ''}
                      onChange={(e) => handleEditChange('packType', e.target.value)}
                    >
                      <option value="">Selecione o tipo de pack</option>
                      {availablePackTypeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.packType || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo de Tecido</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.fabricType || ''} 
                      onChange={(e) => handleEditChange('fabricType', e.target.value)}
                    >
                      <option value="">Desconhecido</option>
                      <option value="PU">PU (Poliuretano)</option>
                      <option value="NR">NR (Borracha Natural)</option>
                      <option value="PVC">PVC</option>
                    </select>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.fabricType || 'Desconhecido'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo de Lançamento</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.launchType || ''} 
                      onChange={(e) => handleEditChange('launchType', e.target.value)}
                    >
                      <option value="">Desconhecido</option>
                      <option value="Throw-Over">Throw-Over</option>
                      <option value="Davit-Launched">Davit-Launched</option>
                    </select>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.launchType || 'Desconhecido'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Comprimento da Retenida (m)</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.painterLength || ''} 
                      onChange={(e) => handleEditChange('painterLength', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.painterLength || '—'} m</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Altura Máxima Lançamento (m)</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.maxStowageHeight || ''} 
                      onChange={(e) => handleEditChange('maxStowageHeight', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.maxStowageHeight || '—'} m</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Proprietário / Armador</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.owner || ''} 
                      onChange={(e) => handleEditChange('owner', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.ownerDisplay || data.owner || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Data de Fabrico</span>
                  {isEditing ? (
                    <input 
                      type="month"
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={toMonthInputFormat(editForm.dataFabrico)} 
                      onChange={(e) => handleEditChange('dataFabrico', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{formatMonthYear(data.dataFabrico)}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Embarcação Associada</span>
                  {isEditing ? (
                    <select
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.shipId || ''} 
                      onChange={(e) => handleEditChange('shipId', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Sem Navio Associado</option>
                      {ships.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome} ({s.matricula})</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5 font-semibold text-indigo-700">
                      <Ship size={16} />
                      <span>{linkedShip ? `${linkedShip.nome} (${linkedShip.matricula})` : 'Nenhum navio associado'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Modelo do Container</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.containerModel || ''} 
                      onChange={(e) => handleEditChange('containerModel', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.containerModel || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Último Certificado Nº</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm"
                      value={editForm.ultimoCertificadoNumero || ''} 
                      onChange={(e) => handleEditChange('ultimoCertificadoNumero', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.ultimoCertificadoNumero || '—'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Diagrama Interativo da Jangada */}
            <LiferaftDiagram jangada={data} artigos={artigos} />

            {/* Bloco 2: Cilindro de Insuflação */}
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
                <Cylinder className="text-indigo-600" />
                Cilindro de Gás
              </h2>

              <div className="space-y-5">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Nº de Série Cilindro</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                      value={editForm.cylinderSerial || ''} 
                      onChange={(e) => handleCylinderChange('cylinderSerial', e.target.value)} 
                    />
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-700 font-mono">{data.cylinderSerial || '—'}</p>
                      {cylinderChangedVersusLastInspection && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                          <RefreshCw size={12} />
                          Cilindro trocado
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Sistema Insuflação</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                      value={editForm.cylinderSistema || ''} 
                      onChange={(e) => handleCylinderChange('cylinderSistema', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.cylinderSistema || '—'}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Peso Bruto (kg)</span>
                    {isEditing ? (
                      <input 
                        type="number" step="0.001"
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderPesoBruto || ''} 
                        onChange={(e) => handleCylinderChange('cylinderPesoBruto', e.target.value)} 
                      />
                    ) : (
                      <p className="font-semibold text-slate-800">{fmtPeso(data.cylinderPesoBruto, " kg")}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tara (kg)</span>
                    {isEditing ? (
                      <input 
                        type="number" step="0.001"
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderTara || ''} 
                        onChange={(e) => handleCylinderChange('cylinderTara', e.target.value)} 
                      />
                    ) : (
                      <p className="font-semibold text-slate-800">{fmtPeso(data.cylinderTara, " kg")}</p>
                    )}
                  </div>
                </div>

                {/* Validador de Tolerância de Gás / Célula de Carga (CO2 e N2) */}
                {(() => {
                  const bruto = Number(isEditing ? editForm.cylinderPesoBruto : data.cylinderPesoBruto);
                  const tara = Number(isEditing ? editForm.cylinderTara : data.cylinderTara);
                  const nominalCo2 = Number(isEditing ? editForm.cylinderCo2 : data.cylinderCo2);
                  const nominalN2 = Number(isEditing ? editForm.cylinderN2 : data.cylinderN2);
                  
                  if (!bruto || !tara) return null;
                  
                  const pesoTotalGasesMedido = bruto - tara;
                  const pesoTotalNominal = (nominalCo2 || 0) + (nominalN2 || 0);
                  const diferencaTotal = pesoTotalNominal ? pesoTotalGasesMedido - pesoTotalNominal : 0;
                  const toleranciaMax = pesoTotalNominal ? pesoTotalNominal * 0.05 : 0.05; // 5% tolerância ISO
                  const isAprovado = pesoTotalNominal ? Math.abs(diferencaTotal) <= toleranciaMax : true;

                  return (
                    <div className={`mt-3 p-3 rounded-2xl border ${isAprovado ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'} text-xs space-y-2`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>⚖️ Validação Balança / Célula de Carga (CO₂ + N₂):</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${isAprovado ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                          {isAprovado ? '✓ DENTRO DA TOLERÂNCIA (≤ 5%)' : '⚠ PERDA EXCESSIVA DE GÁS (> 5%)'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] bg-white/60 p-2 rounded-xl">
                        <div><b>Gás Medido (Bruto-Tara):</b> {pesoTotalGasesMedido.toFixed(3)} kg</div>
                        <div><b>Total Nominal (CO₂ + N₂):</b> {pesoTotalNominal ? `${pesoTotalNominal.toFixed(3)} kg` : '—'}</div>
                        <div><b>Diferença Total:</b> {pesoTotalNominal ? `${diferencaTotal > 0 ? '+' : ''}${diferencaTotal.toFixed(3)} kg` : '—'}</div>
                        <div><b>Tolerância Máx (5%):</b> ±{toleranciaMax.toFixed(3)} kg</div>
                      </div>
                      {nominalCo2 ? <div className="text-[10px] text-slate-600">• CO₂ Nominal: <b>{nominalCo2} kg</b> {expectedGas?.co2 !== undefined && `(Manual: ${expectedGas.co2.toFixed(3)} kg)`}</div> : null}
                      {nominalN2 ? <div className="text-[10px] text-slate-600">• N₂ Nominal: <b>{nominalN2} kg</b> {expectedGas?.n2 !== undefined && `(Manual: ${expectedGas.n2.toFixed(3)} kg)`}</div> : null}
                    </div>
                  );
                })()}

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      Gás CO2 (kg)
                      {expectedGas?.co2 !== undefined && expectedGas.co2 !== null && (
                        <span className="text-[10px] text-indigo-650 font-bold normal-case bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 no-print">
                          Manual: {expectedGas.co2.toFixed(3)} kg
                        </span>
                      )}
                    </span>
                    {isEditing ? (
                      <input 
                        type="number" step="0.001"
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderCo2 || ''} 
                        onChange={(e) => handleCylinderChange('cylinderCo2', e.target.value)} 
                      />
                    ) : (
                      <p className="font-semibold text-slate-800">{fmtPeso(data.cylinderCo2, " kg")}</p>
                    )}
                    {(() => {
                      const d = gasDiff('co2');
                      if (d === null) return null;
                      const diffAbs = Math.abs(d);
                      if (diffAbs <= 0.05) return null;
                      return (
                        <p className={`text-[10px] font-bold ${d < 0 ? 'text-amber-600' : 'text-orange-600'} no-print`}>
                          {d < 0 ? '▼' : '▲'} Difere do manual em {diffAbs.toFixed(3)} kg
                        </p>
                      );
                    })()}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      Gás N2 (kg)
                      {expectedGas?.n2 !== undefined && expectedGas.n2 !== null && (
                        <span className="text-[10px] text-indigo-650 font-bold normal-case bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 no-print">
                          Manual: {expectedGas.n2.toFixed(3)} kg
                        </span>
                      )}
                    </span>
                    {isEditing ? (
                      <input 
                        type="number" step="0.001"
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderN2 || ''} 
                        onChange={(e) => handleCylinderChange('cylinderN2', e.target.value)} 
                      />
                    ) : (
                      <p className="font-semibold text-slate-800">{fmtPeso(data.cylinderN2, " kg")}</p>
                    )}
                    {(() => {
                      const d = gasDiff('n2');
                      if (d === null) return null;
                      const diffAbs = Math.abs(d);
                      if (diffAbs <= 0.05) return null;
                      return (
                        <p className={`text-[10px] font-bold ${d < 0 ? 'text-amber-600' : 'text-orange-600'} no-print`}>
                          {d < 0 ? '▼' : '▲'} Difere do manual em {diffAbs.toFixed(3)} kg
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 3: HRU & Radar Reflector */}
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
                <FileCheck className="text-indigo-600" />
                HRU & Refletor Radar
              </h2>

              <div className="space-y-5">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Referência HRU</span>
                  {isEditing ? (
                    <input 
                      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                      value={editForm.hruReferencia || ''} 
                      onChange={(e) => handleEditChange('hruReferencia', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.hruReferencia || 'Não aplicável / Não instalado'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Data de Instalação do HRU</span>
                  {isEditing ? (
                    <input 
                      type="date"
                      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                      value={editForm.hruDataInstalacao || ''} 
                      onChange={(e) => handleEditChange('hruDataInstalacao', e.target.value)} 
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{formatDate(data.hruDataInstalacao)}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Validade do HRU (Auto: 2 Anos)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {formatDate(isEditing ? editForm.hruValidade : data.hruValidade)}
                    </span>
                    {isExpired(isEditing ? editForm.hruValidade : data.hruValidade) && (
                      <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Expirado</span>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Refletor Radar</span>
                    {isEditing ? (
                      <input 
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.radarReflector || ''} 
                        onChange={(e) => handleEditChange('radarReflector', e.target.value)} 
                      />
                    ) : (
                      <p className="font-semibold text-slate-800">{data.radarReflector || 'Não instalado'}</p>
                    )}
                  </div>


                </div>
              </div>
            </div>

            {/* Bloco 4: Estado Geral do Próximo Serviço */}
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">Próximo Serviço Operacional</h3>
                
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Última Inspeção</p>
                    {isEditing ? (
                      <input 
                        type="date"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                        value={editForm.dataInspecao || ''} 
                        onChange={(e) => handleEditChange('dataInspecao', e.target.value)} 
                      />
                    ) : (
                      <p className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Calendar size={18} className="text-slate-400" />
                        {formatDate(data.dataInspecao)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Validade / Próxima Inspeção</p>
                    {isEditing ? (
                      <input 
                        type="date"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                        value={editForm.dataProxInspecao || ''} 
                        onChange={(e) => handleEditChange('dataProxInspecao', e.target.value)} 
                      />
                    ) : (
                      <>
                        <p className={`text-lg font-bold flex items-center gap-2 ${isExpired(data.dataProxInspecao) ? "text-red-600" : "text-slate-800"}`}>
                          <Calendar size={18} className={isExpired(data.dataProxInspecao) ? "text-red-500" : "text-slate-400"} />
                          {formatDate(data.dataProxInspecao)}
                        </p>
                        {isExpired(data.dataProxInspecao) && (
                          <span className="mt-1 inline-block bg-red-100 border border-red-200 text-red-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">Serviço Expirado</span>
                        )}
                        <div className="mt-2.5 grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={downloadIcs}
                            disabled={!data.dataProxInspecao}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-transform hover:scale-[1.02] shadow-sm shadow-indigo-600/10"
                            title="Exportar para o calendário (.ics)"
                          >
                            <Calendar size={13} />
                            <span>Calendário</span>
                          </button>
                          <button
                            type="button"
                            onClick={sendWhatsAppAlert}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-transform hover:scale-[1.02] shadow-sm shadow-emerald-600/10"
                          >
                            <Send size={13} fill="currentColor" />
                            <span>Alertar via WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            onClick={sendSMSAlert}
                            disabled={smsSending}
                            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-transform hover:scale-[1.02] shadow-sm shadow-sky-600/10 disabled:opacity-50"
                          >
                            {smsSending ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
                            <span>{smsSending ? 'A enviar...' : 'Alertar via SMS'}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-6 space-y-2">
                <button
                  onClick={() => setIsInspecting(true)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <ClipboardCheck size={16} />
                  Registar Vistoria
                </button>
                <button
                  onClick={handleOpenSchedule}
                  className="w-full bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <Calendar size={16} className="text-indigo-600" />
                  Agendar Inspeção
                </button>
                <button
                  onClick={handleOpenReceive}
                  className="w-full bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <Anchor size={16} className="text-amber-600" />
                  Recebida na Estação
                </button>
              </div>
            </div>

            {/* Bloco 5: Válvulas & Disparo */}
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
                <Wrench className="text-indigo-600" />
                Válvulas & Disparo
              </h2>

              <div className="space-y-5">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cabeça Disparo</span>
                  {isEditing ? (
                    <>
                      <select
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderCabecaDisparoRef || ''}
                        onChange={(e) => handleEditChange('cylinderCabecaDisparoRef', e.target.value)}
                      >
                        <option value="">Selecionar...</option>
                        {stockItems.filter((s) => s.referencia?.startsWith('HEAD-')).map((s) => (
                          <option key={s.id} value={s.referencia}>
                            {s.referencia} - {s.descricao} (stock: {s.quantidade || 0})
                          </option>
                        ))}
                      </select>
                      {editForm.cylinderCabecaDisparoRef && (
                        <button
                          type="button"
                          onClick={() => {
                            const si = stockItems.find((s) => s.referencia === editForm.cylinderCabecaDisparoRef);
                            if (!si) return;
                            const qty = prompt('Quantidade a adicionar ao stock:', '1');
                            if (!qty) return;
                            fetch(`/api/stock/${si.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ operacao: 'entrada', quantidade: parseInt(qty) || 1 })
                            }).catch(() => alert('Erro ao repor stock'));
                          }}
                          className="mt-1 text-xs text-slate-500 hover:text-indigo-600 underline"
                        >
                          + Repor
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.cylinderCabecaDisparoRef || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">N.º Série Cabeça Disparo</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                      placeholder="Ex.: DK99-516, DK99-517..."
                      value={editForm.cylinderCabecaDisparoSerial || ''}
                      onChange={(e) => handleEditChange('cylinderCabecaDisparoSerial', e.target.value)}
                    />
                  ) : (
                    <p className="font-semibold text-slate-800">{data.cylinderCabecaDisparoSerial || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ref. Tubo Câmara Sup.</span>
                  {isEditing ? (
                    <>
                      <select
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderTuboCamaraSuperiorRef || ''}
                        onChange={(e) => handleEditChange('cylinderTuboCamaraSuperiorRef', e.target.value)}
                      >
                        <option value="">Selecionar...</option>
                        {stockItems.filter((s) => s.referencia?.startsWith('TUBO-')).map((s) => (
                          <option key={s.id} value={s.referencia}>
                            {s.referencia} - {s.descricao} (stock: {s.quantidade || 0})
                          </option>
                        ))}
                      </select>
                      {editForm.cylinderTuboCamaraSuperiorRef && (
                        <button
                          type="button"
                          onClick={() => {
                            const si = stockItems.find((s) => s.referencia === editForm.cylinderTuboCamaraSuperiorRef);
                            if (!si) return;
                            const qty = prompt('Quantidade a adicionar ao stock:', '1');
                            if (!qty) return;
                            fetch(`/api/stock/${si.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ operacao: 'entrada', quantidade: parseInt(qty) || 1 })
                            }).catch(() => alert('Erro ao repor stock'));
                          }}
                          className="mt-1 text-xs text-slate-500 hover:text-indigo-600 underline"
                        >
                          + Repor
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.cylinderTuboCamaraSuperiorRef || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ref. Tubo Câmara Inf.</span>
                  {isEditing ? (
                    <>
                      <select
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.cylinderTuboCamaraInferiorRef || ''}
                        onChange={(e) => handleEditChange('cylinderTuboCamaraInferiorRef', e.target.value)}
                      >
                        <option value="">Selecionar...</option>
                        {stockItems.filter((s) => s.referencia?.startsWith('TUBO-')).map((s) => (
                          <option key={s.id} value={s.referencia}>
                            {s.referencia} - {s.descricao} (stock: {s.quantidade || 0})
                          </option>
                        ))}
                      </select>
                      {editForm.cylinderTuboCamaraInferiorRef && (
                        <button
                          type="button"
                          onClick={() => {
                            const si = stockItems.find((s) => s.referencia === editForm.cylinderTuboCamaraInferiorRef);
                            if (!si) return;
                            const qty = prompt('Quantidade a adicionar ao stock:', '1');
                            if (!qty) return;
                            fetch(`/api/stock/${si.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ operacao: 'entrada', quantidade: parseInt(qty) || 1 })
                            }).catch(() => alert('Erro ao repor stock'));
                          }}
                          className="mt-1 text-xs text-slate-500 hover:text-indigo-600 underline"
                        >
                          + Repor
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.cylinderTuboCamaraInferiorRef || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Válvulas de Alívio</span>
                  {isEditing ? (
                    <>
                      <select
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.valvulasAlivio || ''}
                        onChange={(e) => handleEditChange('valvulasAlivio', e.target.value)}
                      >
                        <option value="">Selecionar...</option>
                        {stockItems.filter((s) => s.referencia?.startsWith('VAL-') || s.referencia?.startsWith('CONN-') || s.referencia?.startsWith('0.')).map((s) => (
                          <option key={s.id} value={s.referencia}>
                            {s.referencia} - {s.descricao} (stock: {s.quantidade || 0})
                          </option>
                        ))}
                      </select>
                      {editForm.valvulasAlivio && (
                        <button
                          type="button"
                          onClick={() => {
                            const si = stockItems.find((s) => s.referencia === editForm.valvulasAlivio);
                            if (!si) return;
                            const qty = prompt('Quantidade a adicionar ao stock:', '1');
                            if (!qty) return;
                            fetch(`/api/stock/${si.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ operacao: 'entrada', quantidade: parseInt(qty) || 1 })
                            }).catch(() => alert('Erro ao repor stock'));
                          }}
                          className="mt-1 text-xs text-slate-500 hover:text-indigo-600 underline"
                        >
                          + Repor
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.valvulasAlivio || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Válvulas de Atestar</span>
                  {isEditing ? (
                    <>
                      <select
                        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm"
                        value={editForm.valvulasAtestar || ''}
                        onChange={(e) => handleEditChange('valvulasAtestar', e.target.value)}
                      >
                        <option value="">Selecionar...</option>
                        {stockItems.filter((s) => s.referencia?.startsWith('VAL-') || s.referencia?.startsWith('CONN-') || s.referencia?.startsWith('0.')).map((s) => (
                          <option key={s.id} value={s.referencia}>
                            {s.referencia} - {s.descricao} (stock: {s.quantidade || 0})
                          </option>
                        ))}
                      </select>
                      {editForm.valvulasAtestar && (
                        <button
                          type="button"
                          onClick={() => {
                            const si = stockItems.find((s) => s.referencia === editForm.valvulasAtestar);
                            if (!si) return;
                            const qty = prompt('Quantidade a adicionar ao stock:', '1');
                            if (!qty) return;
                            fetch(`/api/stock/${si.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ operacao: 'entrada', quantidade: parseInt(qty) || 1 })
                            }).catch(() => alert('Erro ao repor stock'));
                          }}
                          className="mt-1 text-xs text-slate-500 hover:text-indigo-600 underline"
                        >
                          + Repor
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-slate-800">{data.valvulasAtestar || '—'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'artigos' && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package className="text-indigo-600" />
                Artigos e Componentes da Jangada
              </h2>
              <div className="flex items-center gap-2 no-print">
                <button
                  onClick={handleSyncPack}
                  disabled={syncLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200 disabled:opacity-50"
                >
                  🔄 {syncLoading ? 'A sincronizar...' : 'Sincronizar com Pack'}
                </button>
                <button
                  onClick={() => setIsAddingArtigo(!isAddingArtigo)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
                >
                  {isAddingArtigo ? <X size={14} /> : <Plus size={14} />}
                  {isAddingArtigo ? 'Cancelar' : 'Adicionar Artigo'}
                </button>
              </div>
            </div>

            {/* Adicionar Artigo Form */}
            {isAddingArtigo && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nome Artigo *</label>
                  <input
                    placeholder="Nome"
                    list="stock-items-datalist"
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={newArtigo.name || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const found = stockItems.find(s => s.descricao === val);
                      if (found) {
                        setNewArtigo(prev => ({
                          ...prev,
                          name: found.descricao,
                          referencia: found.referencia || prev.referencia,
                          codigoFabricante: found.codigoFabricante || prev.codigoFabricante,
                          validade: found.validade ? new Date(found.validade).toISOString().slice(0, 7) : prev.validade,
                          stockId: found.id
                        }));
                      } else {
                        setNewArtigo(prev => ({ ...prev, name: val, stockId: undefined }));
                      }
                    }}
                  />
                  <datalist id="stock-items-datalist">
                    {stockItems.filter(s => s.associavelJangada).map((s) => (
                      <option key={s.id} value={s.descricao} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Referência</label>
                  <input
                    placeholder="Ex: 2070100"
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={newArtigo.referencia || ''}
                    onChange={(e) => setNewArtigo(prev => ({ ...prev, referencia: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Fabricante Cód.</label>
                  <input
                    placeholder="Ex: EV-99"
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={newArtigo.codigoFabricante || ''}
                    onChange={(e) => setNewArtigo(prev => ({ ...prev, codigoFabricante: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Qtd</label>
                  <input
                    type="number"
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={newArtigo.quantidade || 1}
                    onChange={(e) => setNewArtigo(prev => ({ ...prev, quantidade: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Validade</label>
                  <input
                    type="month"
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={newArtigo.validade || ''}
                    onChange={(e) => setNewArtigo(prev => ({ ...prev, validade: e.target.value }))}
                  />
                </div>
                <div className="col-span-full flex justify-end gap-2 mt-2">
                  <button
                    onClick={handleAddArtigo}
                    className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-sm"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )}

            {artigos.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-350">
                <Package className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500 font-medium">Não há artigos ou consumíveis inventariados para esta jangada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                      <th className="px-6 py-4 w-10">Foto</th>
                      <th className="px-6 py-4">Artigo / Equipamento</th>
                      <th className="px-6 py-4">Referência</th>
                      <th className="px-6 py-4">Fabricante Cód.</th>
                      <th className="px-6 py-4 text-center">Quantidade</th>
                      <th className="px-6 py-4">Validade</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {artigos.map((artigo) => {
                      const replacedItem = lastInspecao?.artigos?.find((art: Artigo) => 
                        (art.referencia && art.referencia === artigo.referencia) || 
                        (art.name && art.name === artigo.name)
                      );
                      return (
                        <tr key={artigo.id} className="hover:bg-slate-50/55 transition-colors">
                          <td className="px-6 py-4">
                            {artigo.foto ? (
                              <img src={artigo.foto} alt={artigo.name} className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                            ) : (
                              <div className="h-10 w-10 rounded border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300"><Package size={16} /></div>
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-800">{translateArticleName(artigo.name)}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-500">{artigo.referencia || '—'}</td>
                          <td className="px-6 py-4 text-slate-600">{artigo.codigoFabricante || '—'}</td>
                          <td className="px-6 py-4 text-center font-bold text-slate-700">{artigo.quantidade}</td>
                          <td className="px-6 py-4">
                            {isNonExpiringItem(artigo.name) ? (
                              <span className="text-slate-400 text-xs font-medium italic">Sem validade</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{formatMonthYear(artigo.validade)}</span>
                                {isExpired(artigo.validade) && (
                                  <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Expirado</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                            <EditarArtigoDialog
                              jangadaId={jangadaId}
                              siblingArticles={artigos}
                              artigo={{
                                id: artigo.id,
                                name: artigo.name,
                                quantidade: artigo.quantidade,
                                referencia: artigo.referencia,
                                validade: artigo.validade,
                                codigoFabricante: artigo.codigoFabricante,
                                substituidoId: replacedItem ? replacedItem.id : null,
                                quantidadeSubstituida: replacedItem ? replacedItem.quantidade : 0,
                                lastInspecaoId: lastInspecao ? lastInspecao.id : null,
                              }}
                              onSuccess={fetchJangadaData}
                            />
                          <SubstituirArtigoDialog
                            jangadaId={jangadaId}
                            artigo={{
                              id: artigo.id,
                              name: artigo.name,
                              quantidade: artigo.quantidade,
                              referencia: artigo.referencia || '',
                            }}
                            onSuccess={fetchJangadaData}
                          />
                          <button
                            onClick={() => handleDeleteArtigo(artigo.id)}
                            className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar Artigo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pack' && (() => {
          // Group mandatory pack items by category
          const items = data.mandatoryPackItems || [];
          const groupedPackItems: Record<string, typeof items> = {};
          for (const item of items) {
            const cat = String(item.category || 'Outros');
            if (!groupedPackItems[cat]) groupedPackItems[cat] = [];
            groupedPackItems[cat].push(item);
          }

          return (
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-8">
              <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Shield className="text-indigo-600" />
                    Pack de Emergência ({data.packType || 'Desconhecido'})
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Definição de artigos obrigatórios obtida via:{' '}
                    <span className="font-semibold text-slate-700">
                      {data.mandatoryPackSource === 'technical'
                        ? 'Ficha Técnica do Modelo'
                        : 'Template Padrão do Tipo de Pack'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    onClick={handleSyncPack}
                    disabled={syncLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-250 disabled:opacity-50"
                  >
                    🔄 {syncLoading ? 'A sincronizar...' : 'Sincronizar com Pack'}
                  </button>
                  <button
                    onClick={() => {
                      setPrintMode('checklist');
                      setTimeout(() => {
                        window.print();
                      }, 50);
                    }}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition-all text-xs shadow-sm"
                  >
                    <FileText size={14} />
                    Imprimir Checklist do Pack
                  </button>
                </div>
              </div>

              {Object.keys(groupedPackItems).length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-350">
                  <Shield className="mx-auto text-slate-300 mb-3" size={48} />
                  <p className="text-slate-500 font-medium">
                    Não existem requisitos de pack de emergência configurados para este modelo ou tipo de pack.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(groupedPackItems).map(([category, catItems]) => (
                    <div key={category} className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        {category}
                      </h3>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm">
                        <table className="w-full text-left border-collapse bg-white">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                              <th className="px-6 py-4 w-10">Foto</th>
                              <th className="px-6 py-4">Requisito do Pack</th>
                              <th className="px-6 py-4">Artigo Associado (Jangada)</th>
                              <th className="px-6 py-4">Referência</th>
                              <th className="px-6 py-4 text-center">Qtd Req.</th>
                              <th className="px-6 py-4 text-center">Qtd Reg.</th>
                              <th className="px-6 py-4 text-center">Qtd Subst.</th>
                              <th className="px-6 py-4 text-center">Estado</th>
                              <th className="px-6 py-4">Validade</th>
                              <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {catItems.map((item: Record<string, unknown>) => {
                              const matched = findMatchingArticleForPackItem(item as MandatoryPackItem, artigos);
                              const isPresent = !!matched;
                              const presentQty = matched ? Number(matched.quantidade || 0) : 0;
                              const isComprimidosEnjoo = matched?.referencia === '30202051' || item.referencia === '30202051';
                              const isComplete = isPresent && (
                                presentQty >= Number(item.quantity) ||
                                (isComprimidosEnjoo && presentQty >= 1)
                              );

                              const lastInspectionArticles = lastInspecao?.artigos || [];
                              const replacedItem = lastInspectionArticles.find((art: Artigo) => 
                                (art.referencia && art.referencia === matched?.referencia) || 
                                (art.name && art.name === matched?.name) ||
                                (art.referencia && art.referencia === item.referencia)
                              );
                              const replacedQty = replacedItem ? replacedItem.quantidade : 0;

                              let statusBadge = (
                                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                  Em Falta
                                </span>
                              );
                              if (isPresent) {
                                  if (isComplete) {
                                    statusBadge = (
                                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                        Completo
                                      </span>
                                    );
                                  } else {
                                    statusBadge = (
                                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                        Incompleto
                                      </span>
                                    );
                                  }
                              }

                              return (
                                <tr key={String(item.label)} className="hover:bg-slate-50/55 transition-colors">
                                  <td className="px-6 py-4">
                                    {(matched as any)?.foto ? (
                                      <img src={(matched as any).foto} alt={matched?.name || ''} className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                                    ) : (
                                      <div className="h-10 w-10 rounded border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300"><Package size={16} /></div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800">{String(item.label)}</div>
                                    {!!item.englishLabel && (
                                      <div className="text-xs text-slate-400 italic">
                                        {String(item.englishLabel)}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-slate-700">
                                    {matched ? String(matched.name) : <span className="text-red-500 italic font-medium">Nenhum</span>}
                                  </td>
                                  <td className="px-6 py-4 font-mono text-xs text-slate-500">
                                    {matched?.referencia || '—'}
                                  </td>
                                  <td className="px-6 py-4 text-center font-semibold text-slate-500">
                                    {Number(item.quantity)}
                                  </td>
                                  <td className="px-6 py-4 text-center font-bold text-slate-700">
                                    {presentQty}
                                  </td>
                                  <td className="px-6 py-4 text-center font-bold text-indigo-600">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <span>{replacedQty || "—"}</span>
                                      {replacedItem && (
                                        <EditarArtigoSubstituidoDialog
                                          jangadaId={jangadaId}
                                          artigo={{
                                            id: replacedItem.id,
                                            name: replacedItem.name,
                                            quantidade: replacedItem.quantidade,
                                            referencia: replacedItem.referencia || null,
                                          }}
                                          onSuccess={fetchJangadaData}
                                        />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-center">{statusBadge}</td>
                                  <td className="px-6 py-4">
                                    {matched?.validade ? (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">
                                          {formatMonthYear(matched.validade)}
                                        </span>
                                        {isExpired(matched.validade) && (
                                          <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                            Expirado
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                    <EditarArtigoDialog
                                      jangadaId={jangadaId}
                                      siblingArticles={artigos}
                                      artigo={{
                                        id: matched ? Number((matched as Record<string, unknown>).id || 0) : 0,
                                        name: matched ? (matched.name || '') : String(item.label),
                                        quantidade: matched ? Number(matched.quantidade || 0) : Number(item.quantity),
                                        referencia: matched ? (matched.referencia || null) : null,
                                        validade: matched ? (matched.validade || null) : null,
                                        codigoFabricante: matched ? String((matched as Record<string, unknown>).codigoFabricante || '') || null : null,
                                        substituidoId: replacedItem ? replacedItem.id : null,
                                        quantidadeSubstituida: replacedItem ? replacedItem.quantidade : 0,
                                        lastInspecaoId: lastInspecao ? lastInspecao.id : null,
                                      }}
                                      onSuccess={fetchJangadaData}
                                    />
                                    {matched && matched.referencia ? (
                                      <SubstituirArtigoDialog
                                        jangadaId={jangadaId}
                                        artigo={{
                                          id: Number((matched as Record<string, unknown>).id || 0),
                                          name: matched.name || '',
                                          quantidade: Number(matched.quantidade || 0),
                                          referencia: matched.referencia || '',
                                        }}
                                        onSuccess={fetchJangadaData}
                                      />
                                    ) : (
                                      <SubstituirArtigoDialog
                                        jangadaId={jangadaId}
                                        artigo={{
                                          id: 0,
                                          name: String(item.label || ''),
                                          quantidade: Number(item.quantity || 1),
                                          referencia: '',
                                        }}
                                        onSuccess={fetchJangadaData}
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
);
        })()}
      
      {activeTab === 'contentor' && (() => {
        const bundle = getContainerClosureMatchBundle({
          brand: data.brand,
          model: data.model,
          containerModel: data.containerModel,
          capacity: data.capacity,
          launchType: data.launchType,
          packType: data.packType
        });
        return (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Box size={18} className="text-indigo-500" />
                Contentor
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Modelo do Contentor
                  </span>
                  {isEditing ? (
                    <select
                      className="w-full mt-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                      value={editForm.containerModel || ''}
                      onChange={(e) => handleEditChange('containerModel', e.target.value)}
                    >
                      <option value="">Selecionar modelo...</option>
                      <option value="MK10">MK 10 Throwover</option>
                      <option value="MK14">MK 14 Throwover</option>
                      <option value="MK16">MK 16 Throwover</option>
                      <option value="MK18">MK 18 Throwover</option>
                      <option value="MK20">MK 20 Flat-Pack</option>
                      <option value="G21">G21</option>
                    </select>
                  ) : (
                    <p className="mt-1 font-semibold text-slate-800">
                      {data.containerModel || '—'}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tipo de Lançamento
                  </span>
                  <p className="mt-1 font-semibold text-slate-800">
                    {data.launchType || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tipo de Contentor
                  </span>
                  {isEditing ? (
                    <select
                      className="w-full mt-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                      value={editForm.fabricType || ''}
                      onChange={(e) => handleEditChange('fabricType', e.target.value)}
                    >
                      <option value="">Selecionar...</option>
                      <option value="RIGIDO">Rígido (MK)</option>
                      <option value="VALISE">Valise</option>
                      <option value="ABS">ABS</option>
                    </select>
                  ) : (
                    <p className="mt-1 font-semibold text-slate-800">
                      {data.fabricType || '—'}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Saco de Vácuo
                  </span>
                  {isEditing ? (
                    <select
                      className="w-full mt-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                      value={editForm.testeNAP || ''}
                      onChange={(e) => handleEditChange('testeNAP', e.target.value)}
                    >
                      <option value="">Selecionar...</option>
                      <option value="SIM">Sim</option>
                      <option value="NAO">Não</option>
                    </select>
                  ) : (
                    <p className="mt-1 font-semibold text-slate-800">
                      {data.testeNAP || '—'}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Anilha Final Retenida
                  </span>
                  {isEditing ? (
                    <input
                      className="w-full mt-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                      value={editForm.painterLength || ''}
                      onChange={(e) => handleEditChange('painterLength', e.target.value)}
                      placeholder="Ref. anilha / thimble"
                    />
                  ) : (
                    <p className="mt-1 font-semibold text-slate-800">
                      {data.painterLength || '—'}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Package size={18} className="text-amber-500" />
                Cintas de Fecho ({bundle.exactMatches.length + bundle.familyMatches.length} correspondências)
              </h3>
              {bundle.exactMatches.length + bundle.familyMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
                  Nenhuma cinta de fecho encontrada para este contentor.
                  {isEditing && (
                    <p className="mt-1 text-xs text-slate-400">
                      Preencha o modelo do contentor para ver as cintas correspondentes.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {bundle.exactMatches.map((strap, i) => (
                    <StrapCard key={strap.key || i} strap={strap} onAddToStock={() => addStrapToStock(strap)} />
                  ))}
                  {bundle.familyMatches.map((strap, i) => (
                    <StrapCard key={strap.key || i} strap={strap} onAddToStock={() => addStrapToStock(strap)} />
                  ))}
                </div>
              )}
              {bundle.operationalNotes.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <p className="font-semibold mb-1">Notas Operacionais:</p>
                  {bundle.operationalNotes.map((note, i) => (
                    <p key={i} className="ml-2">
                      • {note}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Package size={18} className="text-green-500" />
                Adicionar Cinta Manualmente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  id="manual-strap-ref"
                  placeholder="Referência (ex: D508)"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                />
                <input
                  id="manual-strap-desc"
                  placeholder="Descrição"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                />
                <input
                  id="manual-strap-qty"
                  type="number"
                  placeholder="Quantidade"
                  defaultValue="1"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                />
                <input
                  id="manual-strap-pn"
                  placeholder="Nº Peça (opcional)"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
                />
              </div>
              <button
                onClick={() => {
                  const ref = (document.getElementById('manual-strap-ref') as HTMLInputElement)?.value;
                  const desc = (document.getElementById('manual-strap-desc') as HTMLInputElement)?.value;
                  const qty = (document.getElementById('manual-strap-qty') as HTMLInputElement)?.value;
                  if (!ref || !desc) {
                    alert('Preencha referência e descrição.');
                    return;
                  }
                  addManualStrapToStock(ref, desc, Number(qty) || 1);
                }}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
              >
                + Adicionar ao Stock
              </button>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Package size={18} className="text-purple-500" />
                Selecionar Cintas do Stock
              </h3>
              <p className="text-sm text-slate-400 text-center py-4">
                Em breve: seleção de cintas do stock existente.
              </p>
            </div>
          </div>
        );
      })()}

      {activeTab === 'historico' && (() => {
          const inspecoesList = data.inspecoes || initialData?.inspecoes || [];
          
          // Obter anos únicos das inspeções ordenados de forma decrescente
          const anosDisponiveis = Array.from(
            new Set(
              inspecoesList
                .map((insp: Inspecao) => {
                  if (!insp.dataInspecao) return null;
                  const d = new Date(insp.dataInspecao);
                  return isNaN(d.getTime()) ? null : d.getFullYear();
                })
                .filter(Boolean)
            )
          ).sort((a: number | null, b: number | null) => (b ?? 0) - (a ?? 0)) as number[];

          const filteredInspecoes = selectedHistoryYear === 'todos'
            ? inspecoesList
            : inspecoesList.filter((insp: Inspecao) => {
                if (!insp.dataInspecao) return false;
                const d = new Date(insp.dataInspecao);
                return !isNaN(d.getTime()) && d.getFullYear() === selectedHistoryYear;
              });

          return (
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <History className="text-indigo-600" />
                  Histórico Técnico de Inspeções
                </h2>
                <button
                  onClick={() => setIsHistoricaOpen(true)}
                  className="bg-indigo-650 hover:bg-indigo-550 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-150 transition-all flex items-center gap-1.5 self-start sm:self-auto hover:shadow-indigo-250 active:scale-95"
                >
                  <Plus size={14} />
                  Registar Inspeção Histórica
                </button>
              </div>

              {/* Filtro de Anos (Abas) */}
              {anosDisponiveis.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2">
                  <button
                    onClick={() => setSelectedHistoryYear('todos')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      selectedHistoryYear === 'todos'
                        ? 'bg-slate-850 text-white border-slate-850 shadow-sm'
                        : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Todas ({inspecoesList.length})
                  </button>
                  {anosDisponiveis.map(year => {
                    const count = inspecoesList.filter((insp: Inspecao) => {
                      if (!insp.dataInspecao) return false;
                      const d = new Date(insp.dataInspecao);
                      return !isNaN(d.getTime()) && d.getFullYear() === year;
                    }).length;
                    
                    return (
                      <button
                        key={year}
                        onClick={() => setSelectedHistoryYear(year)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                          selectedHistoryYear === year
                            ? 'bg-indigo-650 text-white border-indigo-650 shadow-sm'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50 hover:text-indigo-650 hover:border-indigo-150'
                        }`}
                      >
                        Ano {year} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {inspecoesList.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-350">
                  <History className="mx-auto text-slate-300 mb-3" size={48} />
                  <p className="text-slate-500 font-medium">Ainda não há registos históricos de inspeção ou rascunhos para esta jangada.</p>
                </div>
              ) : filteredInspecoes.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
                  Sem inspeções registadas no ano {selectedHistoryYear}.
                </div>
              ) : (
                <div className="space-y-4">
                  {compareSelection.length > 0 && (
                    <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-150 rounded-2xl animate-in slide-in-from-top duration-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-950">
                          Selecionadas {compareSelection.length} de 2 vistorias para comparação side-by-side
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCompareSelection([])}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl bg-white"
                        >
                          Limpar
                        </button>
                        {compareSelection.length === 2 && (
                          <button
                            onClick={() => setIsCompareOpen(true)}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <span>🔍 Comparar Agora</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {filteredInspecoes.map((insp: Inspecao) => {
                    const isSelectedForCompare = compareSelection.includes(insp.id);
                    const handleToggleCompare = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (isSelectedForCompare) {
                        setCompareSelection(compareSelection.filter(id => id !== insp.id));
                      } else {
                        if (compareSelection.length >= 2) {
                          appToast.warning("Selecione no máximo 2 inspeções para comparar.");
                          return;
                        }
                        setCompareSelection([...compareSelection, insp.id]);
                      }
                    };

                    return (
                      <div 
                        key={insp.id} 
                        className={`border rounded-2xl p-5 flex flex-col bg-white hover:border-slate-350 transition-colors ${
                          isSelectedForCompare ? "border-indigo-500 ring-2 ring-indigo-50" : "border-slate-200"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={handleToggleCompare}
                                className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                  isSelectedForCompare 
                                    ? "bg-indigo-600 border-indigo-600 text-white" 
                                    : "border-slate-300 hover:border-indigo-400 bg-white"
                                }`}
                                title="Selecionar para comparar"
                              >
                                {isSelectedForCompare && <span className="text-[10px] font-bold">✓</span>}
                              </button>
                              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex flex-col items-center justify-center min-w-[100px] text-center">
                                <Calendar className="text-indigo-600 mb-1" size={20} />
                                <span className="text-xs font-bold text-indigo-950">{formatDate(insp.dataInspecao)}</span>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800 text-base">
                                Certificado nº: {insp.certificadoNumero || 'Draft / Não emitido'}
                                {cylinderChangedText(insp) && (
                                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold align-middle">
                                    <RefreshCw size={11} />
                                    Cilindro trocado
                                  </span>
                                )}
                              </h4>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span>Responsável: <strong>{insp.responsavel || 'Operador'}</strong></span>
                                <span>•</span>
                                <span>Próxima Inspeção: <strong>{formatDate(insp.dataProxInspecao)}</strong></span>
                                {insp.numeroObra && (
                                  <>
                                    <span>•</span>
                                    <span>Nº Obra: <strong className="text-indigo-600 font-bold">{insp.numeroObra}</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        <div className="flex items-center gap-3 self-end md:self-auto">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            insp.status === 'Concluída' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : insp.status === 'Draft'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {insp.status || 'Pendente'}
                          </span>
                          {insp.integrityHash ? (
                            <span
                              title={`Hash de integridade: ${insp.integrityHash || ''}${insp.integrityTimestamp ? `\nCarimbado em: ${new Date(insp.integrityTimestamp).toLocaleString('pt-PT')}` : ''}`}
                              className={`px-3 py-1 rounded-full text-xs font-bold border no-print flex items-center gap-1.5 ${
                                insp.integrityValid === true
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : insp.integrityValid === false
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                              }`}
                            >
                              {insp.integrityValid === true ? (
                                <ShieldCheck size={12} />
                              ) : insp.integrityValid === false ? (
                                <ShieldAlert size={12} />
                              ) : (
                                <Clock size={12} />
                              )}
                              {insp.integrityValid === false
                                ? 'Carimbo Alterado'
                                : `Carimbado${insp.integrityTimestamp ? ` · ${new Date(insp.integrityTimestamp).toLocaleString('pt-PT')}` : ''}`}
                            </span>
                          ) : (
                            insp.status === 'Concluída' && (
                              <button
                                onClick={() => handleStampInspecao(insp.id)}
                                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-150 transition-all no-print flex items-center gap-1"
                                title="Aplicar carimbo temporal (hash de integridade SHA-256) a esta inspeção"
                              >
                                <Clock size={12} />
                                Carimbar
                              </button>
                            )
                          )}
                          <a
                            href={`/api/ordens-servico/orcamento-historico?inspecaoId=${insp.id}&jangadaId=${data.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-xl border border-teal-200 transition-all no-print flex items-center gap-1 shadow-sm"
                            title="Descarregar Orçamento Excel específico desta Inspeção"
                          >
                            <span>📊 Orçamento</span>
                          </a>
                          <button
                            onClick={() => setSelectedInspecao(insp)}
                            className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-150 transition-all no-print flex items-center gap-1"
                          >
                            <span>📄 Detalhes</span>
                          </button>
                          <button
                            onClick={() => setExpandedInspectionId(expandedInspectionId === insp.id ? null : insp.id)}
                            className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all no-print flex items-center gap-1"
                          >
                            <span>{expandedInspectionId === insp.id ? '▲ Omitir Artigos' : '▼ Ver Artigos'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Articles Accordion */}
                      {expandedInspectionId === insp.id && (
                        <div className="w-full mt-5 pt-5 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Artigos e Consumíveis Substituídos / Verificados nesta Inspeção ({insp.artigos?.length || 0})
                            </h5>
                          </div>
                          {(!insp.artigos || insp.artigos.length === 0) ? (
                            <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                              Não existem consumíveis ou validades registadas associadas a este certificado histórico.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm">
                              <table className="w-full text-left border-collapse bg-white text-xs">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                                    <th className="px-4 py-3">Designação do Artigo</th>
                                    <th className="px-4 py-3">Referência</th>
                                    <th className="px-4 py-3">Lote / Cód. Fabr.</th>
                                    <th className="px-4 py-3 text-center">Qtd.</th>
                                    <th className="px-4 py-3">Data de Validade</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {insp.artigos.map((art: Artigo) => {
                                    const isValvulaHead = ['VAL-', 'HEAD-', 'CONN-', 'SYS-'].some((p) => art.referencia?.startsWith(p)) || art.referencia?.startsWith('0.');
                                    return (
                                      <tr key={art.id} className={`hover:bg-slate-50/50 transition-colors ${isValvulaHead ? 'bg-indigo-50/40 border-l-2 border-l-indigo-400' : ''}`}>
                                        <td className="px-4 py-2.5 font-semibold text-slate-800 flex items-center gap-1.5">
                                          {isValvulaHead && <span className="text-indigo-500 text-[10px]" title="Válvula/Cabeça">⚙</span>}
                                          {art.name}
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-slate-500">{art.referencia || '—'}</td>
                                        <td className="px-4 py-2.5 text-slate-600">{art.codigoFabricante || '—'}</td>
                                        <td className="px-4 py-2.5 text-center font-bold text-slate-700">{art.quantidade}</td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-700">{formatMonthYear(art.validade)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

              <div className="mt-8 border-t border-slate-100 pt-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <History className="text-blue-600" />
                  Histórico de Rastreabilidade (Transferências de Navio)
                </h3>
                {movimentos.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                          <th className="p-4">Data</th>
                          <th className="p-4">Origem</th>
                          <th className="p-4">Destino</th>
                          <th className="p-4">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {movimentos.map((mov: Movimento) => (
                          <tr key={mov.id} className="hover:bg-slate-50/50">
                            <td className="p-4 text-slate-500">{new Date(mov.data).toLocaleString('pt-PT')}</td>
                            <td className="p-4 font-medium text-slate-700">{mov.origemShipNome || 'Sem Navio'}</td>
                            <td className="p-4 font-medium text-slate-700">{mov.destinoShipNome || 'Sem Navio'}</td>
                            <td className="p-4 text-slate-500">{mov.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-center py-8">Sem registo de transferências de navios para esta jangada.</p>
                )}
              </div>
            </div>
          );
        })()}

        {activeTab === 'testeWP' && (() => {
          const wpSource = isEditing ? editForm : data;
          const wpDerived = buildWpDerivedValues({
            pressureUnit: wpSource.testeWPUnidadePressao,
            startTime: wpSource.testeWPHoraInicio,
            tempInitial: wpSource.testeWPTemperaturaInicial,
            tempFinal: wpSource.testeWPTemperaturaFinal,
            baroInitial: wpSource.testeWPPressaoAtmosfericaInicial,
            baroFinal: wpSource.testeWPPressaoAtmosfericaFinal,
            upperStart: wpSource.testeWPCamaraSuperiorInicio,
            upperEnd: wpSource.testeWPCamaraSuperiorFim,
            lowerStart: wpSource.testeWPCamaraInferiorInicio,
            lowerEnd: wpSource.testeWPCamaraInferiorFim,
          });

          const testRecs = getTestRecommendations({
            brand: data.brand,
            model: data.model,
            launchType: data.launchType || data.tipoLancamento,
            dataFabrico: data.dataFabrico,
            inspectionDate: data.dataInspecao,
          });

          const manualStatusFor = (testId: string) => {
            return testRecs.find((rec) => rec.testId === testId)?.status || "unknown";
          };

          const statusBadgeFor = (testId: string) => {
            const status = manualStatusFor(testId);
            if (status === "required") return { label: "OBRIGATÓRIO", className: "bg-emerald-100 border-emerald-300 text-emerald-800" };
            if (status === "overdue") return { label: "ATRASADO", className: "bg-rose-100 border-rose-300 text-rose-800" };
            if (status === "not-required") return { label: "N/A", className: "bg-slate-100 border-slate-200 text-slate-500" };
            return { label: "OPCIONAL", className: "bg-amber-50 border-amber-200 text-amber-700" };
          };

          const otherTestKeys = ['testeNAP', 'testeFS', 'testeGI', 'testeDL'] as const;

          const anyFailedOther = otherTestKeys.some((k) => wpSource[k] === 'REPROVOU');

          const requiredIncomplete = otherTestKeys.some((k) => {
            const status = manualStatusFor(k);
            if (status !== 'required' && status !== 'overdue') return false;
            const v = wpSource[k];
            return !v || v === 'N/A' || v === 'NO';
          });

          const failingReasons: string[] = [];
          if (wpDerived.upper.passes === false) failingReasons.push('queda de pressão na câmara superior > 5%');
          if (wpDerived.lower.passes === false) failingReasons.push('queda de pressão na câmara inferior > 5%');
          if (wpDerived.temperatureWithinManual === false) failingReasons.push('variação térmica ΔT > 3.5°C');
          otherTestKeys.forEach((k) => {
            if (wpSource[k] === 'REPROVOU') failingReasons.push('teste ' + k.replace('teste', '') + ' reprovado');
          });
          otherTestKeys.forEach((k) => {
            const status = manualStatusFor(k);
            if ((status === 'required' || status === 'overdue') && (!wpSource[k] || wpSource[k] === 'N/A')) {
              failingReasons.push('teste ' + k.replace('teste', '') + ' obrigatório sem registo (ou N/A)');
            }
          });

          const isTestPassed =
            wpDerived.upper.passes !== false &&
            wpDerived.lower.passes !== false &&
            (wpDerived.upper.passes !== null || wpDerived.lower.passes !== null) &&
            !anyFailedOther &&
            !requiredIncomplete;

          const isTestDefined = 
            wpSource.testeWP || 
            wpSource.testeWPHoraInicio || 
            wpSource.testeWPCamaraSuperiorInicio || 
            wpSource.testeWPCamaraInferiorInicio ||
            otherTestKeys.some((k) => wpSource[k] && wpSource[k] !== 'N/A');

          return (
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Gauge className="text-indigo-600" />
                  Registo do Teste de Pressão de Trabalho (WP)
                </h2>
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full animate-pulse">
                      Modo de Edição Ativo
                    </span>
                  )}
                  <button
                    onClick={() => { setTimeout(() => { window.print(); }, 50); }}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  >
                    <Printer size={15} />
                    Imprimir Ficha
                  </button>
                </div>
              </div>

              {/* Sub-Navegação da Aba de Testes */}
              <div className="sticky top-16 z-10 -mx-1 px-1 flex flex-wrap gap-2 bg-white/90 backdrop-blur rounded-2xl border border-slate-200/70 py-2 shadow-sm">
                {([
                  ['#wp-condicoes', 'Condições'],
                  ['#wp-camara-sup', 'Câmara Superior'],
                  ['#wp-camara-inf', 'Câmara Inferior'],
                  ['#wp-outros', 'Outros Testes'],
                  ['#wp-hidraulico', 'Hidráulico'],
                ] as const).map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border border-transparent hover:border-indigo-200 transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </div>

              {/* Status Banner */}
              {isTestDefined ? (
                <div className={`p-4 rounded-2xl border flex items-center gap-4 ${
                  isTestPassed 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <div className={`rounded-xl p-2.5 ${isTestPassed ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`}>
                    <Gauge size={24} className={isTestPassed ? 'text-emerald-700' : 'text-rose-700'} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      Resultado Geral: {isTestPassed ? 'APROVADO' : 'REPROVADO / NÃO EM CONFORMIDADE'}
                    </h3>
                    <p className="text-xs opacity-90 mt-0.5">
                      {isTestPassed 
                        ? 'O ensaio cumpre as especificações do manual: queda de pressão ≤ 5%, variação térmica ΔT ≤ 3.5°C e teste (NAP/FS/GI/DL) obrigatórios registados como conformes.'
                        : failingReasons.length
                          ? 'Motivos: ' + failingReasons.join('; ') + '.'
                          : 'A queda de pressão excedeu o limite máximo de 5% em pelo menos uma câmara ou a variação térmica de temperatura foi superior a 3.5°C.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 flex items-center gap-4">
                  <div className="rounded-xl p-2.5 bg-amber-500/15">
                    <AlertCircle size={24} className="text-amber-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Sem registo completo</h3>
                    <p className="text-xs opacity-90 mt-0.5">
                      Não existem dados completos registados para o último ensaio WP. Use o botão &quot;Editar&quot; no topo da página para registar as leituras.
                    </p>
                  </div>
                </div>
              )}

              {/* Test Recommendations based on Manufacture Year */}
              {(() => {
                const requiredTests = testRecs.filter(r => r.status === 'required' || r.status === 'overdue');
                const optionalTests = testRecs.filter(r => r.status === 'optional');
                if (requiredTests.length === 0 && optionalTests.length === 0) return null;
                return (
                  <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/80 text-blue-900 space-y-2">
                    <div className="flex items-center gap-2">
                      <Info size={16} className="text-blue-600" />
                      <h4 className="font-bold text-xs uppercase tracking-wider">Testes Obrigatórios por Idade da Jangada</h4>
                      {testRecs[0]?.ageYears !== null && testRecs[0]?.ageYears !== undefined && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {testRecs[0].ageYears} {testRecs[0].ageYears === 1 ? 'ano' : 'anos'} de fabrico
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {testRecs.map(rec => (
                        <div key={rec.testId} className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                          rec.status === 'required' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' :
                          rec.status === 'overdue' ? 'bg-red-100 border-red-300 text-red-800' :
                          rec.status === 'not-required' ? 'bg-slate-100 border-slate-200 text-slate-500 line-through' :
                          'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                          {rec.shortLabel}: {rec.status === 'required' ? 'OBRIGATÓRIO' : rec.status === 'overdue' ? 'ATRASADO' : rec.status === 'not-required' ? 'N/A' : 'OPCIONAL'}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Grid 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Coluna Esquerda: Condições WP e Outros Testes */}
                <div className="space-y-6">
                  {/* Condições do Ensaio */}
                  <div id="wp-condicoes" className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 scroll-mt-24">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-200/60">
                      <ClipboardList size={16} className="text-indigo-500" />
                      Condições Gerais do Ensaio
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Data do Teste (Mês/Ano)</span>
                        {isEditing ? (
                          <input
                            type="month"
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWP || ''}
                            onChange={(e) => handleWpFieldChange('testeWP', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{formatDate(data.testeWP)}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Unidade de Pressão</span>
                        <select
                          className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                          value={(isEditing ? editForm.testeWPUnidadePressao : data.testeWPUnidadePressao) || 'mbar'}
                          onChange={(e) => handleWpFieldChange('testeWPUnidadePressao', e.target.value)}
                        >
                          <option value="mbar">mbar</option>
                          <option value="hpa">hPa</option>
                          <option value="inh2o">inH2O</option>
                          <option value="inhg">inHg</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Hora de Início</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPHoraInicio || ''}
                            placeholder="Ex.: 09:00"
                            onChange={(e) => handleWpFieldChange('testeWPHoraInicio', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPHoraInicio || '—'}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Hora de Fim (Calculada)</span>
                        <p className="font-semibold text-slate-800 bg-slate-100/60 px-3 py-2 rounded-xl text-sm border border-slate-200/40">
                          {wpDerived.endTime || wpSource.testeWPHoraFim || '—'}
                        </p>
                      </div>

                      {/* Temperaturas */}
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Temp. Inicial (°C)</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPTemperaturaInicial || ''}
                            placeholder="Ex.: 18.5"
                            onChange={(e) => handleWpFieldChange('testeWPTemperaturaInicial', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPTemperaturaInicial ? `${data.testeWPTemperaturaInicial} °C` : '—'}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Temp. Final (°C)</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPTemperaturaFinal || ''}
                            placeholder="Ex.: 19.5"
                            onChange={(e) => handleWpFieldChange('testeWPTemperaturaFinal', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPTemperaturaFinal ? `${data.testeWPTemperaturaFinal} °C` : '—'}</p>
                        )}
                      </div>

                      {/* Pressões Atmosféricas */}
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pressão Atmosférica Inicial (hPa)</span>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              className="flex-1 border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 min-w-0"
                              value={editForm.testeWPPressaoAtmosfericaInicial || ''}
                              placeholder="Ex.: 1013"
                              onChange={(e) => handleWpFieldChange('testeWPPressaoAtmosfericaInicial', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => fetchLocalPressure('testeWPPressaoAtmosfericaInicial')}
                              title="Obter Pressão Atmosférica Atual via GPS"
                              className="px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-850 rounded-xl transition-all text-xs font-bold border border-indigo-150 flex items-center gap-1 shrink-0"
                            >
                              <Gauge size={14} />
                              <span>GPS</span>
                            </button>
                          </div>
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPPressaoAtmosfericaInicial ? `${data.testeWPPressaoAtmosfericaInicial} hPa` : '—'}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pressão Atmosférica Final (hPa)</span>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              className="flex-1 border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 min-w-0"
                              value={editForm.testeWPPressaoAtmosfericaFinal || ''}
                              placeholder="Ex.: 1012"
                              onChange={(e) => handleWpFieldChange('testeWPPressaoAtmosfericaFinal', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => fetchLocalPressure('testeWPPressaoAtmosfericaFinal')}
                              title="Obter Pressão Atmosférica Atual via GPS"
                              className="px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-850 rounded-xl transition-all text-xs font-bold border border-indigo-150 flex items-center gap-1 shrink-0"
                            >
                              <Gauge size={14} />
                              <span>GPS</span>
                            </button>
                          </div>
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPPressaoAtmosfericaFinal ? `${data.testeWPPressaoAtmosfericaFinal} hPa` : '—'}</p>
                        )}
                      </div>
                    </div>

                    {/* Variações Calculadas */}
                    {isTestDefined && (() => {
                      const wpUnitLabel = (isEditing ? editForm.testeWPUnidadePressao : data.testeWPUnidadePressao) || 'mbar';
                      const wpCorrTempDisplay = wpDerived.correctionTempMb !== null ? convertMbarToUnit(wpDerived.correctionTempMb, wpDerived.unit) : null;
                      const wpCorrBaroDisplay = wpDerived.correctionBaroMb !== null ? convertMbarToUnit(wpDerived.correctionBaroMb, wpDerived.unit) : null;
                      const wpTotalCorrDisplay = wpDerived.totalCorrectionMb !== null ? convertMbarToUnit(wpDerived.totalCorrectionMb, wpDerived.unit) : null;
                      return (
                      <div className="mt-3 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2 text-xs text-indigo-900">
                        <div className="flex justify-between items-start gap-3">
                          <span>Variação de Temperatura (ΔT):</span>
                          <span className={`font-bold text-right ${wpDerived.temperatureWithinManual === false ? 'text-rose-650' : 'text-indigo-950'}`}>
                            {wpDerived.tempDelta !== null ? `${wpDerived.tempDelta.toFixed(2)} °C` : '—'}
                            {wpDerived.temperatureWithinManual !== null && (
                              <span className="ml-1.5 font-semibold text-[10px] block">
                                ({wpDerived.temperatureWithinManual ? 'ΔT ≤ 3.5°C OK' : 'ΔT > 3.5°C FORA DO LIMITE'})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span>Correção Térmica (−4 mbar/°C):</span>
                          <span className="font-bold text-right">{wpCorrTempDisplay !== null ? `${wpCorrTempDisplay.toFixed(2)} ${wpUnitLabel}` : '—'}</span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span>Correção Pressão Atm.:</span>
                          <span className="font-bold text-right">{wpCorrBaroDisplay !== null ? `${wpCorrBaroDisplay.toFixed(2)} ${wpUnitLabel}` : '—'}</span>
                        </div>
                        <div className="flex justify-between items-start gap-3 border-t border-indigo-200 pt-2 mt-1">
                          <span className="font-black">Correção Total:</span>
                          <span className="font-black text-right">{wpTotalCorrDisplay !== null ? `${wpTotalCorrDisplay >= 0 ? '+' : ''}${wpTotalCorrDisplay.toFixed(2)} ${wpUnitLabel}` : '—'}</span>
                        </div>
                      </div>
                      );
                    })()}
                  </div>

                  {/* Outros Testes e Ensaios */}
                  <div id="wp-outros" className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 scroll-mt-24">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-200/60">
                      <Wrench size={16} className="text-indigo-500" />
                      Outros Testes e Ensaios Operacionais
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {([
                        ['Teste NAP (Pressão Adicional)', 'testeNAP'],
                        ['Teste FS (Resistência Fundo)', 'testeFS'],
                        ['Teste GI (Insuflação por Gás)', 'testeGI'],
                        ['Teste DL (Lançamento por Turco)', 'testeDL'],
                      ] as const).map(([label, key]) => {
                        const manualBadge = statusBadgeFor(key);
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${manualBadge.className}`}>
                                {manualBadge.label}
                              </span>
                            </div>
                            {isEditing ? (
                              <select
                                className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                                value={editForm[key] || 'N/A'}
                                onChange={(e) => handleEditChange(key, e.target.value)}
                              >
                                <option value="YES">YES</option>
                                <option value="NO">NO</option>
                                <option value="N/A">N/A</option>
                              </select>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  wpSource[key] === 'YES' 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : wpSource[key] === 'NO'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-slate-100 text-slate-800'
                                }`}>
                                  {wpSource[key] || 'N/A'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Teste Hidráulico do Cilindro */}
                  <div id="wp-hidraulico" className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 scroll-mt-24">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-200/60">
                      <Cylinder size={16} className="text-indigo-500" />
                      Teste Hidráulico do Cilindro (5 anos)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Último Teste Hid.</span>
                        {isEditing ? (
                          <input
                            type="month"
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={String(editForm.cylinderDataTeste || '')}
                            onChange={(e) => handleCylinderChange('cylinderDataTeste', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{formatDate(data.cylinderDataTeste)}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Próx. Teste Hid.</span>
                        {isEditing ? (
                          <input
                            type="month"
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.cylinderDataProxTeste ? String(editForm.cylinderDataProxTeste).slice(0, 7) : ''}
                            onChange={(e) => handleCylinderChange('cylinderDataProxTeste', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{formatDate(data.cylinderDataProxTeste)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Câmaras Superior e Inferior */}
                <div className="space-y-6">
                  {/* Câmara Superior */}
                  <div id="wp-camara-sup" className="border border-slate-200 rounded-2xl p-5 space-y-4 scroll-mt-24">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between pb-2 border-b border-slate-100">
                      <span>Câmara Superior</span>
                      {isTestDefined && wpDerived.upper.passes !== null && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          wpDerived.upper.passes ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {wpDerived.upper.passes ? 'Aprovado' : 'Falhou'}
                        </span>
                      )}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura Inicial</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPCamaraSuperiorInicio || ''}
                            placeholder="Ex.: 2.50"
                            onChange={(e) => handleWpFieldChange('testeWPCamaraSuperiorInicio', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPCamaraSuperiorInicio || '—'} {data.testeWPUnidadePressao || 'mbar'}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura Final</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPCamaraSuperiorFim || ''}
                            placeholder="Ex.: 2.45"
                            onChange={(e) => handleWpFieldChange('testeWPCamaraSuperiorFim', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPCamaraSuperiorFim || '—'} {data.testeWPUnidadePressao || 'mbar'}</p>
                        )}
                      </div>
                    </div>

                    {isTestDefined && (
                      <div className="grid grid-cols-3 gap-2.5 pt-2 text-center">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Pressão Corrigida</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">{wpDerived.upper.correctedEndDisplay || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Queda Real</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">{wpDerived.upper.dropDisplay || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Percentagem Queda</span>
                          <span className={`text-xs font-extrabold mt-0.5 block ${wpDerived.upper.passes === false ? 'text-rose-650 font-black' : 'text-slate-800'}`}>
                            {wpDerived.upper.dropPercentDisplay ? `${wpDerived.upper.dropPercentDisplay}%` : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {isTestDefined && wpDerived.upper.dropPercent !== null && wpDerived.upper.dropPercent > 5 && (
                      <div className="mt-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2.5 flex items-center gap-1.5 animate-pulse">
                        <AlertCircle size={14} />
                        Queda de Pressão excessiva ({(wpDerived.upper.dropPercent).toFixed(2)}%)! Excedeu o limite regulamentar de 5%.
                      </div>
                    )}
                  </div>

                  {/* Câmara Inferior */}
                  <div id="wp-camara-inf" className="border border-slate-200 rounded-2xl p-5 space-y-4 scroll-mt-24">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between pb-2 border-b border-slate-100">
                      <span>Câmara Inferior</span>
                      {isTestDefined && wpDerived.lower.passes !== null && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          wpDerived.lower.passes ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {wpDerived.lower.passes ? 'Aprovado' : 'Falhou'}
                        </span>
                      )}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura Inicial</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPCamaraInferiorInicio || ''}
                            placeholder="Ex.: 2.50"
                            onChange={(e) => handleWpFieldChange('testeWPCamaraInferiorInicio', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPCamaraInferiorInicio || '—'} {data.testeWPUnidadePressao || 'mbar'}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura Final</span>
                        {isEditing ? (
                          <input
                            className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500"
                            value={editForm.testeWPCamaraInferiorFim || ''}
                            placeholder="Ex.: 2.45"
                            onChange={(e) => handleWpFieldChange('testeWPCamaraInferiorFim', e.target.value)}
                          />
                        ) : (
                          <p className="font-semibold text-slate-800">{data.testeWPCamaraInferiorFim || '—'} {data.testeWPUnidadePressao || 'mbar'}</p>
                        )}
                      </div>
                    </div>

                    {isTestDefined && (
                      <div className="grid grid-cols-3 gap-2.5 pt-2 text-center">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Pressão Corrigida</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">{wpDerived.lower.correctedEndDisplay || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Queda Real</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">{wpDerived.lower.dropDisplay || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[10px] font-bold text-slate-450 uppercase tracking-wide">Percentagem Queda</span>
                          <span className={`text-xs font-extrabold mt-0.5 block ${wpDerived.lower.passes === false ? 'text-rose-650 font-black' : 'text-slate-800'}`}>
                            {wpDerived.lower.dropPercentDisplay ? `${wpDerived.lower.dropPercentDisplay}%` : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {isTestDefined && wpDerived.lower.dropPercent !== null && wpDerived.lower.dropPercent > 5 && (
                      <div className="mt-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2.5 flex items-center gap-1.5 animate-pulse">
                        <AlertCircle size={14} />
                        Queda de Pressão excessiva ({(wpDerived.lower.dropPercent).toFixed(2)}%)! Excedeu o limite regulamentar de 5%.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {activeTab === 'boletins' && (() => {
          const bulletins = data.applicableServiceBulletins || [];
          const appliedCount = bulletins.filter((b) => bulletinsApplied[b.id] === 'APLICADO').length;
          const verifyingCount = bulletins.filter((b) => bulletinsApplied[b.id] === 'EM_VERIFICACAO').length;

          return (
            <div className="bg-white rounded-3xl border border-slate-200/60 p-6 lg:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileCheck className="text-indigo-600" />
                  Boletins de Serviço Aplicáveis
                </h2>
                <button
                  onClick={() => void handleSaveBulletins()}
                  disabled={bulletinsSaving}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  {bulletinsSaving ? 'A guardar...' : 'Guardar Estado'}
                </button>
              </div>

              {bulletinsSaveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  Erro ao guardar: {bulletinsSaveError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {bulletins.length} aplicável{bulletins.length === 1 ? '' : 'eis'}
                </span>
                <span className="font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  {appliedCount} aplicado{appliedCount === 1 ? '' : 's'}
                </span>
                {verifyingCount > 0 && (
                  <span className="font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                    {verifyingCount} em verificação
                  </span>
                )}
              </div>

              {bulletins.length === 0 ? (
                <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/60 text-center text-slate-500">
                  <FileCheck className="mx-auto mb-3 text-slate-300" size={40} />
                  <p className="font-semibold text-sm">Não há boletins de serviço aplicáveis a esta jangada.</p>
                  <p className="text-xs mt-1 text-slate-400">
                    A aplicabilidade é calculada a partir da marca, modelo, lotação e características técnicas da jangada.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bulletins.map((bulletin) => {
                    const status = normalizeBulletinStatus(bulletinsApplied[bulletin.id]);
                    const cardClass =
                      status === 'APLICADO'
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : status === 'EM_VERIFICACAO'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-slate-200 bg-white';
                    const statusBadgeClass =
                      status === 'APLICADO'
                        ? 'text-emerald-700 bg-emerald-100'
                        : status === 'EM_VERIFICACAO'
                          ? 'text-amber-700 bg-amber-100'
                          : 'text-slate-600 bg-slate-100';
                    return (
                      <div
                        key={bulletin.id}
                        className={`border rounded-2xl p-5 space-y-3 transition-colors ${cardClass}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                                {bulletin.bulletinNumber || bulletin.id}
                              </span>
                              {status !== 'POR_APLICAR' && (
                                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass}`}>
                                  {SERVICE_BULLETIN_STATUS_LABELS[status]}
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-slate-800 text-sm leading-snug">{bulletin.title}</h3>
                          </div>
                          <div className="shrink-0 flex items-center">
                            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                              {SERVICE_BULLETIN_STATUS_ORDER.map((option) => {
                                const active = option === status;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => setBulletinsApplied((prev) => ({ ...prev, [bulletin.id]: option }))}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                      active
                                        ? option === 'APLICADO'
                                          ? 'bg-emerald-600 text-white'
                                          : option === 'EM_VERIFICACAO'
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-slate-600 text-white'
                                        : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                  >
                                    {SERVICE_BULLETIN_STATUS_LABELS[option]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
                          {bulletin.issueDate && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{bulletin.issueDate}</span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{bulletin.manufacturer}</span>
                          {bulletin.matchedModel && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{bulletin.matchedModel}</span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">{bulletin.reason}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-[11px] text-slate-500 leading-relaxed">
                <b>Aplicabilidade dinâmica:</b> esta lista é calculada a partir dos dados técnicos da jangada (marca, modelo,
                lotação, altura de lançamento, contentor, sistema de insuflação, válvulas e inventário de peças). Quando terminar
                a aplicação de um boletim, marque a caixa correspondente e clique em <b>&quot;Guardar Estado&quot;</b> para registar
                a confirmação na ficha.
              </div>
            </div>
          );
        })()}

        {selectedInspecao && (
          <InspecaoDetalhesDialog
            inspecao={selectedInspecao as import('@/types/inspecao-detalhes-dialog').Inspecao}
            onClose={() => setSelectedInspecao(null)}
          />
        )}

        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col text-left">
              <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4">
                <h2 className="text-lg font-bold text-slate-800">Agendar Inspeção</h2>
                <button 
                  onClick={() => setIsScheduleModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {schedulingError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {schedulingError}
                  </div>
                )}
                {schedulingSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                    {schedulingSuccess}
                  </div>
                )}

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600">
                  <p><b>Jangada:</b> {data.brand} {data.model} ({data.serial})</p>
                  <p><b>Navio:</b> {data.shipNameManual || data.owner || "Sem navio"}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data / Hora de Início</label>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Técnico Responsável</label>
                  <select
                    value={scheduleTecnico}
                    onChange={(e) => setScheduleTecnico(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Escolher técnico...</option>
                    {tecnicos.map((tecnico) => (
                      <option key={tecnico.id} value={tecnico.nome}>
                        {tecnico.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas / Observações</label>
                  <textarea
                    value={scheduleNote}
                    onChange={(e) => setScheduleNote(e.target.value)}
                    placeholder="Instruções ou observações adicionais..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveSchedule()}
                  disabled={isScheduling}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isScheduling ? "A agendar..." : "Gravar Agendamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isReceiveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col text-left">
              <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4">
                <h2 className="text-lg font-bold text-slate-800">Recebida na Estação</h2>
                <button 
                  onClick={() => setIsReceiveModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                {receiveError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {receiveError}
                  </div>
                )}
                {receiveSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                    {receiveSuccess}
                  </div>
                )}

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600">
                  <p><b>Jangada:</b> {data.brand} {data.model} ({data.serial})</p>
                  <p><b>Navio:</b> {data.shipNameManual || data.owner || "Sem navio"}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data / Hora de Entrada</label>
                  <input
                    type="datetime-local"
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Técnico Responsável</label>
                  <select
                    value={receiveTecnico}
                    onChange={(e) => setReceiveTecnico(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Escolher técnico...</option>
                    {tecnicos.map((tecnico) => (
                      <option key={tecnico.id} value={tecnico.nome}>
                        {tecnico.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas / Observações</label>
                  <textarea
                    value={receiveNote}
                    onChange={(e) => setReceiveNote(e.target.value)}
                    placeholder="Estado da jangada à chegada, instruções adicionais..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveReceive()}
                  disabled={isReceiving}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                >
                  {isReceiving ? "A registar..." : "Registar Receção"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'dgrm' && (
        <DgrmIdentificationForm data={data as DgrmJangadaData} />
      )}

      {/* Print-Only Compact Dossier Page */}
      <div className="hidden print:block print-dossier-page text-slate-800 text-[10px] leading-tight">
        {(() => {
          const wpPrintDerived = buildWpDerivedValues({
            pressureUnit: data.testeWPUnidadePressao,
            startTime: data.testeWPHoraInicio,
            tempInitial: data.testeWPTemperaturaInicial,
            tempFinal: data.testeWPTemperaturaFinal,
            baroInitial: data.testeWPPressaoAtmosfericaInicial,
            baroFinal: data.testeWPPressaoAtmosfericaFinal,
            upperStart: data.testeWPCamaraSuperiorInicio,
            upperEnd: data.testeWPCamaraSuperiorFim,
            lowerStart: data.testeWPCamaraInferiorInicio,
            lowerEnd: data.testeWPCamaraInferiorFim,
          });

          const completedInspections = (data.inspecoes || [])
            .filter((insp: Inspecao) => insp.status === 'Concluída')
            .sort((a: Inspecao, b: Inspecao) => new Date(b.dataInspecao).getTime() - new Date(a.dataInspecao).getTime());
          const lastInspecao = completedInspections[0];

          return (
            <>
              {/* Header */}
              <div className="border-b-2 border-indigo-600 pb-1 mb-2 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <img src="/orey-logo.jpg" alt="Orey" className="h-6 object-contain" />
                  <h1 className="text-xs font-black text-slate-800 uppercase tracking-tight">Ficha</h1>
                  {currentUrl && (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(currentUrl)}`} 
                      alt="QR Code" 
                      className="h-7 w-7 p-0.5 border border-slate-200 rounded bg-white shrink-0" 
                    />
                  )}
                </div>
                <div className="text-right">
                  <h1 className="text-xs font-black text-slate-800 uppercase tracking-tight">Ficha</h1>
                  <div className="text-[6.5px] text-slate-450 font-medium mt-0.5">
                    Data da Ficha: {lastInspecao?.dataInspecao ? formatDate(lastInspecao.dataInspecao) : formatDate(data.dataInspecao)} · ID Jangada: #{jangadaId}
                  </div>
                </div>
              </div>

              {/* Main Grid: 2 columns for A4 portrait */}
              <div className="grid grid-cols-2 gap-2">
                {/* Left Column (Identificação + Válvulas) */}
                <div className="space-y-2">
                  {/* Box 1: Identificação */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-750 uppercase tracking-wider text-[8px]">
                      1. Identificação da Jangada
                    </div>
                    <table className="w-full text-left text-[8.5px] leading-tight">
                      <tbody>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450 w-[35%]">Marca</td><td className="px-2 py-0.5 font-bold text-slate-800">{data.brand || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Modelo</td><td className="px-2 py-0.5 font-bold text-slate-800">{data.model || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Nº Série</td><td className="px-2 py-0.5 font-mono font-bold text-slate-850">{data.serial || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Lotação</td><td className="px-2 py-0.5 text-slate-700 font-medium">{data.capacity ? `${data.capacity} P` : '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Tipo Pack</td><td className="px-2 py-0.5 font-bold text-slate-800">{data.packType || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Fabricação</td><td className="px-2 py-0.5 text-slate-700">{formatValidityDisplay(data.dataFabrico)}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Tipo Tecido</td><td className="px-2 py-0.5 text-slate-700">{data.fabricType || 'Desconhecido'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Tipo Lançam.</td><td className="px-2 py-0.5 text-slate-700">{data.launchType || 'Desconhecido'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Retenida</td><td className="px-2 py-0.5 text-slate-700">{data.painterLength ? `${data.painterLength} m` : '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Alt. Lançam.</td><td className="px-2 py-0.5 text-slate-700">{data.maxStowageHeight ? `${data.maxStowageHeight} m` : '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Navio</td><td className="px-2 py-0.5 font-bold text-indigo-700 truncate max-w-[120px]">{linkedShip?.nome || data.shipNameManual || '—'}</td></tr>
                        <tr><td className="px-2 py-0.5 font-semibold text-slate-450">Proprietário</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{linkedShip?.cliente?.nome || data.owner || '—'}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Box 3: Válvulas, Disparo & Extras */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-750 uppercase tracking-wider text-[8px]">
                      3. Válvulas, Disparo & Extras
                    </div>
                    <table className="w-full text-left text-[8.5px] leading-tight">
                      <tbody>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450 w-[35%]">Cabeça Disparo</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.cylinderCabecaDisparoRef || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">N.º Série Disp.</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.cylinderCabecaDisparoSerial || '—'}</td></tr>
                        <tr className="border-b border-slate-100 camara-sup-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Câmara Sup.</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.cylinderTuboCamaraSuperiorRef || '—'}</td></tr>
                        <tr className="border-b border-slate-100 camara-inf-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Câmara Inf.</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.cylinderTuboCamaraInferiorRef || '—'}</td></tr>
                        <tr className="border-b border-slate-100 valvulas-alivio-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Válvulas Alívio</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.valvulasAlivio || '—'}</td></tr>
                        <tr className="border-b border-slate-100 valvulas-atestar-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Válvulas Atestar</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.valvulasAtestar || '—'}</td></tr>
                        <tr className="border-b border-slate-100 contentor-mod-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Contentor Mod.</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.containerModel || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Última Insp.</td><td className="px-2 py-0.5 text-slate-700">{formatDate(data.dataInspecao)}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Próx. Insp.</td><td className="px-2 py-0.5 font-bold text-slate-800">{formatDate(data.dataProxInspecao)}</td></tr>
                        <tr><td className="px-2 py-0.5 font-semibold text-slate-450">Nº Certificado</td><td className="px-2 py-0.5 font-mono text-slate-800">{data.ultimoCertificadoNumero || '—'}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Column (Cilindro + Testes) */}
                <div className="space-y-2">
                  {/* Box 2: Cilindro e HRU */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-750 uppercase tracking-wider text-[8px]">
                      2. Cilindro & HRU
                    </div>
                    <table className="w-full text-left text-[8.5px] leading-tight">
                      <tbody>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450 w-[35%]">Cilindro Série</td><td className="px-2 py-0.5 font-mono text-slate-850">{data.cylinderSerial || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Insuflação</td><td className="px-2 py-0.5 text-slate-700">{data.cylinderSistema || data.cylinderInflationSystem || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Bruto / Tara</td><td className="px-2 py-0.5 text-slate-700">{fmtPeso(data.cylinderPesoBruto, " kg")} / {fmtPeso(data.cylinderTara, " kg")}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Gás CO2 / N2</td><td className="px-2 py-0.5 text-slate-700">{fmtPeso(data.cylinderCo2, " kg")} / {fmtPeso(data.cylinderN2, " kg")}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">Último Teste Hid.</td><td className="px-2 py-0.5 text-slate-700">{data.cylinderDataTeste || '—'}</td></tr>
                        <tr className="border-b border-slate-100"><td className="px-2 py-0.5 font-semibold text-slate-450">HRU Ref. / Val.</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.hruReferencia || '—'} / <span className="font-bold text-slate-850">{formatMonthYear(data.hruValidade)}</span></td></tr>
                        <tr className="border-b border-slate-100 refletor-row"><td className="px-2 py-0.5 font-semibold text-slate-450">Refletor Radar</td><td className="px-2 py-0.5 text-slate-700 truncate max-w-[120px]">{data.radarReflector || '—'}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Box 4: Testes & Ensaios Operacionais */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-750 uppercase tracking-wider text-[8px]">
                      4. Testes & Ensaios Operacionais
                    </div>
                    <table className="w-full text-left text-[8.5px] leading-tight">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="px-2 py-0.5 font-semibold text-slate-450 w-[35%]">Teste WP</td>
                          <td className="px-2 py-0.5 font-bold text-slate-850">{formatDate(data.testeWP)}</td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-slate-50/30">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Horário WP</td>
                          <td className="px-2 py-0.5 text-slate-700">
                            {data.testeWPHoraInicio || '—'} → {data.testeWPHoraFim || wpPrintDerived.endTime || '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-slate-50/30">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Temp WP</td>
                          <td className="px-2 py-0.5 text-slate-700">
                            {data.testeWPTemperaturaInicial ? `${data.testeWPTemperaturaInicial}ºC` : '—'} / {data.testeWPTemperaturaFinal ? `${data.testeWPTemperaturaFinal}ºC` : '—'}
                            {wpPrintDerived.tempDelta !== null ? ` (ΔT: ${wpPrintDerived.tempDelta.toFixed(1)}ºC)` : ''}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-slate-50/30">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Pressão Atmosférica WP</td>
                          <td className="px-2 py-0.5 text-slate-700">
                            {data.testeWPPressaoAtmosfericaInicial ? `${data.testeWPPressaoAtmosfericaInicial} hPa` : '—'} / {data.testeWPPressaoAtmosfericaFinal ? `${data.testeWPPressaoAtmosfericaFinal} hPa` : '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Câmara Sup.</td>
                          <td className="px-2 py-0.5 text-slate-700">
                            <div>{data.testeWPCamaraSuperiorInicio || '—'} → {data.testeWPCamaraSuperiorFim || '—'} {data.testeWPUnidadePressao === 'mbar' ? 'hPa' : (data.testeWPUnidadePressao || 'hPa')}</div>
                            <div className="text-[7.2px] text-slate-500">
                              Queda: {wpPrintDerived.upper.dropDisplay || '—'} ({wpPrintDerived.upper.dropPercentDisplay ? `${wpPrintDerived.upper.dropPercentDisplay}%` : '—'}) 
                              <span className={`ml-1 font-bold ${wpPrintDerived.upper.passes === true ? 'text-emerald-600' : wpPrintDerived.upper.passes === false ? 'text-rose-600' : ''}`}>
                                [{wpPrintDerived.upper.passes === true ? 'OK' : wpPrintDerived.upper.passes === false ? 'FALHOU' : '—'}]
                              </span>
                            </div>
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Câmara Inf.</td>
                          <td className="px-2 py-0.5 text-slate-700">
                            <div>{data.testeWPCamaraInferiorInicio || '—'} → {data.testeWPCamaraInferiorFim || '—'} {data.testeWPUnidadePressao === 'mbar' ? 'hPa' : (data.testeWPUnidadePressao || 'hPa')}</div>
                            <div className="text-[7.2px] text-slate-500">
                              Queda: {wpPrintDerived.lower.dropDisplay || '—'} ({wpPrintDerived.lower.dropPercentDisplay ? `${wpPrintDerived.lower.dropPercentDisplay}%` : '—'}) 
                              <span className={`ml-1 font-bold ${wpPrintDerived.lower.passes === true ? 'text-emerald-600' : wpPrintDerived.lower.passes === false ? 'text-rose-600' : ''}`}>
                                [{wpPrintDerived.lower.passes === true ? 'OK' : wpPrintDerived.lower.passes === false ? 'FALHOU' : '—'}]
                              </span>
                            </div>
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Teste NAP / FS</td>
                          <td className="px-2 py-0.5 font-bold text-slate-800">
                            {data.testeNAP ? `SIM (${data.testeNAP})` : 'SIM'} / {data.testeFS || 'Aprovado'}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-2 py-0.5 font-semibold text-slate-450">Teste GI / DL</td>
                          <td className="px-2 py-0.5 font-bold text-slate-800">
                            {data.testeGI || 'N/A'} / {data.testeDL || 'N/A'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Emergency Pack Compliance Summary */}
              <div className="mt-1.5 border border-slate-200 rounded-xl p-1.5 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Estado de Conformidade do Pack</div>
                  <div className="text-[9px] font-bold text-slate-800 mt-0.5">
                    Pack de Emergência: <span className="text-indigo-700 font-extrabold">{data.packType || '—'}</span> (Lotação: {data.capacity ? `${data.capacity} P` : '—'})
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const summary = getComplianceSummary();
                    let complianceBadge = (
                      <span className="bg-red-100 text-red-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase border border-red-200">
                        Inconforme
                      </span>
                    );
                    if (summary.missing === 0 && summary.expired === 0) {
                      if (summary.incomplete === 0) {
                        complianceBadge = (
                          <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase border border-emerald-200">
                            Conforme
                          </span>
                        );
                      } else {
                        complianceBadge = (
                          <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase border border-amber-200">
                            Qtd Insuficiente
                          </span>
                        );
                      }
                    }
                    return (
                      <>
                        <div className="text-right">
                          <span className="text-[8px] text-slate-500 font-medium">Itens Completos: </span>
                          <span className="font-bold text-[9px] text-slate-800">{summary.complete} / {summary.total} ({summary.percent}%)</span>
                        </div>
                        {complianceBadge}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Section 5: Inventário de Artigos */}
              {artigos.length > 0 && (() => {
                const rawArtigos = artigos;
                const dedupedArtigos = Object.values(
                  rawArtigos.reduce((acc: Record<string, Record<string, unknown>>, artigo: Artigo) => {
                    const key = translateArticleName(artigo.name || '').trim().toUpperCase();
                    if (!key) return acc;
                    if (!acc[key]) {
                      acc[key] = { ...artigo, name: translateArticleName(artigo.name), quantidade: Number(artigo.quantidade) || 0, validades: artigo.validade ? [artigo.validade] : [] } as Record<string, unknown>;
                    } else {
                      acc[key].quantidade = Number(acc[key].quantidade || 0) + Number(artigo.quantidade) || 0;
                      if (artigo.validade && !(acc[key].validades as string[])?.includes(artigo.validade)) {
                        (acc[key].validades as string[]).push(artigo.validade);
                      }
                    }
                    return acc;
                  }, {} as Record<string, Record<string, unknown>>)
                );
                return (
                <div className="mt-1.5 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-700 uppercase tracking-wider text-[8px]">
                    5. Inventário de Artigos e Consumíveis (Validades)
                  </div>
                  <div className="p-1 grid grid-cols-4 gap-x-3 gap-y-0.5 bg-white text-[7px] leading-tight">
                    {dedupedArtigos.map((artigo: Record<string, unknown>, index: number) => (
                      <div key={index} className="flex justify-between items-center py-0.5 border-b border-slate-50">
                        <span className="font-semibold truncate max-w-[140px] text-slate-700">{String(artigo.name ?? '')}</span>
                        <span className="font-mono text-[6.5px] text-slate-900 font-semibold">
                          {String(artigo.quantidade ?? '')}x{artigo.validades && (artigo.validades as string[]).length > 0 ? ` · Val: ${(artigo.validades as string[]).map((v: string) => formatMonthYear(v)).join(', ')}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}

              {/* Section 6: Consumíveis Substituídos na Última Inspeção */}
              {lastInspecao && lastInspecao.artigos && lastInspecao.artigos.length > 0 && (() => {
                const dedupedReplaced = Object.values(
                  lastInspecao.artigos.reduce((acc: Record<string, Record<string, unknown>>, art: Artigo) => {
                    const key = translateArticleName(art.name || '').trim().toUpperCase();
                    if (!key) return acc;
                    if (!acc[key]) {
                      acc[key] = { ...art, name: translateArticleName(art.name), quantidade: Number(art.quantidade) || 0 } as Record<string, unknown>;
                    } else {
                      acc[key].quantidade = Number(acc[key].quantidade || 0) + Number(art.quantidade) || 0;
                    }
                    return acc;
                  }, {} as Record<string, Record<string, unknown>>)
                );
                return (
                <div className="mt-1.5 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-bold text-slate-700 uppercase tracking-wider text-[8px] flex justify-between items-center">
                    <span>6. Consumíveis Substituídos na Última Inspeção ({formatDate(lastInspecao.dataInspecao)})</span>
                    <span className="text-slate-400 font-medium lowercase text-[7.5px]">({dedupedReplaced.length} artigos)</span>
                  </div>
                  <div className="p-1.5 grid grid-cols-4 gap-1 bg-white">
                    {dedupedReplaced.map((art: Record<string, unknown>, index: number) => (
                      <div key={index} className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-lg p-1 text-[7px]">
                        <span className="font-bold truncate max-w-[120px]" title={String(art.name ?? '')}>{String(art.name ?? '')}</span>
                        <span className="font-semibold text-slate-500 bg-slate-150 px-1 rounded">Qtd: {String(art.quantidade ?? '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}

              {/* Signatures & Footer */}
              <div className="mt-2 pt-2 border-t border-dashed border-slate-200 flex justify-center text-center">
                <div className="flex flex-col items-center">
                  {data.signatureBase64 ? (
                    <img 
                      src={data.signatureBase64} 
                      alt="Assinatura" 
                      className="h-7 object-contain mb-1" 
                    />
                  ) : lastInspecao?.signatureBase64 ? (
                    <img 
                      src={lastInspecao.signatureBase64} 
                      alt="Assinatura" 
                      className="h-7 object-contain mb-1" 
                    />
                  ) : (
                    <div className="h-4 w-32"></div>
                  )}
                  <div className="w-32 border-b border-slate-300"></div>
                  <span className="text-[6.5px] text-slate-400 mt-1 uppercase font-bold tracking-wider">Técnico Responsável</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>
      <QrLabelGeneratorDialog
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        url={currentUrl}
        title={`${data.brand || 'EUROVINIL'} ${data.model || 'COMPACT'} (${data.serial || 'S/N'})`}
        serial={data.serial || undefined}
      />
      <HistoricaInspecaoDialog
        isOpen={isHistoricaOpen}
        onClose={() => {
          setIsHistoricaOpen(false);
          setIsVistoriaAtual(false);
        }}
        jangadaId={data.id}
        isVistoriaAtual={isVistoriaAtual}
        currentRaftData={data}
        onSuccess={() => window.location.reload()}
      />
      {isCompareOpen && compareSelection.length === 2 && (() => {
        const inspA = (data.inspecoes || []).find((i: Inspecao) => i.id === compareSelection[0]);
        const inspB = (data.inspecoes || []).find((i: Inspecao) => i.id === compareSelection[1]);
        if (!inspA || !inspB) return null;
        return (
          <InspectionCompareDialog
            isOpen={isCompareOpen}
            onClose={() => setIsCompareOpen(false)}
            inspA={inspA}
            inspB={inspB}
          />
        );
      })()}

      {/* Certificado Externo Modal */}
      {isCertificadoExternoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsCertificadoExternoOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Certificado Externo (DSB / RFD / Zodiac)</h3>
                  <p className="text-xs text-slate-500">Registe o número e carregue o PDF do certificado do fabricante.</p>
                </div>
              </div>
              <button onClick={() => setIsCertificadoExternoOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nº do Certificado Externo</label>
                <input
                  type="text"
                  value={certExtNumero}
                  onChange={(e) => setCertExtNumero(e.target.value)}
                  placeholder="Ex: DSB-CERT-2026-99"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-100 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Documento PDF do Certificado</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-50 hover:bg-amber-50/30 transition-all text-xs font-bold text-slate-600">
                    <Upload size={16} className="text-amber-600" />
                    <span>{certExtUrl ? "Substituir Ficheiro PDF" : "Carregar Ficheiro PDF"}</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setCertExtSaving(true);
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("categoria", "certificados");
                          const res = await fetch("/api/upload-documento", {
                            method: "POST",
                            body: fd,
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.error || "Erro no upload");
                          const fileUrl = json.url || json.path || json.fileUrl;
                          if (fileUrl) {
                            setCertExtUrl(fileUrl);
                            appToast.success("PDF carregado com sucesso!");
                          }
                        } catch (err: unknown) {
                          appToast.error(err instanceof Error ? err.message : "Erro ao carregar PDF");
                        } finally {
                          setCertExtSaving(false);
                        }
                      }}
                    />
                  </label>
                </div>
                {certExtUrl && (
                  <div className="mt-2 flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <a href={certExtUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 truncate">
                      <FileText size={14} className="shrink-0" />
                      <span className="truncate">Ver Certificado PDF Carregado</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setCertExtUrl("")}
                      className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCertificadoExternoOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={certExtSaving}
                onClick={async () => {
                  try {
                    setCertExtSaving(true);
                    const res = await fetch(`/api/jangadas/${jangadaId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        certificadoExternoNumero: certExtNumero,
                        certificadoExternoUrl: certExtUrl,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || "Erro ao guardar certificado externo");
                    setData((prev) => ({
                      ...prev,
                      certificadoExternoNumero: certExtNumero,
                      certificadoExternoUrl: certExtUrl,
                    }));
                    appToast.success("Certificado externo guardado com sucesso!");
                    setIsCertificadoExternoOpen(false);
                  } catch (err: unknown) {
                    appToast.error(err instanceof Error ? err.message : "Erro ao guardar");
                  } finally {
                    setCertExtSaving(false);
                  }
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
              >
                {certExtSaving ? "A Guardar..." : "Guardar Certificado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Modal */}
      {showSyncResult && syncResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSyncResult(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {syncLoading ? 'A sincronizar...' : syncResult.success !== false ? 'Sincronização concluída' : 'Erro na sincronização'}
              </h3>
              <button onClick={() => setShowSyncResult(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {syncLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : syncResult.success === false ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-4">
                  <AlertCircle size={20} />
                  <p className="text-sm">{syncResult.warning || 'Erro desconhecido'}</p>
                </div>
                {syncResult.details && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 font-mono">{syncResult.details}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {syncResult.warning && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-xl p-4">
                    <AlertCircle size={20} />
                    <p className="text-sm">{syncResult.warning}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{syncResult.summary?.added || 0}</p>
                    <p className="text-xs text-green-600 font-medium">Adicionados</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{syncResult.summary?.updated || 0}</p>
                    <p className="text-xs text-blue-600 font-medium">Atualizados</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-700">{syncResult.summary?.stockLinked || 0}</p>
                    <p className="text-xs text-purple-600 font-medium">Stock ligado</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Total de itens no pack: {syncResult.summary?.total ?? '?'}
                  {syncResult.packSource ? ` · Fonte: ${syncResult.packSource}` : ''}
                </p>
                {syncResult.hasSnapshot && (
                  <button
                    onClick={async () => {
                      if (!confirm('Tem a certeza? Isto irá restaurar os artigos ao estado anterior à sincronização.')) return;
                      try {
                        const revRes = await fetch(`/api/jangadas/${jangadaId}/revert-sync`, { method: 'POST' });
                        const revJson = await revRes.json();
                        if (!revRes.ok) throw new Error(revJson.error || revJson.details);
                        alert(`Sync revertido com sucesso! ${revJson.restored} artigos restaurados.`);
                        setShowSyncResult(false);
                        fetchJangadaData();
                      } catch (err: unknown) {
                        alert('Erro ao reverter: ' + (err instanceof Error ? err.message : String(err)));
                      }
                    }}
                    className="w-full text-center text-sm text-red-600 hover:text-red-800 font-medium py-2 border border-red-200 rounded-xl hover:bg-red-50 transition"
                  >
                    Reverter sincronização (restaurar artigos anteriores)
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowSyncResult(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicar Ficha Modal */}
      {isDuplicarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !duplicarSaving && setIsDuplicarOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                  <Copy size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Duplicar Ficha da Jangada</h3>
                  <p className="text-xs text-slate-500">
                    Cria uma nova ficha a partir de <span className="font-mono font-semibold">{data.serial}</span> ({data.brand || 'EUROVINIL'} {data.model || 'COMPACT DRY'}, {data.capacity}P).
                  </p>
                </div>
              </div>
              <button onClick={() => !duplicarSaving && setIsDuplicarOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nº de Série da Nova Jangada</label>
                <input
                  type="text"
                  value={duplicarSerial}
                  onChange={(e) => setDuplicarSerial(e.target.value)}
                  placeholder="Ex: 2088-EV-2026-01"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-cyan-100 outline-none font-medium"
                />
                <p className="text-xs text-slate-400 mt-1">Os dados de inspecção, certificados, testes e validades não são copiados.</p>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={duplicarCopiarArtigos}
                  onChange={(e) => setDuplicarCopiarArtigos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-cyan-600"
                />
                <div>
                  <p className="text-sm font-bold text-slate-700">Copiar consumíveis do pack</p>
                  <p className="text-xs text-slate-500">Copia os artigos/consumíveis actuais da jangada original para a nova ficha.</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => !duplicarSaving && setIsDuplicarOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={duplicarSaving || !duplicarSerial.trim()}
                onClick={() => void handleDuplicar()}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2"
              >
                {duplicarSaving ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                {duplicarSaving ? "A Duplicar..." : "Duplicar Ficha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StrapCard({ strap, onAddToStock }: { strap: { description: string; containerFamily: string; containerLabel: string; launchType: string; size?: string; maxStowedHeightMeters?: number; strapQuantity: number; completePartNumber?: string; upperPartNumber?: string; lowerPartNumber?: string; strapPartNumber?: string; stockReference?: string; sealPartNumber?: string; notes?: string; key?: string; }; onAddToStock?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{strap.description}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {strap.containerFamily} {strap.containerLabel} · {strap.launchType === 'TO' ? 'Throw-Over' : strap.launchType === 'DL' ? 'Davit-Launched' : 'Flat-Pack'}{strap.size ? ` · Tamanho ${strap.size}` : ''}{strap.maxStowedHeightMeters ? ` · ${strap.maxStowedHeightMeters}m` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-indigo-600">{strap.strapQuantity}x</p>
          <p className="text-[10px] text-slate-400">cintas</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {strap.completePartNumber && (
          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            Completo: {strap.completePartNumber}
          </span>
        )}
        {strap.upperPartNumber && (
          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            Sup: {strap.upperPartNumber}
          </span>
        )}
        {strap.lowerPartNumber && (
          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            Inf: {strap.lowerPartNumber}
          </span>
        )}
        {strap.strapPartNumber && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Cinta: {strap.strapPartNumber}
          </span>
        )}
        {strap.stockReference && (
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Stock: {strap.stockReference}
          </span>
        )}
        {strap.sealPartNumber && (
          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
            Selo: {strap.sealPartNumber}
          </span>
        )}
      </div>
      {strap.notes && <p className="mt-1.5 text-[10px] text-slate-400 italic">{strap.notes}</p>}
      {onAddToStock && (
        <button
          onClick={onAddToStock}
          className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
        >
          + Adicionar ao Stock
        </button>
      )}
    </div>
  );
}
