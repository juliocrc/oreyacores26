"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { extrairPortoDeMatricula } from '@/utils/portosRegisto';
import { formatCoordinate } from '@/lib/coordinates';
import { APP_CONFIG } from '@/lib/app-config';
import { NAVIO_TIPO_NAVIO_OPTIONS, NAVIO_TIPO_PESCA_OPTIONS, normalizeNavioTipoCategoria } from '@/lib/navio-legal-types';
import { getNavioLegalProfile } from '@/modules/navios/legalRequirements';
import { getPescaCosteiraMandatoryEquipmentProfile } from '@/config/pescaCosteiraMandatoryEquipment';
import { getRecreioMandatoryProfile, RECREIO_ZONA_OPTIONS } from '@/config/recreioMandatoryEquipment';
import { normalizeManualNavioIsland } from '@/lib/navio-island-resolution';

const ShipMap = dynamic(() => import('@/app/components/ShipMap'), { ssr: false });

const IS_AZORES_APP = APP_CONFIG.presetKey === 'ACORES';
const LOCATION_LABEL = IS_AZORES_APP ? 'Ilha' : 'Localização';
const EDITABLE_LOCATION_LABEL = LOCATION_LABEL;

function getNavioLocationLabel(data: any) {
  const island = normalizeManualNavioIsland(data?.ilha || '');
  return island || (IS_AZORES_APP ? 'Sem ilha' : 'Sem localização');
}

const BANDEIRAS_OPCOES = [
  "Portugal",
  "Espanha",
  "França",
  "Itália",
  "Alemanha",
  "Países Baixos",
  "Reino Unido",
  "Malta",
  "Panamá",
  "Libéria",
  "Bahamas",
  "Chipre",
  "Dinamarca",
  "Noruega",
  "Suécia",
  "Canadá",
  "Estados Unidos",
  "Brasil",
] as const;

type PirotecnicoBordoItem = {
  id: string;
  item: string;
  quantity: string;
  validade: string;
  notes: string;
};

const PIROTECNIA_OPCOES = [
  'Facho de mão',
  'Foguete com paraquedas',
  'Sinal fumígeno flutuante',
  'Sinal fumígeno de mão',
  'Foguete luminoso simples',
  'Facho de mão (vermelho)',
  'Lançacabos (Line thrower)',
  'Sinal de homem ao mar / Man overboard (MOB)',
  'Kit de pirotecnia',
  'Caixa de pirotecnia',
  'Outro artigo pirotécnico',
] as const;

type PirotecniaSugestao = { item: string; quantity: string };

function parseComprimentoNavio(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getPirotecniaSugestoes(
  tipoPesca?: string | null,
  tipoNavio?: string | null,
  comprimento?: unknown,
): PirotecniaSugestao[] {
  const categoria = normalizeNavioTipoCategoria(tipoPesca || '', null, tipoNavio || '');
  const len = parseComprimentoNavio(comprimento);

  const base: PirotecniaSugestao[] = [];

  if (len !== null && len >= 12) {
    base.push({ item: 'Lançacabos (Line thrower)', quantity: '4' });
    base.push({ item: 'Sinal de homem ao mar / Man overboard (MOB)', quantity: '2' });
  } else {
    base.push({ item: 'Sinal de homem ao mar / Man overboard (MOB)', quantity: '1' });
  }

  if (categoria === 'Pesca Costeira' && len !== null) {
    if (len <= 14) {
      return [
        ...base,
        { item: 'Facho de mão', quantity: '3' },
        { item: 'Foguete com paraquedas', quantity: '4' },
        { item: 'Sinal fumígeno flutuante', quantity: '2' },
      ];
    }
    if (len <= 24) {
      return [
        ...base,
        { item: 'Facho de mão', quantity: '6' },
        { item: 'Foguete com paraquedas', quantity: '4' },
        { item: 'Sinal fumígeno flutuante', quantity: '2' },
      ];
    }
    return [
      ...base,
      { item: 'Facho de mão', quantity: '6' },
      { item: 'Foguete com paraquedas', quantity: '12' },
      { item: 'Sinal fumígeno flutuante', quantity: '4' },
    ];
  }

  if (categoria === 'Pesca do Largo') {
    return [
      ...base,
      { item: 'Facho de mão', quantity: '6' },
      { item: 'Foguete com paraquedas', quantity: '12' },
      { item: 'Sinal fumígeno flutuante', quantity: '4' },
    ];
  }

  return [
    ...base,
    { item: 'Facho de mão', quantity: '3' },
    { item: 'Foguete com paraquedas', quantity: '4' },
    { item: 'Sinal fumígeno flutuante', quantity: '2' },
  ];
}

function buildPirotecnicoItem(partial?: Partial<PirotecnicoBordoItem>): PirotecnicoBordoItem {
  return {
    id: partial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item: String(partial?.item || '').trim(),
    quantity: String(partial?.quantity || '').trim(),
    validade: String(partial?.validade || '').trim(),
    notes: String(partial?.notes || '').trim(),
  };
}

function parsePirotecnicos(raw: unknown): PirotecnicoBordoItem[] {
  if (!raw) return [];

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => buildPirotecnicoItem(item as Partial<PirotecnicoBordoItem>));
  } catch {
    return [];
  }
}

function serializePirotecnicos(items: PirotecnicoBordoItem[]) {
  const cleaned = items
    .map((item) => buildPirotecnicoItem(item))
    .filter((item) => item.item || item.quantity || item.validade || item.notes);

  return cleaned.length ? JSON.stringify(cleaned) : '';
}

function getPirotecnicoStatus(validade?: string) {
  if (!validade) return { label: 'Sem validade', tone: 'bg-gray-100 text-gray-700' };
  const target = new Date(validade);
  if (Number.isNaN(target.getTime())) return { label: 'Data inválida', tone: 'bg-amber-100 text-amber-800' };

  const msPerDay = 1000 * 60 * 60 * 24;
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.ceil((target.getTime() - current) / msPerDay);

  if (diffDays < 0) return { label: 'Expirado', tone: 'bg-red-100 text-red-700' };
  if (diffDays <= 180) return { label: `${diffDays} dias`, tone: 'bg-amber-100 text-amber-800' };
  return { label: 'Válido', tone: 'bg-emerald-100 text-emerald-700' };
}

function isDateExpired(dateStr?: string | null) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function renderLiferaftSemaforo(artigos?: any[]) {
  if (!artigos || artigos.length === 0) {
    return (
      <span className="h-3.5 w-3.5 rounded-full bg-slate-200 border border-slate-350 inline-block shadow-inner" title="Sem consumíveis registados" />
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limit90d = new Date(today);
  limit90d.setDate(limit90d.getDate() + 90);

  let hasExpired = false;
  let hasExpiringSoon = false;
  let expiredCount = 0;
  let expiringSoonCount = 0;

  for (const art of artigos) {
    if (!art.validade) continue;
    const valDate = new Date(art.validade);
    if (isNaN(valDate.getTime())) continue;

    if (valDate < today) {
      hasExpired = true;
      expiredCount++;
    } else if (valDate <= limit90d) {
      hasExpiringSoon = true;
      expiringSoonCount++;
    }
  }

  if (hasExpired) {
    return (
      <span className="h-3.5 w-3.5 rounded-full bg-rose-500 border border-rose-600 inline-block shadow shadow-rose-200 animate-pulse" title={`${expiredCount} consumível(eis) expirado(s)`} />
    );
  }
  if (hasExpiringSoon) {
    return (
      <span className="h-3.5 w-3.5 rounded-full bg-amber-400 border border-amber-500 inline-block shadow shadow-amber-200" title={`${expiringSoonCount} consumível(eis) a expirar em breve`} />
    );
  }
  return (
    <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 border border-emerald-600 inline-block shadow shadow-emerald-200" title="Todos os consumíveis em dia" />
  );
}

function parseFlexibleDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const candidate = new Date(year, month, day);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return null;
}

function formatDateLabel(value: unknown, options?: { includeTime?: boolean }) {
  const date = parseFlexibleDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(options?.includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function formatDaysRemaining(daysRemaining: number | null | undefined) {
  if (daysRemaining === null || daysRemaining === undefined) return 'Sem data';
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d em atraso`;
  if (daysRemaining === 0) return 'Vence hoje';
  return `${daysRemaining}d restantes`;
}

function getSeverityClasses(severity?: string | null) {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'ok':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getKindClasses(kind?: string | null) {
  switch (kind) {
    case 'inspection':
      return 'bg-blue-100 text-blue-700';
    case 'certificate':
      return 'bg-violet-100 text-violet-700';
    case 'verification':
      return 'bg-cyan-100 text-cyan-700';
    case 'deadline':
      return 'bg-rose-100 text-rose-700';
    case 'ordem-servico':
      return 'bg-amber-100 text-amber-800';
    case 'evidence':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getHealthScoreTone(score: number) {
  if (score >= 85) {
    return {
      ring: 'stroke-emerald-500',
      text: 'text-emerald-700',
      badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
      label: 'Robusto',
    };
  }

  if (score >= 65) {
    return {
      ring: 'stroke-amber-500',
      text: 'text-amber-700',
      badge: 'border-amber-200 bg-amber-100 text-amber-800',
      label: 'Sob atenção',
    };
  }

  return {
    ring: 'stroke-rose-500',
    text: 'text-rose-700',
    badge: 'border-rose-200 bg-rose-100 text-rose-800',
    label: 'Sob pressão',
  };
}

function getFocusCardTone(kind: 'critical' | 'attention' | 'documents' | 'coverage') {
  switch (kind) {
    case 'critical':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'attention':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'documents':
      return 'border-violet-200 bg-violet-50 text-violet-900';
    case 'coverage':
    default:
      return 'border-sky-200 bg-sky-50 text-sky-900';
  }
}

function getCategoryScoreTone(score: number) {
  if (score >= 85) return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (score >= 65) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-rose-200 bg-rose-50 text-rose-900';
}

type SmartUrgencyLevel = 'critical' | 'warning' | 'attention' | 'ok';

type SmartFocusTarget = {
  sectionId?: string;
  href?: string;
  legalTab?: 'legal' | 'mandatory';
};

type SmartFocusSignal = {
  key: string;
  title: string;
  reason: string;
  severity: SmartUrgencyLevel;
  score: number;
  actionLabel: string;
  sourceLabel: string;
  kind: 'critical' | 'attention' | 'documents' | 'coverage';
  target: SmartFocusTarget;
};

type StoredSmartFocus = {
  key: string;
  updatedAt: string;
};

function getSmartUrgencyWeight(level: SmartUrgencyLevel) {
  switch (level) {
    case 'critical':
      return 400;
    case 'warning':
      return 300;
    case 'attention':
      return 200;
    case 'ok':
    default:
      return 100;
  }
}

function compareSmartFocusSignals(a: SmartFocusSignal, b: SmartFocusSignal) {
  const weightDiff = getSmartUrgencyWeight(b.severity) - getSmartUrgencyWeight(a.severity);
  if (weightDiff !== 0) return weightDiff;
  return b.score - a.score;
}

function getSmartFocusBadge(level: SmartUrgencyLevel) {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'attention':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'ok':
    default:
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
}

function getSmartFocusStorageKey(id?: string) {
  return id ? `oreyazores:navios:smart-focus:${id}` : null;
}

export default function NavioPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params && typeof params === "object" ? (params as Record<string, string | string[]>).id : undefined;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allJangadas, setAllJangadas] = useState<any[]>([]);
  const [allColetes, setAllColetes] = useState<any[]>([]);
  const [allEpirbs, setAllEpirbs] = useState<any[]>([]);
  const [allFatosImersao, setAllFatosImersao] = useState<any[]>([]);
  const [allExtintores, setAllExtintores] = useState<any[]>([]);
  const [pirotecnicos, setPirotecnicos] = useState<PirotecnicoBordoItem[]>([]);
  const [selectedJangadaId, setSelectedJangadaId] = useState<string>("");
  const [selectedColeteId, setSelectedColeteId] = useState<string>("");
  const [selectedEpirbId, setSelectedEpirbId] = useState<string>("");
  const [selectedFatoImersaoId, setSelectedFatoImersaoId] = useState<string>("");
  const [selectedExtintorId, setSelectedExtintorId] = useState<string>("");
  const [associating, setAssociating] = useState(false);
const [newJangada, setNewJangada] = useState({ serial: '', brand: '', model: '' });
  const [jangadaSearch, setJangadaSearch] = useState("");
  const [coleteSearch, setColeteSearch] = useState("");
  const [epirbSearch, setEpirbSearch] = useState("");
  const [fatoImersaoSearch, setFatoImersaoSearch] = useState("");
  const [extintorSearch, setExtintorSearch] = useState("");
  const [generatingColeteCertificate, setGeneratingColeteCertificate] = useState(false);
  const [generatingColeteVerificationSheet, setGeneratingColeteVerificationSheet] = useState(false);
  const [legalTab, setLegalTab] = useState<'legal' | 'mandatory'>('legal');
  const [activeTab, setActiveTab] = useState<'dossier' | 'equipment' | 'technical' | 'inspections' | 'mapa'>('dossier');
  const [aisPosition, setAisPosition] = useState<any>(null);
  const [aisLoading, setAisLoading] = useState(false);
  const [aisError, setAisError] = useState<string | null>(null);
  const [aisLastRefreshAt, setAisLastRefreshAt] = useState<Date | null>(null);
  const [rememberedSmartFocus, setRememberedSmartFocus] = useState<StoredSmartFocus | null>(null);
  const smartFocusAutoAppliedRef = React.useRef(false);

  useEffect(() => { setIsClient(true); }, []);

  const loadNavio = async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);

    const navio = await fetch(`/api/navios/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.ok) return res.json();

        const payload = await res.json().catch(() => ({}));
        if (res.status === 404) return null;

        setLoadError(payload?.error || 'Não foi possível carregar a ficha do navio.');
        return null;
      })
      .catch(() => {
        setLoadError('Não foi possível carregar a ficha do navio.');
        return null;
      });

    const portoInferido = navio?.portoRegisto || extrairPortoDeMatricula(navio?.matricula) || null;
    const navioNormalizado = navio
      ? { ...navio, bandeira: navio.bandeira || "Portugal", portoRegisto: portoInferido }
      : null;
    setPirotecnicos(parsePirotecnicos(navioNormalizado?.pirotecnicosBordoJson));
    setData(navioNormalizado);
    setForm(navioNormalizado || {});
    setLoading(false);
  };

  const loadAisPosition = async (silent?: boolean) => {
    if (!id) return;
    if (!silent) setAisLoading(true);
    setAisError(null);
    try {
      const res = await fetch(`/api/navios/${encodeURIComponent(id)}/ais`);
      if (!res.ok) {
        setAisError('Não foi possível obter a posição AIS.');
        return;
      }
      const payload = await res.json();
      setAisPosition(payload?.position || null);
      setAisLastRefreshAt(new Date());
    } catch {
      setAisError('Erro de rede ao obter a posição AIS.');
    } finally {
      if (!silent) setAisLoading(false);
    }
  };

  // Atualização automática da posição AIS enquanto o mapa está ativo (60s)
  useEffect(() => {
    if (activeTab !== 'mapa') return;
    const timer = window.setInterval(() => {
      loadAisPosition(true);
    }, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  const loadJangadas = async () => {
    try {
      const res = await fetch('/api/jangadas?scope=all');
      if (!res.ok) { setAllJangadas([]); return; }
      const items = await res.json();
      setAllJangadas(Array.isArray(items) ? items : []);
    } catch {
      setAllJangadas([]);
    }
  };

  const loadColetes = async () => {
    const items = await fetch('/api/coletes')
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);
    setAllColetes(Array.isArray(items) ? items : []);
  };

  const loadEpirbs = async () => {
    const items = await fetch('/api/epirbs')
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);
    setAllEpirbs(Array.isArray(items) ? items : []);
  };

  const loadFatosImersao = async () => {
    const items = await fetch('/api/fatos-imersao')
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);
    setAllFatosImersao(Array.isArray(items) ? items : []);
  };

  const loadExtintores = async () => {
    const items = await fetch('/api/extintores')
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);
    setAllExtintores(Array.isArray(items) ? items : []);
  };

  useEffect(() => {
    if (!id) return;
    loadNavio();
    loadJangadas();
    loadColetes();
    loadEpirbs();
    loadFatosImersao();
    loadExtintores();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'mapa') {
      loadAisPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleChange = (field: string, value: string) => {
    setForm((prev: any) => {
      const updates: any = { ...prev, [field]: value };

      if (field === 'matricula') {
        const inferido = extrairPortoDeMatricula(value);
        if (inferido && (!String(prev?.portoRegisto || '').trim() || prev?.portoRegisto === 'N/a')) {
          updates.portoRegisto = inferido;
        }
      }

      if (field === 'estadoNavio' && value !== 'naufragado') {
        updates.dataEstado = '';
      }

      return updates;
    });
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const portoInferido = extrairPortoDeMatricula(String(form.matricula || ""));
    const payload = {
      nome: String(form.nome || "").trim(),
      matricula: String(form.matricula || "").trim(),
      ilha: String(form.ilha || "").trim(),
      portoRegisto: String(form.portoRegisto || "").trim() || (portoInferido || ""),
      tipoPesca: String(form.tipoPesca || "").trim(),
      tipoNavio: String(form.tipoNavio || "").trim(),
      comprimentoMetros: String(form.comprimentoMetros ?? '').trim(),
      anoConstrucao: String(form.anoConstrucao ?? '').trim(),
      potenciaMotorKw: String(form.potenciaMotorKw ?? '').trim(),
      lotacao: String(form.lotacao ?? '').trim(),
      estadoNavio: String(form.estadoNavio ?? '').trim(),
      dataEstado: String(form.estadoNavio ?? '').trim() === 'naufragado' ? String(form.dataEstado ?? '').trim() : '',
      zonaNavegacao: String(form.zonaNavegacao ?? '').trim() || null,
      pirotecnicosBordoJson: serializePirotecnicos(pirotecnicos),
      proprietario: String(form.proprietario || "").trim(),
      bandeira: String(form.bandeira || "Portugal").trim(),
      mmsi: String(form.mmsi || "").trim(),
      imo: String(form.imo || "").trim(),
      callSignal: String(form.callSignal || "").trim(),
      cfr: String(form.cfr || "").trim(),
      lat: String(form.lat || "").trim(),
      lng: String(form.lng || "").trim(),
    };

    const response = await fetch(`/api/navios/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(err?.details || err?.error || "Não foi possível guardar os dados do navio.");
      setSaving(false);
      return;
    }

    const updated = await response.json();
    setData(updated);
    setForm(updated);
    setPirotecnicos(parsePirotecnicos(updated?.pirotecnicosBordoJson));
    setEdit(false);
    setSaving(false);
    router.refresh();
  };

  const handleAddPirotecnico = () => {
    setPirotecnicos((prev) => [...prev, buildPirotecnicoItem({ quantity: '' })]);
    setEdit(true);
  };

  const handleAplicarSugestaoPirotecnia = () => {
    if (!piroSugestoes.length) return;
    setPirotecnicos((prev) => {
      const existentes = new Set(prev.map((p) => p.item.trim()));
      const novas = piroSugestoes
        .filter((s) => !existentes.has(s.item))
        .map((s) => buildPirotecnicoItem({ item: s.item, quantity: s.quantity }));
      return [...prev, ...novas];
    });
    setEdit(true);
  };

  const handlePirotecnicoChange = (id: string, field: keyof PirotecnicoBordoItem, value: string) => {
    setPirotecnicos((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleRemovePirotecnico = (id: string) => {
    setPirotecnicos((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCriarAssociarJangada = async () => {
    if (!newJangada.serial || !data?.id) return;
    setAssociating(true);
    try {
      const response = await fetch('/api/jangadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serial: newJangada.serial,
          brand: newJangada.brand,
          model: newJangada.model,
          shipId: data.id 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        alert('Erro ao criar jangada: ' + (errorData?.error || 'Erro desconhecido.'));
        return;
      }

      setNewJangada({ serial: '', brand: '', model: '' });
      await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    } catch (err: any) {
      alert('Erro de rede: ' + err.message);
    } finally {
      setAssociating(false);
    }
  };

  const handleAssociarJangada = async () => {
    if (!selectedJangadaId || !data?.id) return;

    const selected = allJangadas.find((j: any) => Number(j.id) === Number(selectedJangadaId));
    const selectedShipId = selected?.shipId ? Number(selected.shipId) : null;
    if (selectedShipId && selectedShipId !== Number(data.id)) {
      const serial = String(selected?.serial || selected?.id || selectedJangadaId);
      const confirmed = window.confirm(`A jangada ${serial} já está associada ao navio #${selectedShipId}. Pretende reassociar para este navio?`);
      if (!confirmed) return;
    }

    setAssociating(true);
    try {
      const response = await fetch(`/api/jangadas/${selectedJangadaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipId: Number(data.id) }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = typeof errorData?.error === 'string' ? errorData.error : response.statusText;
        alert('Erro ao associar a jangada: ' + msg);
        setAssociating(false);
        return;
      }

      setSelectedJangadaId('');
      await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    } catch (err: any) {
      alert('Erro de rede ao associar a jangada: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setAssociating(false);
    }
  };
    // duplicate block removed

  const handleDesassociarJangada = async (jangadaId: number) => {
    setAssociating(true);
    const response = await fetch(`/api/jangadas/${jangadaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: null }),
    });

    if (!response.ok) {
      alert('Não foi possível desassociar a jangada.');
      setAssociating(false);
      return;
    }

    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    setAssociating(false);
  };

  const handleAssociarColete = async () => {
    if (!selectedColeteId || !data?.id) return;

    const selected = allColetes.find((c: any) => String(c.id) === String(selectedColeteId));
    if (selected?.shipId && selected.shipId !== data.id) {
      const confirmed = window.confirm(`O colete ${selected.serial || selected.id} está associado ao navio #${selected.shipId}. Pretende reassociar para este navio?`);
      if (!confirmed) return;
    }

    setAssociating(true);
    const response = await fetch(`/api/coletes/${selectedColeteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: data.id }),
    });

    if (!response.ok) {
      alert('Não foi possível associar o colete.');
      setAssociating(false);
      return;
    }

    setSelectedColeteId('');
    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    setAssociating(false);
  };

  const handleDesassociarColete = async (coleteId: number) => {
    setAssociating(true);
    const response = await fetch(`/api/coletes/${coleteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: null }),
    });

    if (!response.ok) {
      alert('Não foi possível desassociar o colete.');
      setAssociating(false);
      return;
    }

    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs(), loadFatosImersao()]);
    setAssociating(false);
  };

  const handleAssociarFatoImersao = async () => {
    if (!selectedFatoImersaoId || !data?.id) return;

    const selected = allFatosImersao.find((f: any) => String(f.id) === String(selectedFatoImersaoId));
    if (selected?.shipId && selected.shipId !== data.id) {
      const confirmed = window.confirm(`O fato ${selected.serial || selected.id} está associado ao navio #${selected.shipId}. Pretende reassociar para este navio?`);
      if (!confirmed) return;
    }

    setAssociating(true);
    const response = await fetch(`/api/fatos-imersao/${selectedFatoImersaoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: data.id }),
    });

    if (!response.ok) {
      alert('Não foi possível associar o fato de imersão.');
      setAssociating(false);
      return;
    }

    setSelectedFatoImersaoId('');
    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs(), loadFatosImersao()]);
    setAssociating(false);
  };

  const handleDesassociarFatoImersao = async (fatoId: number) => {
    setAssociating(true);
    const response = await fetch(`/api/fatos-imersao/${fatoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: null }),
    });

    if (!response.ok) {
      alert('Não foi possível desassociar o fato de imersão.');
      setAssociating(false);
      return;
    }

    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs(), loadFatosImersao()]);
    setAssociating(false);  };

  const handleAssociarExtintor = async () => {
    if (!selectedExtintorId || !data?.id) return;

    const selected = allExtintores.find((e: any) => String(e.id) === String(selectedExtintorId));
    if (selected?.shipId && selected.shipId !== data.id) {
      const confirmed = window.confirm(`O extintor ${selected.serial || selected.id} está associado ao navio #${selected.shipId}. Pretende reassociar para este navio?`);
      if (!confirmed) return;
    }

    setAssociating(true);
    const response = await fetch(`/api/extintores/${selectedExtintorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: data.id }),
    });

    if (!response.ok) {
      alert('Não foi possível associar o extintor.');
      setAssociating(false);
      return;
    }

    setSelectedExtintorId('');
    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs(), loadFatosImersao(), loadExtintores()]);
    setAssociating(false);
  };

  const handleDesassociarExtintor = async (extintorId: number) => {
    setAssociating(true);
    const response = await fetch(`/api/extintores/${extintorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: null }),
    });

    if (!response.ok) {
      alert('Não foi possível desassociar o extintor.');
      setAssociating(false);
      return;
    }

    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs(), loadFatosImersao(), loadExtintores()]);
    setAssociating(false);
  };

  const handleGerarCertificadoColetes = async () => {
    if (!id || !data?.coletes?.length) return;

    setGeneratingColeteCertificate(true);
    try {
      const response = await fetch(`/api/navios/${encodeURIComponent(id)}/certificado-coletes`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Não foi possível gerar o certificado DOCX dos coletes.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `certificado-coletes-navio-${id}.docx`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      alert(error?.message || 'Não foi possível gerar o certificado DOCX dos coletes.');
    } finally {
      setGeneratingColeteCertificate(false);
    }
  };

  const handleGerarFichaVerificacaoColetes = async () => {
    if (!id || !data?.coletes?.length) return;

    setGeneratingColeteVerificationSheet(true);
    try {
      const response = await fetch(`/api/navios/${encodeURIComponent(id)}/ficha-verificacao-coletes`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Não foi possível gerar a ficha de verificação XLSX dos coletes.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `ficha-verificacao-coletes-navio-${id}.xlsx`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      alert(error?.message || 'Não foi possível gerar a ficha de verificação XLSX dos coletes.');
    } finally {
      setGeneratingColeteVerificationSheet(false);
    }
  };

  const handleAssociarEpirb = async () => {
    if (!selectedEpirbId || !data?.id) return;

    const selected = allEpirbs.find((e: any) => String(e.id) === String(selectedEpirbId));
    if (selected?.shipId && selected.shipId !== data.id) {
      const confirmed = window.confirm(`O EPIRB ${selected.serial || selected.id} está associado ao navio #${selected.shipId}. Pretende reassociar para este navio?`);
      if (!confirmed) return;
    }

    setAssociating(true);
    const response = await fetch(`/api/epirbs/${selectedEpirbId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: data.id }),
    });

    if (!response.ok) {
      alert('Não foi possível associar o EPIRB.');
      setAssociating(false);
      return;
    }

    setSelectedEpirbId('');
    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    setAssociating(false);
  };

  const handleDesassociarEpirb = async (epirbId: number) => {
    setAssociating(true);
    const response = await fetch(`/api/epirbs/${epirbId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId: null }),
    });

    if (!response.ok) {
      alert('Não foi possível desassociar o EPIRB.');
      setAssociating(false);
      return;
    }

    await Promise.all([loadNavio(), loadJangadas(), loadColetes(), loadEpirbs()]);
    setAssociating(false);
  };

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const smartDossierSummary = data?.dossier?.summary || {};
  const smartExpiredCount = Number(smartDossierSummary.expiredCount ?? 0);
  const smartExpiring30Count = Number(smartDossierSummary.expiring30Count ?? 0);
  const smartServiceOrderOpenCount = Number(smartDossierSummary.serviceOrderOpenCount ?? 0);
  const smartDocumentCount = Number(smartDossierSummary.documentCount ?? 0);
  const smartTimelineCount = Array.isArray(data?.dossier?.timeline) ? data.dossier.timeline.length : 0;
  const smartTotalAssets = Number(
    smartDossierSummary.totalAssets
      ?? ((data?.jangadas?.length || 0) + (data?.coletes?.length || 0) + (data?.epirbs?.length || 0))
  );
  const smartTipoCategoria = normalizeNavioTipoCategoria(data?.tipoPesca, data?.matricula, data?.tipoNavio);
  const smartPescaCosteiraMandatoryProfile = smartTipoCategoria === 'Pesca Costeira'
    ? getPescaCosteiraMandatoryEquipmentProfile(data?.comprimentoMetros)
    : null;
  const smartRecreioMandatoryProfile = smartTipoCategoria === 'Náutica de Recreio'
    ? getRecreioMandatoryProfile(data?.zonaNavegacao)
    : null;
  const smartShowPescaCosteiraMandatoryTab = Boolean(smartPescaCosteiraMandatoryProfile);
  const smartShowRecreioMandatoryTab = Boolean(smartRecreioMandatoryProfile);
  const smartShowPescaCosteiraHint = smartTipoCategoria === 'Pesca Costeira' && !smartShowPescaCosteiraMandatoryTab;
  const smartShowRecreioZonaHint = smartTipoCategoria === 'Náutica de Recreio' && !smartShowRecreioMandatoryTab;
  const smartPiroResumo = pirotecnicos.reduce(
    (acc, item) => {
      const status = getPirotecnicoStatus(item.validade);
      if (status.label === 'Expirado') acc.expired += 1;
      else if (status.label !== 'Válido' && status.label !== 'Sem validade') acc.expiring += 1;
      else if (status.label === 'Válido') acc.valid += 1;
      return acc;
    },
    { valid: 0, expiring: 0, expired: 0 }
  );
  const smartFocusStorageKey = getSmartFocusStorageKey(id);
  const smartFocusSignals: SmartFocusSignal[] = [
    ...(smartExpiredCount > 0 ? [{
      key: 'expired-deadlines',
      title: 'Resolver vencidos do dossiê',
      reason: `${smartExpiredCount} item(ns) já passaram do prazo e estão a puxar o navio para modo reativo.`,
      severity: 'critical' as const,
      score: 150 + smartExpiredCount * 12,
      actionLabel: 'Abrir documentos',
      sourceLabel: 'Dossiê',
      kind: 'critical' as const,
      target: { sectionId: 'section-dossier-docs' },
    }] : []),
    ...(smartPiroResumo.expired > 0 ? [{
      key: 'expired-pirotecnia',
      title: 'Regularizar pirotecnia expirada',
      reason: `${smartPiroResumo.expired} artigo(s) pirotécnico(s) já expiraram e afetam diretamente a conformidade de bordo.`,
      severity: 'critical' as const,
      score: 145 + smartPiroResumo.expired * 10,
      actionLabel: 'Ir à pirotecnia',
      sourceLabel: 'Segurança de bordo',
      kind: 'critical' as const,
      target: { sectionId: 'section-pirotecnia' },
    }] : []),
    ...(smartShowPescaCosteiraHint ? [{
      key: 'missing-costeira-mandatory',
      title: 'Completar comprimento para ativar matriz obrigatória',
      reason: 'Sem comprimento registado, a app ainda não consegue abrir a matriz inteligente dos meios obrigatórios da pesca costeira.',
      severity: 'warning' as const,
      score: 132,
      actionLabel: 'Completar dados',
      sourceLabel: 'Compliance legal',
      kind: 'documents' as const,
      target: { sectionId: 'section-legal', legalTab: 'legal' as const },
    }] : []),
    ...(smartShowRecreioZonaHint ? [{
      key: 'missing-recreio-zone',
      title: 'Definir zona de navegação',
      reason: 'Sem zona de navegação, o cockpit não consegue recomendar a dotação obrigatória da náutica de recreio.',
      severity: 'warning' as const,
      score: 128,
      actionLabel: 'Afinar enquadramento',
      sourceLabel: 'Compliance legal',
      kind: 'documents' as const,
      target: { sectionId: 'section-legal', legalTab: 'legal' as const },
    }] : []),
    ...(smartExpiring30Count > 0 ? [{
      key: 'expiring-window',
      title: 'Fechar a janela dos próximos 30 dias',
      reason: `${smartExpiring30Count} item(ns) entram na zona curta onde ainda dá para agir sem corrida de última hora.`,
      severity: 'warning' as const,
      score: 118 + smartExpiring30Count * 6,
      actionLabel: 'Abrir timeline',
      sourceLabel: 'Planeamento',
      kind: 'attention' as const,
      target: { sectionId: 'section-dossier-timeline' },
    }] : []),
    ...(smartServiceOrderOpenCount > 0 ? [{
      key: 'service-orders-open',
      title: 'Desbloquear ordens de serviço abertas',
      reason: `${smartServiceOrderOpenCount} ordem(ns) em aberto continuam a travar a cadência operacional.`,
      severity: 'attention' as const,
      score: 104 + smartServiceOrderOpenCount * 5,
      actionLabel: 'Ir para OS',
      sourceLabel: 'Operação',
      kind: 'attention' as const,
      target: { href: '/ordens-servico' },
    }] : []),
    ...(smartDocumentCount === 0 ? [{
      key: 'missing-documents',
      title: 'Começar a consolidar documentos',
      reason: 'Sem certificados nem evidências agregadas, qualquer validação futura começa do zero.',
      severity: 'attention' as const,
      score: 100,
      actionLabel: 'Abrir documentos',
      sourceLabel: 'Documentação',
      kind: 'documents' as const,
      target: { sectionId: 'section-dossier-docs' },
    }] : []),
    ...(smartTotalAssets === 0 ? [{
      key: 'missing-assets',
      title: 'Associar equipamentos principais',
      reason: 'Sem jangadas, coletes ou EPIRBs ligados, o navio perde contexto operacional e previsibilidade.',
      severity: 'attention' as const,
      score: 96,
      actionLabel: 'Associar ativos',
      sourceLabel: 'Cobertura operacional',
      kind: 'coverage' as const,
      target: { sectionId: 'section-jangadas' },
    }] : []),
    ...(smartPiroResumo.expiring > 0 ? [{
      key: 'expiring-pirotecnia',
      title: 'Planear renovação da pirotecnia',
      reason: `${smartPiroResumo.expiring} artigo(s) pirotécnico(s) entram em breve na zona amarela e merecem reposição preventiva.`,
      severity: 'attention' as const,
      score: 90 + smartPiroResumo.expiring * 4,
      actionLabel: 'Ver pirotecnia',
      sourceLabel: 'Segurança de bordo',
      kind: 'attention' as const,
      target: { sectionId: 'section-pirotecnia' },
    }] : []),
    ...(smartTimelineCount === 0 && data?.id ? [{
      key: 'missing-timeline',
      title: 'Construir histórico operacional',
      reason: 'Ainda não existe histórico suficiente para a aplicação aprender padrões deste navio.',
      severity: 'ok' as const,
      score: 60,
      actionLabel: 'Ver histórico',
      sourceLabel: 'Aprendizagem operacional',
      kind: 'coverage' as const,
      target: { sectionId: 'section-history' },
    }] : []),
  ].sort(compareSmartFocusSignals);
  const rememberedSmartFocusMatch = rememberedSmartFocus
    ? smartFocusSignals.find((signal) => signal.key === rememberedSmartFocus.key) || null
    : null;
  const smartFocusPreferredTarget = rememberedSmartFocusMatch || smartFocusSignals[0] || null;
  const smartFocusPreferredKey = smartFocusPreferredTarget?.key || null;
  const smartFocusIsRemembered = Boolean(rememberedSmartFocusMatch && smartFocusPreferredTarget?.key === rememberedSmartFocusMatch.key);

  const navigateToSmartFocusTarget = (target: SmartFocusTarget) => {
    if (target.legalTab) {
      setLegalTab(target.legalTab);
    }

    if (target.href) {
      router.push(target.href);
      return;
    }

    if (target.sectionId) {
      if (['section-dossier-overview', 'section-dossier-timeline', 'section-dossier-docs'].includes(target.sectionId)) {
        setActiveTab('dossier');
      } else if (['section-jangadas', 'section-coletes', 'section-epirbs', 'section-pirotecnia'].includes(target.sectionId)) {
        setActiveTab('equipment');
      } else if (['section-info', 'section-legal'].includes(target.sectionId)) {
        setActiveTab('technical');
      } else if (['section-history'].includes(target.sectionId)) {
        setActiveTab('inspections');
      }
      window.setTimeout(() => scrollToSection(target.sectionId!), 100);
    }
  };

  useEffect(() => {
    if (!smartFocusStorageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(smartFocusStorageKey);
      if (!raw) {
        setRememberedSmartFocus(null);
        return;
      }
      const parsed = JSON.parse(raw) as StoredSmartFocus;
      if (parsed?.key) {
        setRememberedSmartFocus(parsed);
      }
    } catch {
      setRememberedSmartFocus(null);
    }
  }, [smartFocusStorageKey]);

  useEffect(() => {
    if (!smartFocusStorageKey || !smartFocusPreferredTarget || !smartFocusPreferredKey || typeof window === 'undefined') return;
    if (rememberedSmartFocus?.key === smartFocusPreferredKey) return;

    const stored: StoredSmartFocus = {
      key: smartFocusPreferredKey,
      updatedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(smartFocusStorageKey, JSON.stringify(stored));
    setRememberedSmartFocus(stored);
  }, [rememberedSmartFocus?.key, smartFocusPreferredKey, smartFocusPreferredTarget, smartFocusStorageKey]);

  useEffect(() => {
    if (!isClient || loading || !data || !smartFocusPreferredTarget || smartFocusAutoAppliedRef.current) return;
    smartFocusAutoAppliedRef.current = true;
    navigateToSmartFocusTarget(smartFocusPreferredTarget.target);
  }, [data, isClient, loading, smartFocusPreferredTarget]);

  const handleDownloadSafetyPack = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/navios/${id}/safety-pack`);
      if (!res.ok) throw new Error("Erro ao gerar pack de segurança");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safety_Pack_${data?.nome || id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || "Erro ao descarregar pack de segurança.");
    }
  };

  if (!isClient || loading) return <div className="p-8">A carregar...</div>;
  if (loadError) return <div className="p-8 text-red-600">{loadError}</div>;
  if (!data) return <div className="p-8 text-red-600">Navio não encontrado.</div>;

  const jangadasListaGeral = allJangadas
    .sort((a: any, b: any) => String(a?.serial || '').localeCompare(String(b?.serial || ''), 'pt-PT'));
  const jangadasFiltradas = jangadasListaGeral.filter((j: any) => {
    const text = `${j?.serial || ''} ${j?.brand || ''} ${j?.model || ''}`.toLowerCase();
    return text.includes(jangadaSearch.toLowerCase());
  });

  const coletesListaGeral = allColetes
    .sort((a: any, b: any) => String(a?.serial || '').localeCompare(String(b?.serial || ''), 'pt-PT'));
  const coletesFiltrados = coletesListaGeral.filter((c: any) => {
    const text = `${c?.serial || ''} ${c?.marca || ''} ${c?.modelo || ''}`.toLowerCase();
    return text.includes(coleteSearch.toLowerCase());
  });

  const epirbsListaGeral = allEpirbs
    .sort((a: any, b: any) => String(a?.serial || '').localeCompare(String(b?.serial || ''), 'pt-PT'));
  const epirbsFiltrados = epirbsListaGeral.filter((e: any) => {
    const text = `${e?.serial || ''} ${e?.marca || ''} ${e?.modelo || ''} ${e?.hexId || ''}`.toLowerCase();
    return text.includes(epirbSearch.toLowerCase());
  });

  const fatosImersaoListaGeral = allFatosImersao
    .sort((a: any, b: any) => String(a?.serial || '').localeCompare(String(b?.serial || ''), 'pt-PT'));
  const fatosImersaoFiltrados = fatosImersaoListaGeral.filter((f: any) => {
    const text = `${f?.serial || ''} ${f?.marca || ''} ${f?.modelo || ''} ${f?.tipo || ''}`.toLowerCase();
    return text.includes(fatoImersaoSearch.toLowerCase());
  });

  const extintoresListaGeral = allExtintores
    .sort((a: any, b: any) => String(a?.serial || '').localeCompare(String(b?.serial || ''), 'pt-PT'));
  const extintoresFiltrados = extintoresListaGeral.filter((e: any) => {
    const text = `${e?.serial || ''} ${e?.marca || ''} ${e?.modelo || ''} ${e?.tipoAgente || ''}`.toLowerCase();
    return text.includes(extintorSearch.toLowerCase());
  });

  const locationValue = getNavioLocationLabel(data);
  const tipoCategoria = normalizeNavioTipoCategoria(data.tipoPesca, data.matricula, data.tipoNavio);
  const proprietarioDisplay = String(data.proprietario || "").trim() || String(data.cliente?.nome || "").trim() || "-";
  const lastAisLatitude = formatCoordinate(data.lat, "lat");
  const lastAisLongitude = formatCoordinate(data.lng, "lng");
  const hasLastAisLocation = lastAisLatitude !== "—" || lastAisLongitude !== "—";
  const legalProfile = getNavioLegalProfile(data.tipoPesca, data.tipoNavio, data.matricula);
  const pescaCosteiraMandatoryProfile = tipoCategoria === 'Pesca Costeira'
    ? getPescaCosteiraMandatoryEquipmentProfile(data.comprimentoMetros)
    : null;
  const showPescaCosteiraMandatoryTab = Boolean(pescaCosteiraMandatoryProfile);
  const showPescaCosteiraHint = tipoCategoria === 'Pesca Costeira' && !showPescaCosteiraMandatoryTab;
  const recreioMandatoryProfile = tipoCategoria === 'Náutica de Recreio'
    ? getRecreioMandatoryProfile(data.zonaNavegacao)
    : null;
  const showRecreioMandatoryTab = Boolean(recreioMandatoryProfile);
  const showRecreioZonaHint = tipoCategoria === 'Náutica de Recreio' && !showRecreioMandatoryTab;
  const piroSugestoes = getPirotecniaSugestoes(data?.tipoPesca, data?.tipoNavio, data?.comprimentoMetros);
  const piroResumo = pirotecnicos.reduce(
    (acc, item) => {
      const status = getPirotecnicoStatus(item.validade);
      if (status.label === 'Expirado') acc.expired += 1;
      else if (status.label !== 'Válido' && status.label !== 'Sem validade') acc.expiring += 1;
      else if (status.label === 'Válido') acc.valid += 1;
      return acc;
    },
    { valid: 0, expiring: 0, expired: 0 }
  );
  const dossier = data.dossier || { summary: {}, timeline: [], documents: [], deadlines: [] };
  const dossierSummary = dossier.summary || {};
  const totalJangadas = dossierSummary.totalJangadas ?? (data.jangadas?.length || 0);
  const totalColetes = dossierSummary.totalColetes ?? (data.coletes?.length || 0);
  const totalEpirbs = dossierSummary.totalEpirbs ?? (data.epirbs?.length || 0);
  const expiredCount = Number(dossierSummary.expiredCount ?? 0);
  const expiring30Count = Number(dossierSummary.expiring30Count ?? 0);
  const serviceOrderOpenCount = Number(dossierSummary.serviceOrderOpenCount ?? 0);
  const totalAssets = Number(dossierSummary.totalAssets ?? ((data.jangadas?.length || 0) + (data.coletes?.length || 0) + (data.epirbs?.length || 0)));
  const certificateCount = Number(dossierSummary.certificateCount ?? 0);
  const evidenceCount = Number(dossierSummary.evidenceCount ?? 0);
  const documentCount = Number(dossierSummary.documentCount ?? 0);
  const healthScore = clamp(
    Number.isFinite(Number(dossierSummary.healthScore))
      ? Number(dossierSummary.healthScore)
      : 100
        - expiredCount * 18
        - expiring30Count * 7
        - serviceOrderOpenCount * 6
        - (totalAssets === 0 ? 12 : 0)
        - (documentCount === 0 ? 6 : 0),
    0,
    100
  );
  const healthScoreTone = getHealthScoreTone(healthScore);
  const healthStrokeOffset = 282.743 - (282.743 * healthScore) / 100;
  const healthBreakdown = [
    {
      label: 'Vencidos',
      value: expiredCount,
      kind: 'critical' as const,
      hint: expiredCount > 0 ? 'Prazos vencidos ou fora de conformidade.' : 'Sem vencidos neste momento.',
    },
    {
      label: 'Atenção ≤ 30d',
      value: expiring30Count,
      kind: 'attention' as const,
      hint: expiring30Count > 0 ? 'Itens a rebentar a janela curta.' : 'Sem vencimentos imediatos.',
    },
    {
      label: 'Documentação',
      value: documentCount,
      kind: 'documents' as const,
      hint: `${certificateCount} certificados · ${evidenceCount} evidências`,
    },
    {
      label: 'Cobertura ativos',
      value: totalAssets,
      kind: 'coverage' as const,
      hint: `${totalJangadas} jangadas · ${totalColetes} coletes · ${totalEpirbs} EPIRBs`,
    },
  ];
  const operationalSpotlightCardsBase: Array<{
    title: string;
    value: string;
    description: string;
    kind: 'critical' | 'attention' | 'documents' | 'coverage';
    priority: number;
  }> = [
    {
      title: 'Pulso operacional',
      value: `${healthScore}/100`,
      description: healthScore >= 85
        ? 'O dossiê está coeso e com bom ritmo operacional.'
        : healthScore >= 65
          ? 'Há alguns pontos a pedir afinação antes de virar dor de cabeça.'
          : 'Convém atuar já para recuperar controlo operacional.',
      kind: healthScore >= 85 ? 'coverage' : healthScore >= 65 ? 'attention' : 'critical',
      priority: 100 - healthScore,
    },
    {
      title: 'Foco imediato',
      value: expiredCount > 0 ? `${expiredCount} vencido(s)` : expiring30Count > 0 ? `${expiring30Count} a vencer` : 'Sem urgências',
      description: expiredCount > 0
        ? 'Priorizar dossiês vencidos antes de novos agendamentos.'
        : expiring30Count > 0
          ? 'Boa janela para fechar preventivamente os próximos 30 dias.'
          : 'Espaço para trabalho preventivo e limpeza fina.',
      kind: expiredCount > 0 ? 'critical' : expiring30Count > 0 ? 'attention' : 'coverage',
      priority: smartFocusSignals[0] ? getSmartUrgencyWeight(smartFocusSignals[0].severity) + smartFocusSignals[0].score : 0,
    },
    {
      title: 'Carga documental',
      value: `${documentCount} item(ns)`,
      description: documentCount > 0
        ? 'A documentação agregada já permite leitura transversal do navio.'
        : 'Vale a pena começar a consolidar certificados e evidências.',
      kind: documentCount > 0 ? 'documents' : 'attention',
      priority: documentCount === 0 ? 260 : Math.max(60, 220 - documentCount * 8),
    },
  ];
  const operationalSpotlightCards = [...operationalSpotlightCardsBase].sort((a, b) => b.priority - a.priority);
  const nextFocusActions = smartFocusSignals.slice(0, 4).map((signal) => ({
    title: signal.title,
    detail: signal.reason,
    cta: signal.actionLabel,
    severity: signal.severity,
    sourceLabel: signal.sourceLabel,
    isRemembered: smartFocusIsRemembered && smartFocusPreferredTarget?.key === signal.key,
    onClick: () => navigateToSmartFocusTarget(signal.target),
  }));
  const dossierCategoryScores = [
    {
      label: 'Operação',
      score: clamp(100 - expiredCount * 24 - expiring30Count * 10 - serviceOrderOpenCount * 8, 0, 100),
      detail: 'Prazos vencidos, janela de 30 dias e ordens em aberto.',
    },
    {
      label: 'Documentação',
      score: clamp(100 - (documentCount === 0 ? 40 : 0) - Math.max(0, 2 - certificateCount) * 12 - Math.max(0, 2 - evidenceCount) * 8, 0, 100),
      detail: `${certificateCount} certificados · ${evidenceCount} evidências`,
    },
    {
      label: 'Cobertura',
      score: clamp(100 - (totalAssets === 0 ? 55 : 0) - Math.max(0, 3 - totalAssets) * 10, 0, 100),
      detail: `${totalAssets} ativo(s) ligados ao ecossistema do navio.`,
    },
    {
      label: 'Cadência',
      score: clamp(100 - serviceOrderOpenCount * 14 - expiredCount * 6 - ((Array.isArray(dossier.timeline) ? dossier.timeline.length : 0) === 0 ? 18 : 0), 0, 100),
      detail: 'Ritmo operacional, histórico recente e capacidade de fecho.',
    },
  ];
  const predictiveAlerts = smartFocusSignals.slice(0, 4).map((signal) => ({
    title: signal.title,
    detail: signal.reason,
    cta: signal.actionLabel,
    onClick: () => navigateToSmartFocusTarget(signal.target),
    kind: signal.kind,
    severity: signal.severity,
    sourceLabel: signal.sourceLabel,
    isRemembered: smartFocusIsRemembered && smartFocusPreferredTarget?.key === signal.key,
  }));
  const summaryCards = [
    {
      label: 'Ativos associados',
      value: totalAssets,
      helper: `${totalJangadas} jangadas · ${totalColetes} coletes · ${totalEpirbs} EPIRBs`,
      tone: 'from-slate-50 to-white border-slate-200 text-slate-900',
    },
    {
      label: 'Vencidos',
      value: expiredCount,
      helper: `${expiring30Count} a expirar nos próximos 30 dias`,
      tone: 'from-red-50 to-white border-red-200 text-red-900',
    },
    {
      label: 'Documentos',
      value: documentCount,
      helper: `${certificateCount} certificados · ${evidenceCount} evidências`,
      tone: 'from-violet-50 to-white border-violet-200 text-violet-900',
    },
    {
      label: 'Ordens em aberto',
      value: serviceOrderOpenCount,
      helper: dossierSummary.lastInspectionAt ? `Última inspeção: ${formatDateLabel(dossierSummary.lastInspectionAt)}` : 'Sem inspeção recente registada',
      tone: 'from-amber-50 to-white border-amber-200 text-amber-900',
    },
  ];


  const quickActions = [
    {
      label: edit ? 'Continuar edição' : 'Editar ficha',
      helper: 'Atualizar dados base e conformidade do navio.',
      onClick: () => {
        if (!edit) setEdit(true);
        scrollToSection('section-info');
      },
      tone: 'border border-cyan-300 bg-cyan-300 hover:bg-cyan-200 text-slate-950',
      helperTone: 'text-slate-800/80',
    },
    {
      label: 'Ver timeline',
      helper: 'Abrir histórico unificado do navio e equipamentos.',
      onClick: () => scrollToSection('section-dossier-timeline'),
      tone: 'border border-white/70 bg-white/95 hover:bg-white text-slate-900',
      helperTone: 'text-slate-600',
    },
    {
      label: 'Abrir documentos',
      helper: 'Certificados ativos e evidências fotográficas.',
      onClick: () => scrollToSection('section-dossier-docs'),
      tone: 'border border-white/70 bg-white/95 hover:bg-white text-slate-900',
      helperTone: 'text-slate-600',
    },
    {
      label: 'Associar equipamento',
      helper: 'Ir diretamente às secções de jangadas, coletes e EPIRBs.',
      onClick: () => scrollToSection('section-jangadas'),
      tone: 'border border-white/70 bg-white/95 hover:bg-white text-slate-900',
      helperTone: 'text-slate-600',
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8" suppressHydrationWarning>
      {/* Header sofisticado */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight flex items-center gap-3">
            <span className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-lg shadow-sm">Navio</span>
            {data.nome}
            {data.ativo === false && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">Inativo</span>
            )}
          </h1>
          <div className="mt-2 flex flex-wrap gap-3 text-gray-600 text-sm">
            <span className="inline-flex items-center gap-1"><svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4zm0 7l9 4 9-4" /></svg> Matrícula: <b>{data.matricula || '-'}</b></span>
            <span className="inline-flex items-center gap-1"><svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg> {LOCATION_LABEL}: <b>{locationValue}</b></span>
            <span className="inline-flex items-center gap-1"><svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3" /></svg> Tipo: <b>{tipoCategoria}{data.tipoNavio ? ` · ${data.tipoNavio}` : ''}</b></span>
            {data.cliente && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Cliente: <b className="text-indigo-900 font-semibold">{data.cliente.nome}</b>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href={`/navios/${id}/dossier`} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Dossier Premium
          </a>
          <a href={`/navios/${id}/auditoria`} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            Auditoria de Cais
          </a>
          <button
            onClick={handleDownloadSafetyPack}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Pack de Segurança (ZIP)
          </button>
          <a href="/agenda" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            Agenda e Vistorias
          </a>
          <a href='/navios' className="text-blue-600 hover:text-blue-800 underline text-sm font-medium">Voltar para a Lista</a>
        </div>
      </div>

      {/* Separadores / Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab('dossier')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200 -mb-px border-b-2 ${
            activeTab === 'dossier'
              ? 'bg-blue-50/50 text-blue-600 border-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Dossiê 360º
        </button>
        <button
          onClick={() => setActiveTab('equipment')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200 -mb-px border-b-2 ${
            activeTab === 'equipment'
              ? 'bg-blue-50/50 text-blue-600 border-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          Equipamentos
          <span className="inline-flex items-center justify-center px-2 py-0.5 ml-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
            {(data.jangadas?.length || 0) + (data.coletes?.length || 0) + (data.epirbs?.length || 0) + pirotecnicos.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('technical')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200 -mb-px border-b-2 ${
            activeTab === 'technical'
              ? 'bg-blue-50/50 text-blue-600 border-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Ficha Técnica
        </button>
        <button
          onClick={() => setActiveTab('inspections')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200 -mb-px border-b-2 ${
            activeTab === 'inspections'
              ? 'bg-blue-50/50 text-blue-600 border-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Inspeções
          <span className="inline-flex items-center justify-center px-2 py-0.5 ml-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
            {data.inspecoes?.length || 0}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('mapa')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200 -mb-px border-b-2 ${
            activeTab === 'mapa'
              ? 'bg-blue-50/50 text-blue-600 border-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Mapa AIS
        </button>
      </div>

      {activeTab === 'dossier' && (
        <section className="space-y-6" id="section-dossier-overview">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getSeverityClasses(dossierSummary.healthStatus)}`}>
                  {dossierSummary.healthLabel || 'Estado operacional'}
                </span>
                {dossierSummary.lastActivityAt ? (
                  <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-100">
                    Última atividade: {formatDateLabel(dossierSummary.lastActivityAt, { includeTime: true })}
                  </span>
                ) : null}
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Resumo 360º do navio</h2>
                <p className="mt-2 text-sm text-slate-200">
                  Vista operacional única com risco, documentação, inspeções e equipamentos associados. Um mini centro de comando — sem precisar de binóculos digitais.
                </p>
              </div>

              {smartFocusPreferredTarget ? (
                <div className="rounded-2xl border border-white/40 bg-white/95 px-4 py-4 text-slate-900 shadow-lg">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <span>Próximo foco recomendado</span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSmartFocusBadge(smartFocusPreferredTarget.severity)}`}>
                      {smartFocusIsRemembered ? 'Retomar' : 'Agora'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{smartFocusPreferredTarget.title}</div>
                      <div className="text-sm text-slate-600">{smartFocusPreferredTarget.sourceLabel}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-700">{smartFocusPreferredTarget.reason}</div>
                  <button
                    type="button"
                    onClick={() => navigateToSmartFocusTarget(smartFocusPreferredTarget.target)}
                    className="mt-3 inline-flex text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
                  >
                    {smartFocusPreferredTarget.actionLabel}
                  </button>
                </div>
              ) : dossierSummary.nextDeadline ? (
                <div className="rounded-2xl border border-white/40 bg-white/95 px-4 py-4 text-slate-900 shadow-lg">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Próximo ponto de ação</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{dossierSummary.nextDeadline.title}</div>
                      <div className="text-sm text-slate-600">{dossierSummary.nextDeadline.entityLabel} · {dossierSummary.nextDeadline.source}</div>
                    </div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getSeverityClasses(dossierSummary.nextDeadline.severity)}`}>
                      {formatDaysRemaining(dossierSummary.nextDeadline.daysRemaining)}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    Data alvo: <b>{formatDateLabel(dossierSummary.nextDeadline.date)}</b>
                  </div>
                  {dossierSummary.nextDeadline.href ? (
                    <Link href={dossierSummary.nextDeadline.href} className="mt-3 inline-flex text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800">
                      Abrir item relacionado
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/40 bg-white/95 px-4 py-4 text-sm text-slate-700 shadow-lg">
                  Sem vencimentos imediatos detetados neste momento. Aproveita a maré calma para fechar pendências preventivas.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[28rem]">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`rounded-2xl px-4 py-4 text-left text-sm shadow-sm transition ${action.tone}`}
                >
                  <div className="font-semibold">{action.label}</div>
                  <div className={`mt-1 text-xs ${action.helperTone || 'opacity-80'}`}>{action.helper}</div>
                </button>
              ))}
              <Link href="/agenda" className="rounded-2xl border border-white/70 bg-white/95 px-4 py-4 text-left text-sm text-slate-900 shadow-sm transition hover:bg-white">
                <div className="font-semibold">Abrir agenda</div>
                <div className="mt-1 text-xs text-slate-600">Planear inspeções, disponibilidade e carga da operação.</div>
              </Link>
              <Link href="/ordens-servico" className="rounded-2xl border border-white/70 bg-white/95 px-4 py-4 text-left text-sm text-slate-900 shadow-sm transition hover:bg-white">
                <div className="font-semibold">Ver ordens de serviço</div>
                <div className="mt-1 text-xs text-slate-600">Acompanhar trabalhos ligados ao navio e às jangadas.</div>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${card.tone}`}>
              <div className="text-xs uppercase tracking-wide text-current/70">{card.label}</div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight">{card.value}</div>
              <div className="mt-2 text-sm text-current/80">{card.helper}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.72fr_1.28fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Health score do dossiê</h3>
                <p className="mt-1 text-sm text-slate-600">Leitura rápida do estado operacional agregado deste navio.</p>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${healthScoreTone.badge}`}>
                {healthScoreTone.label}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="relative mx-auto h-40 w-40 lg:mx-0">
                <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
                  <circle cx="60" cy="60" r="45" className="fill-none stroke-slate-200" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    className={`fill-none ${healthScoreTone.ring}`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="282.743"
                    strokeDashoffset={healthStrokeOffset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className={`text-4xl font-extrabold ${healthScoreTone.text}`}>{healthScore}</span>
                  <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">score</span>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                {healthBreakdown.map((item) => (
                  <div key={item.label} className={`rounded-2xl border p-4 ${getFocusCardTone(item.kind)}`}>
                    <div className="text-xs uppercase tracking-wide opacity-70">{item.label}</div>
                    <div className="mt-2 text-2xl font-bold">{item.value}</div>
                    <div className="mt-1 text-sm opacity-90">{item.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Radar premium do dossiê</h3>
                <p className="mt-1 text-sm text-slate-600">Três leituras rápidas para perceber onde o navio pede atenção primeiro.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                leitura instantânea
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {operationalSpotlightCards.map((card) => (
                <div key={card.title} className={`rounded-2xl border p-4 ${getFocusCardTone(card.kind)}`}>
                  <div className="text-xs uppercase tracking-wide opacity-70">{card.title}</div>
                  <div className="mt-2 text-2xl font-bold">{card.value}</div>
                  <div className="mt-2 text-sm opacity-90">{card.description}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Próximos focos</div>
              <div className="mt-3 space-y-3">
                {nextFocusActions.length > 0 ? nextFocusActions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{action.title}</div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getSmartFocusBadge(action.severity)}`}>
                          {action.isRemembered ? 'Retomar' : action.sourceLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{action.detail}</div>
                    </div>
                    <button
                      type="button"
                      onClick={action.onClick}
                      className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      {action.cta}
                    </button>
                  </div>
                )) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                    Sem focos quentes neste momento — boa altura para trabalho preventivo ou limpeza documental fina.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Scores por categoria</h3>
                <p className="mt-1 text-sm text-slate-600">O dossiê dividido em frentes que ajudam a perceber onde apertar primeiro.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">leitura tática</span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {dossierCategoryScores.map((item) => (
                <div key={item.label} className={`rounded-2xl border p-4 ${getCategoryScoreTone(item.score)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide opacity-70">{item.label}</div>
                      <div className="mt-2 text-3xl font-extrabold">{item.score}</div>
                    </div>
                    <span className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-semibold">/100</span>
                  </div>
                  <div className="mt-2 text-sm opacity-90">{item.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Alertas preditivos</h3>
                <p className="mt-1 text-sm text-slate-600">Sinais antecipados do que mais provavelmente vai escalar se nada for feito.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">antes da dor</span>
            </div>

            <div className="mt-5 space-y-3">
              {predictiveAlerts.length > 0 ? predictiveAlerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className={`rounded-2xl border p-4 ${getFocusCardTone(alert.kind)}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">{alert.title}</div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getSmartFocusBadge(alert.severity)}`}>
                          {alert.isRemembered ? 'Retomar' : alert.sourceLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs opacity-90">{alert.detail}</div>
                    </div>
                    <button
                      type="button"
                      onClick={alert.onClick}
                      className="inline-flex rounded-full border border-current/20 bg-white/70 px-3 py-1.5 text-xs font-semibold transition hover:bg-white"
                    >
                      {alert.cta}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                  Sem sinais de escalada imediata — o navio está com margem para trabalho preventivo e afinação documental.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section id="section-dossier-timeline" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Timeline unificada</h2>
                <p className="mt-1 text-sm text-slate-600">Inspeções, certificados, evidências, ordens de serviço e prazos numa só cadência.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {dossier.timeline?.length || 0} registos
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {dossier.timeline?.length ? dossier.timeline.map((item: any) => (
                <div key={item.id} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex min-w-[92px] flex-col items-start">
                    <div className="text-sm font-semibold text-slate-900">{formatDateLabel(item.date)}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateLabel(item.date, { includeTime: true }) !== formatDateLabel(item.date) ? formatDateLabel(item.date, { includeTime: true }).split(', ')[1] || '' : ''}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getKindClasses(item.kind)}`}>
                        {item.kind === 'ordem-servico' ? 'OS' : item.kind === 'deadline' ? 'Prazo' : item.kind === 'verification' ? 'Verificação' : item.kind === 'certificate' ? 'Certificado' : item.kind === 'inspection' ? 'Inspeção' : item.kind === 'evidence' ? 'Evidência' : item.kind}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSeverityClasses(item.severity)}`}>
                        {item.status || 'registado'}
                      </span>
                    </div>
                    <div className="mt-2 text-base font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{item.entityLabel}</span>
                      <span>•</span>
                      <span>{item.source}</span>
                    </div>
                    {item.href ? (
                      <Link href={item.href} className="mt-3 inline-flex text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
                        Abrir registo
                      </Link>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Ainda sem histórico consolidado disponível para este navio.
                </div>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section id="section-dossier-docs" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Documentos & certificados</h2>
                  <p className="mt-1 text-sm text-slate-600">Foco inicial em jangadas e coletes, com ligação direta à respetiva ficha.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {dossier.documents?.length || 0} itens
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {dossier.documents?.length ? dossier.documents.map((doc: any) => (
                  <div key={doc.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{doc.documentType}</span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSeverityClasses(doc.severity)}`}>
                            {doc.status}
                          </span>
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-900">{doc.title}</div>
                        <div className="mt-1 text-sm text-slate-600">{doc.entityLabel} · {doc.source}</div>
                        {doc.reference ? <div className="mt-1 text-xs text-slate-500">Ref.: {doc.reference}</div> : null}
                      </div>
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                          Abrir ficheiro
                        </a>
                      ) : (
                        <Link href={doc.href} className="inline-flex rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                          Abrir ficha
                        </Link>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
                      <div><span className="font-medium text-slate-700">Emitido:</span> {formatDateLabel(doc.issueDate)}</div>
                      <div><span className="font-medium text-slate-700">Validade:</span> {formatDateLabel(doc.expiryDate)}</div>
                      <div><span className="font-medium text-slate-700">Tamanho:</span> {formatFileSize(doc.size)}</div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Ainda não existem documentos agregados para este navio.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Próximos vencimentos</h2>
                <p className="mt-1 text-sm text-slate-600">Prioridade operacional para agir antes que a papelada e o material façam motim.</p>
              </div>

              <div className="mt-6 space-y-3">
                {dossier.deadlines?.length ? dossier.deadlines.map((deadline: any) => (
                  <div key={deadline.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{deadline.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{deadline.entityLabel} · {deadline.source}</div>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSeverityClasses(deadline.severity)}`}>
                        {formatDaysRemaining(deadline.daysRemaining)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">Data alvo: {formatDateLabel(deadline.date)}</div>
                    <Link href={deadline.href} className="mt-2 inline-flex text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
                      Abrir item
                    </Link>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Sem vencimentos monitorizados de momento.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
      )}

      {activeTab === 'technical' && (
        <div className="space-y-6">
          <div id="section-info" className="max-w-4xl mx-auto">
        {/* Card de informações do navio */}
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl shadow-lg p-8 border border-blue-100 flex flex-col gap-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4zm0 7l9 4 9-4" /></svg>
              Informações Gerais
            </h2>
            {!edit ? (
              <button
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-1 rounded text-sm shadow transition"
                onClick={() => setEdit(true)}
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-1 rounded text-sm shadow transition"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "A guardar..." : "Guardar"}
                </button>
                <button
                  className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-4 py-1 rounded text-sm shadow transition"
                  onClick={() => {
                    setEdit(false);
                    setForm(data || {});
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3 text-gray-700 text-lg">
            <div>
              <span className="font-semibold">Nome:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.nome || ""} onChange={(e) => handleChange("nome", e.target.value)} />
              ) : data.nome}
            </div>
            <div>
              <span className="font-semibold">Matrícula:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.matricula || ""} onChange={(e) => handleChange("matricula", e.target.value)} />
              ) : (data.matricula || '-')}
            </div>
            <div>
              <span className="font-semibold">Estado do navio:</span>{" "}
              {edit ? (
                <span className="inline-flex gap-2 ml-2">
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={form.estadoNavio || ''}
                    onChange={(e) => handleChange('estadoNavio', e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="abatido">Abatido</option>
                    <option value="naufragado">Naufragado</option>
                  </select>
                  {form.estadoNavio === 'naufragado' && (
                    <input
                      type="date"
                      className="border rounded px-2 py-1 text-sm"
                      value={form.dataEstado ? String(form.dataEstado).slice(0, 10) : ''}
                      onChange={(e) => handleChange('dataEstado', e.target.value)}
                      placeholder="Data"
                    />
                  )}
                </span>
              ) : (data.estadoNavio ? (() => {
                const estadoLabels: Record<string, { label: string; cls: string }> = {
                  ativo: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                  inativo: { label: 'Inativo', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
                  abatido: { label: 'Abatido', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
                  naufragado: { label: 'Naufragado', cls: 'bg-red-100 text-red-800 border-red-300' },
                };
                const estadoInfo = estadoLabels[String(data.estadoNavio).toLowerCase()] || { label: data.estadoNavio, cls: 'bg-gray-100 text-gray-800 border-gray-300' };
                return (
                  <span className={`ml-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoInfo.cls}`}>
                    {estadoInfo.label}
                    {data.dataEstado ? <span className="font-normal">· {formatDateLabel(data.dataEstado)}</span> : null}
                  </span>
                );
              })() : (
                <span className="ml-2 text-sm text-slate-500">Ativo</span>
              ))}
            </div>
            <div>
              <span className="font-semibold">{EDITABLE_LOCATION_LABEL}:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.ilha || ""} onChange={(e) => handleChange("ilha", e.target.value)} />
              ) : locationValue}
            </div>
            <div>
              <span className="font-semibold">Porto de Registo:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.portoRegisto || ""} onChange={(e) => handleChange("portoRegisto", e.target.value)} />
              ) : (data.portoRegisto || 'N/a')}
            </div>
            <div>
              <span className="font-semibold">Tipo de Pesca/Navio:</span>{" "}
              {edit ? (
                <span className="inline-flex gap-2 ml-2">
                  <input className="border rounded px-2 py-1 text-sm" value={form.tipoPesca || ""} onChange={(e) => handleChange("tipoPesca", e.target.value)} placeholder="Enquadramento legal" list="ficha-navio-tipo-pesca-opcoes" />
                  <input className="border rounded px-2 py-1 text-sm" value={form.tipoNavio || ""} onChange={(e) => handleChange("tipoNavio", e.target.value)} placeholder="Tipo de embarcação" list="ficha-navio-tipo-navio-opcoes" />
                </span>
              ) : `${tipoCategoria}${data.tipoNavio ? ` · ${data.tipoNavio}` : ''}`}
              <datalist id="ficha-navio-tipo-pesca-opcoes">
                {NAVIO_TIPO_PESCA_OPTIONS.map((tipo) => (
                  <option key={tipo} value={tipo} />
                ))}
              </datalist>
              <datalist id="ficha-navio-tipo-navio-opcoes">
                {NAVIO_TIPO_NAVIO_OPTIONS.map((tipo) => (
                  <option key={tipo} value={tipo} />
                ))}
              </datalist>
            </div>
            <div>
              <span className="font-semibold">Comprimento (m):</span>{" "}
              {edit ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="ml-2 border rounded px-2 py-1 text-sm"
                  value={String(form.comprimentoMetros ?? '')}
                  onChange={(e) => handleChange('comprimentoMetros', e.target.value)}
                  placeholder="Opcional"
                />
              ) : (data.comprimentoMetros ? `${data.comprimentoMetros} m` : '-')}
            </div>
            <div>
              <span className="font-semibold">Ano de construção:</span>{" "}
              {edit ? (
                <input
                  type="number"
                  min="1800"
                  max="2100"
                  step="1"
                  className="ml-2 border rounded px-2 py-1 text-sm"
                  value={String(form.anoConstrucao ?? '')}
                  onChange={(e) => handleChange('anoConstrucao', e.target.value)}
                  placeholder="Opcional"
                />
              ) : (data.anoConstrucao || '-')}
            </div>
            <div>
              <span className="font-semibold">Potência motor principal (kW):</span>{" "}
              {edit ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="ml-2 border rounded px-2 py-1 text-sm"
                  value={String(form.potenciaMotorKw ?? '')}
                  onChange={(e) => handleChange('potenciaMotorKw', e.target.value)}
                  placeholder="Opcional"
                />
              ) : (data.potenciaMotorKw ? `${data.potenciaMotorKw} kW` : '-')}
            </div>
            <div>
              <span className="font-semibold">Lotação (pessoas):</span>{" "}
              {edit ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="ml-2 border rounded px-2 py-1 text-sm"
                  value={String(form.lotacao ?? '')}
                  onChange={(e) => handleChange('lotacao', e.target.value)}
                  placeholder="Opcional"
                />
              ) : (data.lotacao ? `${data.lotacao} pessoas` : '-')}
            </div>
            <div>
              <span className="font-semibold">Zona de navegação:</span>{" "}
              {edit ? (
                <select
                  className="ml-2 border rounded px-2 py-1 text-sm"
                  value={form.zonaNavegacao ?? ''}
                  onChange={(e) => handleChange('zonaNavegacao', e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {RECREIO_ZONA_OPTIONS.map((z) => (
                    <option key={z.key} value={z.key}>{z.label}</option>
                  ))}
                </select>
              ) : (data.zonaNavegacao
                ? (RECREIO_ZONA_OPTIONS.find((z) => z.key === data.zonaNavegacao)?.label ?? data.zonaNavegacao)
                : '-')}
            </div>
            <div>
              <span className="font-semibold">Proprietário:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.proprietario || ""} onChange={(e) => handleChange("proprietario", e.target.value)} />
              ) : proprietarioDisplay}
            </div>
            <div>
              <span className="font-semibold">Bandeira:</span>{" "}
              {edit ? (
                <>
                  <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.bandeira || ""} onChange={(e) => handleChange("bandeira", e.target.value)} list="bandeiras-opcoes-ficha-navio" />
                  <datalist id="bandeiras-opcoes-ficha-navio">
                    {BANDEIRAS_OPCOES.map((flag) => (
                      <option key={flag} value={flag} />
                    ))}
                  </datalist>
                </>
              ) : (data.bandeira || '-')}
            </div>
            <div>
              <span className="font-semibold">MMSI:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.mmsi || ""} onChange={(e) => handleChange("mmsi", e.target.value)} />
              ) : (data.mmsi || '-')}
            </div>
            <div>
              <span className="font-semibold">IMO:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.imo || ""} onChange={(e) => handleChange("imo", e.target.value)} />
              ) : (data.imo || '-')}
            </div>
            <div>
              <span className="font-semibold">CALL SIGNAL:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.callSignal || ""} onChange={(e) => handleChange("callSignal", e.target.value)} />
              ) : (data.callSignal || '-')}
            </div>
            <div>
              <span className="font-semibold">CFR (Community Fleet Register):</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.cfr || ""} onChange={(e) => handleChange("cfr", e.target.value)} placeholder="Ex: POR0000123456" />
              ) : (data.cfr || '-')}
            </div>
            {!edit ? (
              <div>
                <span className="font-semibold">Última localização AIS:</span>{" "}
                {hasLastAisLocation ? `${lastAisLatitude} · ${lastAisLongitude}` : 'Sem posição AIS guardada'}
              </div>
            ) : null}
            <div>
              <span className="font-semibold">Latitude AIS:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.lat || ""} onChange={(e) => handleChange("lat", e.target.value)} placeholder="Ex: 37.7412 ou N 37.7412" />
              ) : lastAisLatitude}
            </div>
            <div>
              <span className="font-semibold">Longitude AIS:</span>{" "}
              {edit ? (
                <input className="ml-2 border rounded px-2 py-1 text-sm" value={form.lng || ""} onChange={(e) => handleChange("lng", e.target.value)} placeholder="Ex: -25.6756 ou W 25.6756" />
              ) : lastAisLongitude}
            </div>
            <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              HRU e refletor de radar são geridos na ficha da <b>jangada</b> associada. As coordenadas AIS acima são as que o mapa usa quando existem.
            </div>
            {data.cliente && (
              <div><span className="font-semibold">Cliente:</span> {data.cliente.nome || '-'}</div>
            )}
          </div>
        </div>

        <div className="space-y-8">
        </div>
      </div>

      <div className="max-w-4xl mx-auto">

        <div id="section-legal" className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-lg p-8 border border-indigo-100">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-indigo-900">Enquadramento legal por tipologia</h2>
              <p className="text-sm text-indigo-700 mt-1">Leitura operacional baseada no tipo do navio, para ajudar a validar o material de segurança a bordo.</p>
            </div>
            <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800">
              {legalProfile.label}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLegalTab('legal')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${legalTab === 'legal' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'}`}
            >
              Enquadramento legal
            </button>
            {showPescaCosteiraMandatoryTab ? (
              <button
                type="button"
                onClick={() => setLegalTab('mandatory')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${legalTab === 'mandatory' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'}`}
              >
                Meios obrigatórios
              </button>
            ) : null}
            {showRecreioMandatoryTab ? (
              <button
                type="button"
                onClick={() => setLegalTab('mandatory')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${legalTab === 'mandatory' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'}`}
              >
                Meios obrigatórios
              </button>
            ) : null}
          </div>

          {legalTab === 'mandatory' && recreioMandatoryProfile ? (
            <>
              <div className="rounded-xl border border-indigo-100 bg-white px-4 py-4 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-indigo-500">Equipamento por zona de navegação</p>
                    <h3 className="text-lg font-bold text-indigo-900 mt-1">{recreioMandatoryProfile.label}</h3>
                  </div>
                  <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                    {recreioMandatoryProfile.shortLabel}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-3">{recreioMandatoryProfile.summary}</p>
                <p className="text-sm text-indigo-900 mt-2 font-medium">{recreioMandatoryProfile.guidanceNote}</p>
              </div>
              <div className="space-y-3 mb-5">
                {recreioMandatoryProfile.categories.map((category) => (
                  <div key={category.id} className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4">
                    <div className="text-xs uppercase tracking-wide text-indigo-600 mb-1">Categoria</div>
                    <div className="font-semibold text-indigo-950">{category.label}</div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-indigo-100 bg-white">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-indigo-100/80 text-indigo-900">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Item</th>
                            <th className="px-3 py-2 font-semibold">Exigência</th>
                            <th className="px-3 py-2 font-semibold">Nota operacional</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.rows.map((row) => (
                            <tr key={`${category.id}-${row.item}`} className="border-t border-indigo-50 align-top">
                              <td className="px-3 py-2 font-medium text-gray-900">{row.item}</td>
                              <td className="px-3 py-2 text-gray-700">{row.requirement}</td>
                              <td className="px-3 py-2 text-gray-600">{row.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                A validação final é sempre feita contra a licença/certificado de navegabilidade da embarcação.
              </div>
            </>
          ) : legalTab === 'mandatory' && pescaCosteiraMandatoryProfile ? (
            <>
              <div className="rounded-xl border border-indigo-100 bg-white px-4 py-4 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-indigo-500">Separador por categoria</p>
                    <h3 className="text-lg font-bold text-indigo-900 mt-1">{pescaCosteiraMandatoryProfile.label}</h3>
                  </div>
                  <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                    Comprimento registado: {data.comprimentoMetros} m
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-3">{pescaCosteiraMandatoryProfile.summary}</p>
                <p className="text-sm text-indigo-900 mt-2 font-medium">{pescaCosteiraMandatoryProfile.guidanceNote}</p>
              </div>

              <div className="space-y-3 mb-5">
                {pescaCosteiraMandatoryProfile.categories.map((category) => (
                  <div key={category.id} className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4">
                    <div className="text-xs uppercase tracking-wide text-indigo-600 mb-1">Categoria da tabela</div>
                    <div className="font-semibold text-indigo-950">{category.label}</div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-indigo-100 bg-white">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-indigo-100/80 text-indigo-900">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Item</th>
                            <th className="px-3 py-2 font-semibold">Exigência</th>
                            <th className="px-3 py-2 font-semibold">Nota operacional</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.rows.map((row) => (
                            <tr key={`${category.id}-${row.item}`} className="border-t border-indigo-50 align-top">
                              <td className="px-3 py-2 font-medium text-gray-900">{row.item}</td>
                              <td className="px-3 py-2 text-gray-700">{row.requirement}</td>
                              <td className="px-3 py-2 text-gray-600">{row.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                Este separador organiza os meios por categoria para a pesca costeira, mas a validação final continua a ser feita contra a licença/certificado aplicável à embarcação.
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-indigo-100 bg-white px-4 py-4 mb-4">
                <p className="text-sm text-gray-700">{legalProfile.summary}</p>
                <p className="text-sm text-indigo-900 mt-3 font-medium">{legalProfile.legalNote}</p>
              </div>

              {showPescaCosteiraHint ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 mb-4 text-sm text-sky-900">
                  Quando o navio de <b>Pesca Costeira</b> tiver o <b>comprimento</b> preenchido, aparece automaticamente o separador com os meios obrigatórios por categoria da tabela.
                </div>
              ) : null}

              {showRecreioZonaHint ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 mb-4 text-sm text-sky-900">
                  Quando o navio de <b>Náutica de Recreio</b> tiver a <b>zona de navegação</b> preenchida, aparece automaticamente o separador com os meios obrigatórios por zona.
                </div>
              ) : null}

              <div className="space-y-3 mb-5">
                {legalProfile.requirements.map((requirement) => {
                  const tone = requirement.emphasis === 'required'
                    ? 'border-red-100 bg-red-50/60'
                    : requirement.emphasis === 'review'
                      ? 'border-amber-100 bg-amber-50/60'
                      : 'border-emerald-100 bg-emerald-50/60';

                  return (
                    <div key={`${requirement.category}-${requirement.title}`} className={`rounded-xl border px-4 py-3 ${tone}`}>
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{requirement.category}</div>
                      <div className="font-semibold text-gray-900">{requirement.title}</div>
                      <div className="text-sm text-gray-700 mt-1">{requirement.detail}</div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4">
                <h3 className="font-semibold text-indigo-900 mb-2">Fontes oficiais a confirmar</h3>
                <ul className="space-y-2 text-sm text-indigo-900">
                  {legalProfile.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700">
                        {source.title}
                      </a>
                      <div className="text-indigo-800/80">{source.note}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
      )}

      {activeTab === 'equipment' && (
        <div className="space-y-6">
          <div id="section-pirotecnia" className="bg-gradient-to-br from-rose-50 to-white rounded-2xl shadow-lg p-8 border border-rose-100 max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-rose-900">Pirotécnicos a bordo</h2>
                <p className="text-sm text-rose-700 mt-1">Regista os artigos pirotécnicos instalados neste navio e controla as respetivas validades.</p>
              </div>
              {edit ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded text-sm font-medium"
                    onClick={handleAddPirotecnico}
                  >
                    + Adicionar artigo
                  </button>
                  {piroSugestoes.length > 0 && (
                    <button
                      type="button"
                      title="Adiciona os artigos e quantidades sugeridos para este navio (tipo/comprimento) que ainda não estejam registados"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-sm font-medium"
                      onClick={handleAplicarSugestaoPirotecnia}
                    >
                      Aplicar sugestão
                    </button>
                  )}
                  <button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded text-sm font-medium"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "A guardar..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-2 rounded text-sm font-medium"
                    onClick={() => { setEdit(false); setForm(data || {}); setPirotecnicos(parsePirotecnicos(data?.pirotecnicosBordoJson ?? [])); }}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded text-sm font-medium"
                  onClick={handleAddPirotecnico}
                >
                  + Adicionar artigo
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Válidos</div>
                <div className="text-2xl font-bold text-emerald-900">{piroResumo.valid}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-amber-700">A expirar ≤ 180d</div>
                <div className="text-2xl font-bold text-amber-900">{piroResumo.expiring}</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-red-700">Expirados</div>
                <div className="text-2xl font-bold text-red-900">{piroResumo.expired}</div>
              </div>
            </div>

            <div className="rounded-lg border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-rose-900 mb-4">
              Dica prática: lança aqui a dotação real de bordo e usa a matriz legal ao lado como guia operacional. A quantidade mínima continua a ser a do certificado/licença em vigor.
            </div>

            {!edit && piroSugestoes.length > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-indigo-900">
                  <div className="font-semibold mb-1">Sugestão para este navio (tipo/comprimento)</div>
                  <div className="flex flex-wrap gap-2">
                    {piroSugestoes.map((s) => (
                      <span key={s.item} className="inline-flex items-center gap-1 rounded-full bg-white border border-indigo-200 px-3 py-1 text-xs text-indigo-800">
                        {s.item} <b>x{s.quantity}</b>
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-sm font-medium"
                  onClick={() => { setEdit(true); handleAplicarSugestaoPirotecnia(); }}
                >
                  Aplicar sugestão
                </button>
              </div>
            )}

            {edit ? (
              <div className="space-y-3">
                {pirotecnicos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-rose-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    Ainda sem artigos pirotécnicos registados. Vamos pôr ordem no paiol digital.
                  </div>
                ) : null}
                {pirotecnicos.map((item) => (
                  <div key={item.id} className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Artigo</label>
                        <select
                          className="w-full border rounded px-3 py-2 text-sm bg-white"
                          value={item.item}
                          onChange={(e) => handlePirotecnicoChange(item.id, 'item', e.target.value)}
                        >
                          <option value="">— Escolher artigo —</option>
                          {PIROTECNIA_OPCOES.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          {item.item && !(PIROTECNIA_OPCOES as readonly string[]).includes(item.item) && (
                            <option value={item.item}>{item.item}</option>
                          )}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Qtd.</label>
                        <input
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={item.quantity}
                          onChange={(e) => handlePirotecnicoChange(item.id, 'quantity', e.target.value)}
                          placeholder="4"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Validade</label>
                        <input
                          type="date"
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={item.validade}
                          onChange={(e) => handlePirotecnicoChange(item.id, 'validade', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Observações</label>
                        <input
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={item.notes}
                          onChange={(e) => handlePirotecnicoChange(item.id, 'notes', e.target.value)}
                          placeholder="Paiol BB"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          className="w-full bg-red-500 hover:bg-red-600 text-white px-2 py-2 rounded text-sm"
                          onClick={() => handleRemovePirotecnico(item.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pirotecnicos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse rounded-xl overflow-hidden shadow-sm">
                  <thead>
                    <tr className="bg-rose-100 text-rose-900">
                      <th className="p-3 font-semibold">Artigo</th>
                      <th className="p-3 font-semibold">Qtd.</th>
                      <th className="p-3 font-semibold">Validade</th>
                      <th className="p-3 font-semibold">Estado</th>
                      <th className="p-3 font-semibold">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pirotecnicos.map((item) => {
                      const status = getPirotecnicoStatus(item.validade);
                      return (
                        <tr key={item.id} className="border-b last:border-0 bg-white">
                          <td className="p-3 font-medium text-gray-900">{item.item || '—'}</td>
                          <td className="p-3">{item.quantity || '—'}</td>
                          <td className="p-3">{item.validade ? new Date(item.validade).toLocaleDateString('pt-PT') : '—'}</td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-gray-600">{item.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 italic">Ainda não existem pirotécnicos registados neste navio.</p>
            )}
          </div>

      {/* Jangadas associadas */}
      <div id="section-jangadas" className="bg-gradient-to-br from-green-50 to-white rounded-2xl shadow-lg p-8 border border-green-100 mt-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-green-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M3 7l9 4 9-4" /></svg>
            Jangadas Associadas
          </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            {/* Bloco 1: Associar Existente */}
            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-green-900 mb-2">Associar jangada existente</h3>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm bg-white mb-2"
                placeholder="Pesquisar jangada..."
                value={jangadaSearch}
                onChange={(e) => setJangadaSearch(e.target.value)}
                disabled={associating}
              />
              <div className="flex gap-2">
                <select
                  className="w-full border rounded px-3 py-2 text-sm bg-white"
                  value={selectedJangadaId}
                  onChange={(e) => setSelectedJangadaId(e.target.value)}
                  disabled={associating}
                >
                  <option value="">Selecionar da lista geral...</option>
                  {jangadasFiltradas.map((j: any) => (
                      <option key={j.id} value={j.id}>
                        {j.serial} {j.brand || j.model ? `- ${[j.brand, j.model].filter(Boolean).join(' ')}` : ''}
                        {j.shipId ? (j.shipId === data?.id ? ' • (já neste navio)' : ` • (navio #${j.shipId})`) : ' • (livre)'}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm flex-shrink-0 disabled:opacity-50"
                  onClick={handleAssociarJangada}
                  disabled={!selectedJangadaId || associating}
                >
                  Associar
                </button>
              </div>
            </div>

            {/* Bloco 2: Criar Nova */}
            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-green-900 mb-2">Criar e associar nova jangada</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Nº de Série *"
                  value={newJangada.serial}
                  onChange={(e) => setNewJangada(prev => ({ ...prev, serial: e.target.value }))}
                  disabled={associating}
                />
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Marca"
                  value={newJangada.brand}
                  onChange={(e) => setNewJangada(prev => ({ ...prev, brand: e.target.value }))}
                  disabled={associating}
                />
              </div>
              <button
                type="button"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                onClick={handleCriarAssociarJangada}
                disabled={!newJangada.serial || associating}
              >
                {associating ? "A processar..." : "Criar e associar"}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Um navio pode ter <b>várias jangadas</b> associadas em simultâneo. Cada jangada continua ligada a apenas um navio de cada vez.
        </div>

        {data.jangadas && data.jangadas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-green-100 border-b">
                  <th className="p-3 font-semibold">Nº Série</th>
                  <th className="p-3 font-semibold">Marca</th>
                  <th className="p-3 font-semibold">Modelo</th>
                  <th className="p-3 font-semibold text-center">Lotação</th>
                  <th className="p-3 font-semibold text-center">Consumíveis</th>
                  <th className="p-3 font-semibold">Cilindro (TH)</th>
                  <th className="p-3 font-semibold">Próx. Inspeção</th>
                  <th className="p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...data.jangadas]
                  .sort((a: any, b: any) => {
                    const dateA = a.dataProxInspecao ? new Date(a.dataProxInspecao).getTime() : Infinity;
                    const dateB = b.dataProxInspecao ? new Date(b.dataProxInspecao).getTime() : Infinity;
                    return dateA - dateB;
                  })
                  .map((j: any) => (
                    <tr
                      key={j.id}
                      className="border-b last:border-0 hover:bg-green-50 transition cursor-pointer"
                      onClick={() => window.location.href = `/jangadas/${j.id}`}
                      title="Ver detalhes da jangada"
                    >
                      <td className="p-3 font-mono text-blue-900 underline hover:text-green-700">{j.serial}</td>
                      <td className="p-3">{j.brand}</td>
                      <td className="p-3">{j.model}</td>
                      <td className="p-3 text-center">{j.capacity ? `${j.capacity}P` : '—'}</td>
                      <td className="p-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                        {renderLiferaftSemaforo(j.artigos)}
                      </td>
                      <td className="p-3">
                        <span className={isDateExpired(j.cylinderDataProxTeste) ? 'font-bold text-rose-600' : 'text-slate-700'}>
                          {formatDateLabel(j.cylinderDataProxTeste)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={isDateExpired(j.dataProxInspecao) ? 'font-bold text-rose-600' : 'text-slate-700'}>
                          {formatDateLabel(j.dataProxInspecao)}
                        </span>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                          onClick={() => handleDesassociarJangada(j.id)}
                          disabled={associating}
                        >
                          Desassociar
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhuma jangada associada a este navio.</p>
        )}
      </div>

      {/* Coletes associados */}
      <div id="section-coletes" className="bg-gradient-to-br from-cyan-50 to-white rounded-2xl shadow-lg p-8 border border-cyan-100 mt-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-cyan-900 flex items-center gap-2">
              <svg className="w-6 h-6 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 3v18" /><path d="M7 8h10" /><path d="M8 21h8" /></svg>
              Coletes Associados
            </h2>
            {data.coletes && data.coletes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-sm font-medium shadow transition disabled:cursor-not-allowed disabled:bg-indigo-300"
                  onClick={handleGerarCertificadoColetes}
                  disabled={generatingColeteCertificate || generatingColeteVerificationSheet}
                  title="Gerar um DOCX com o template oficial dos coletes, até 14 por página"
                >
                  {generatingColeteCertificate ? 'A gerar certificado DOCX...' : 'Gerar certificado DOCX'}
                </button>
                <button
                  type="button"
                  className="bg-cyan-700 hover:bg-cyan-800 text-white px-3 py-2 rounded text-sm font-medium shadow transition disabled:cursor-not-allowed disabled:bg-cyan-300"
                  onClick={handleGerarFichaVerificacaoColetes}
                  disabled={generatingColeteCertificate || generatingColeteVerificationSheet}
                  title="Gerar a ficha de verificação múltipla XLSX com o template oficial dos coletes"
                >
                  {generatingColeteVerificationSheet ? 'A gerar ficha XLSX...' : 'Gerar ficha verificação XLSX'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm bg-white w-52"
              placeholder="Pesquisar colete..."
              value={coleteSearch}
              onChange={(e) => setColeteSearch(e.target.value)}
              disabled={associating}
            />
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={selectedColeteId}
              onChange={(e) => setSelectedColeteId(e.target.value)}
              disabled={associating}
            >
              <option value="">Selecionar da lista geral...</option>
              {coletesFiltrados.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.serial} {c.marca || c.modelo ? `- ${[c.marca, c.modelo].filter(Boolean).join(' ')}` : ''}
                  {c.shipId ? (c.shipId === data?.id ? ' • (já neste navio)' : ` • (navio #${c.shipId})`) : ' • (livre)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded text-sm"
              onClick={handleAssociarColete}
              disabled={!selectedColeteId || associating}
            >
              {associating ? 'A associar...' : 'Associar colete'}
            </button>
            <a href="/equipamentos" className="text-xs text-blue-700 underline">Abrir lista geral</a>
          </div>
        </div>

        {data.coletes && data.coletes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-cyan-100 border-b">
                  <th className="p-3 font-semibold">Serial</th>
                  <th className="p-3 font-semibold">Marca</th>
                  <th className="p-3 font-semibold">Modelo</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.coletes.map((c: any) => (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-cyan-100 transition cursor-pointer"
                    onClick={() => window.location.href = `/equipamentos/${c.id}`}
                    title="Ver ficha do colete"
                  >
                    <td className="p-3 font-mono text-blue-900 underline hover:text-cyan-700">{c.serial || '-'}</td>
                    <td className="p-3">{c.marca || '-'}</td>
                    <td className="p-3">{c.modelo || '-'}</td>
                    <td className="p-3">{c.estado || '-'}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/equipamentos/${c.id}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs mr-2 inline-block"
                      >
                        Ficha
                      </Link>
                      <button
                        type="button"
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                        onClick={() => handleDesassociarColete(c.id)}
                        disabled={associating}
                      >
                        Desassociar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhum colete associado a este navio.</p>
        )}
      </div>

      {/* Fatos de imersão associados */}
      <div id="section-fatos-imersao" className="bg-gradient-to-br from-sky-50 to-white rounded-2xl shadow-lg p-8 border border-sky-100 mt-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-sky-900 flex items-center gap-2">
            Fatos de Imersão Associados
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm bg-white w-52"
              placeholder="Pesquisar fato..."
              value={fatoImersaoSearch}
              onChange={(e) => setFatoImersaoSearch(e.target.value)}
              disabled={associating}
            />
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={selectedFatoImersaoId}
              onChange={(e) => setSelectedFatoImersaoId(e.target.value)}
              disabled={associating}
            >
              <option value="">Selecionar da lista geral...</option>
              {fatosImersaoFiltrados.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.serial} {f.marca || f.modelo ? `- ${[f.marca, f.modelo].filter(Boolean).join(' ')}` : ''}
                  {f.shipId ? (f.shipId === data?.id ? ' • (já neste navio)' : ` • (navio #${f.shipId})`) : ' • (livre)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded text-sm"
              onClick={handleAssociarFatoImersao}
              disabled={!selectedFatoImersaoId || associating}
            >
              {associating ? 'A associar...' : 'Associar fato'}
            </button>
            <a href="/fatos-imersao" className="text-xs text-blue-700 underline">Abrir lista geral</a>
          </div>
        </div>

        {data.fatosImersao && data.fatosImersao.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-sky-100 border-b">
                  <th className="p-3 font-semibold">Serial</th>
                  <th className="p-3 font-semibold">Marca</th>
                  <th className="p-3 font-semibold">Modelo</th>
                  <th className="p-3 font-semibold">Tipo</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.fatosImersao.map((f: any) => (
                  <tr
                    key={f.id}
                    className="border-b last:border-0 hover:bg-sky-100 transition cursor-pointer"
                    onClick={() => window.location.href = `/fatos-imersao/${f.id}`}
                    title="Ver ficha do fato de imersão"
                  >
                    <td className="p-3 font-mono text-blue-900 underline hover:text-sky-700">{f.serial || '-'}</td>
                    <td className="p-3">{f.marca || '-'}</td>
                    <td className="p-3">{f.modelo || '-'}</td>
                    <td className="p-3">{f.tipo || '-'}</td>
                    <td className="p-3">{f.estado || '-'}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/fatos-imersao/${f.id}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs mr-2 inline-block"
                      >
                        Ficha
                      </Link>
                      <button
                        type="button"
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                        onClick={() => handleDesassociarFatoImersao(f.id)}
                        disabled={associating}
                      >
                        Desassociar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhum fato de imersão associado a este navio.</p>
        )}
      </div>

      {/* Extintores associados */}
      <div id="section-extintores" className="bg-gradient-to-br from-orange-50 to-white rounded-2xl shadow-lg p-8 border border-orange-100 mt-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-orange-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z" /></svg>
            Extintores Associados
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm bg-white w-52"
              placeholder="Pesquisar extintor..."
              value={extintorSearch}
              onChange={(e) => setExtintorSearch(e.target.value)}
              disabled={associating}
            />
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={selectedExtintorId}
              onChange={(e) => setSelectedExtintorId(e.target.value)}
              disabled={associating}
            >
              <option value="">Selecionar da lista geral...</option>
              {extintoresFiltrados.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.serial || `#${e.id}`} {e.marca || e.modelo ? `- ${[e.marca, e.modelo].filter(Boolean).join(' ')}` : ''}
                  {e.shipId ? (e.shipId === data?.id ? ' • (já neste navio)' : ` • (navio #${e.shipId})`) : ' • (livre)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded text-sm"
              onClick={handleAssociarExtintor}
              disabled={!selectedExtintorId || associating}
            >
              {associating ? 'A associar...' : 'Associar extintor'}
            </button>
            <a href="/extintores" className="text-xs text-orange-700 underline">Abrir lista geral</a>
          </div>
        </div>

        {data.extintores && data.extintores.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-orange-100 border-b">
                  <th className="p-3 font-semibold">Série</th>
                  <th className="p-3 font-semibold">Marca</th>
                  <th className="p-3 font-semibold">Modelo</th>
                  <th className="p-3 font-semibold">Capacidade</th>
                  <th className="p-3 font-semibold">Agente</th>
                  <th className="p-3 font-semibold">Localização</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold">Próx. recarga</th>
                  <th className="p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.extintores.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-orange-100 transition">
                    <td className="p-3 font-mono font-semibold text-slate-800">{e.serial || '—'}</td>
                    <td className="p-3">{e.marca || '—'}</td>
                    <td className="p-3">{e.modelo || '—'}</td>
                    <td className="p-3">{e.capacidadeKg ? `${e.capacidadeKg} kg` : '—'}</td>
                    <td className="p-3">{e.tipoAgente || '—'}</td>
                    <td className="p-3">{e.localizacao || '—'}</td>
                    <td className="p-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{e.estado || '—'}</span>
                    </td>
                    <td className="p-3">{formatDateLabel(e.dataProxRecarga) || '—'}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                        onClick={() => handleDesassociarExtintor(e.id)}
                        disabled={associating}
                      >
                        Desassociar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhum extintor associado a este navio.</p>
        )}
      </div>

      <div id="section-epirbs" className="bg-gradient-to-br from-violet-50 to-white rounded-2xl shadow-lg p-8 border border-violet-100 mt-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-violet-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z" /></svg>
            EPIRBs Associados
          </h2>

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm bg-white w-52"
              placeholder="Pesquisar EPIRB..."
              value={epirbSearch}
              onChange={(e) => setEpirbSearch(e.target.value)}
              disabled={associating}
            />
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={selectedEpirbId}
              onChange={(e) => setSelectedEpirbId(e.target.value)}
              disabled={associating}
            >
              <option value="">Selecionar da lista geral...</option>
              {epirbsFiltrados.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.serial} {e.marca || e.modelo ? `- ${[e.marca, e.modelo].filter(Boolean).join(' ')}` : ''}
                  {e.shipId ? (e.shipId === data?.id ? ' • (já neste navio)' : ` • (navio #${e.shipId})`) : ' • (livre)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded text-sm"
              onClick={handleAssociarEpirb}
              disabled={!selectedEpirbId || associating}
            >
              {associating ? 'A associar...' : 'Associar EPIRB'}
            </button>
            <a href="/epirbs" className="text-xs text-blue-700 underline">Abrir lista geral</a>
          </div>
        </div>

        {data.epirbs && data.epirbs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-violet-100 border-b">
                  <th className="p-3 font-semibold">Serial</th>
                  <th className="p-3 font-semibold">Marca</th>
                  <th className="p-3 font-semibold">Modelo</th>
                  <th className="p-3 font-semibold">HEX ID</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.epirbs.map((e: any) => (
                  <tr
                    key={e.id}
                    className="border-b last:border-0 hover:bg-violet-100 transition cursor-pointer"
                    onClick={() => window.location.href = `/epirbs/${e.id}`}
                    title="Ver ficha do EPIRB"
                  >
                    <td className="p-3 font-mono text-blue-900 underline hover:text-violet-700">{e.serial || '-'}</td>
                    <td className="p-3">{e.marca || '-'}</td>
                    <td className="p-3">{e.modelo || '-'}</td>
                    <td className="p-3">{e.hexId || '-'}</td>
                    <td className="p-3">{e.estado || '-'}</td>
                    <td className="p-3" onClick={(ev) => ev.stopPropagation()}>
                      <Link
                        href={`/epirbs/${e.id}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs mr-2 inline-block"
                      >
                        Ficha
                      </Link>
                      <button
                        type="button"
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                        onClick={() => handleDesassociarEpirb(e.id)}
                        disabled={associating}
                      >
                        Desassociar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhum EPIRB associado a este navio.</p>
        )}
      </div>
      </div>
      )}

      {activeTab === 'inspections' && (
      <div id="section-history" className="bg-gradient-to-br from-yellow-50 to-white rounded-2xl shadow-lg p-8 border border-yellow-100 mt-8">
        <h2 className="text-2xl font-bold mb-4 text-yellow-900 flex items-center gap-2">
          <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M3 7l9 4 9-4" /></svg>
          Histórico de Inspecções
        </h2>
        {data.inspecoes && data.inspecoes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-lg overflow-hidden shadow">
              <thead>
                <tr className="bg-yellow-100 border-b">
                  <th className="p-3 font-semibold">Data</th>
                  <th className="p-3 font-semibold">Tipo</th>
                  <th className="p-3 font-semibold">Estado</th>
                  <th className="p-3 font-semibold">Observações</th>
                </tr>
              </thead>
              <tbody>
                {data.inspecoes.map((i: any) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-yellow-50 transition">
                    <td className="p-3">{new Date(i.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">{i.tipo || '-'}</td>
                    <td className="p-3">{i.estado || '-'}</td>
                    <td className="p-3 text-sm max-w-md truncate">{i.observacoes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">Nenhuma inspecção registada para este navio (ou para as suas jangadas).</p>
        )}
      </div>
      )}

      {activeTab === 'mapa' && (
      <div id="section-ais-map" className="space-y-6 mt-8">
        <div className="bg-gradient-to-br from-sky-50 to-white rounded-2xl shadow-lg p-8 border border-sky-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-sky-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                Localização AIS em tempo real
              </h2>
              <p className="mt-1 text-sm text-sky-700">
                Posição obtida através do AIS usando o {data.mmsi ? `MMSI ${data.mmsi}` : 'MMSI'} / {data.callSignal ? `indicativo ${data.callSignal}` : 'indicativo de chamada'} do navio.
              </p>
            </div>
            <button
              onClick={() => loadAisPosition()}
              disabled={aisLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
            >
              {aisLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  A pesquisar...
                </>
              ) : (
                'Atualizar posição'
              )}
            </button>
          </div>

          {aisLoading ? (
            <div className="h-[320px] rounded-xl border border-sky-100 bg-white flex items-center justify-center animate-pulse">
              <p className="text-sm text-sky-600 font-semibold">A pesquisar posição AIS por MMSI...</p>
            </div>
          ) : aisError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
              {aisError}
            </div>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden border border-sky-100 shadow-sm">
                <ShipMap navio={data} position={aisPosition} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-sky-100 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-sky-500">Estado da posição</div>
                  <div className="mt-1 font-semibold text-sky-900 flex items-center gap-2">
                    {aisPosition?.live ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Ao vivo (AIS)
                      </span>
                    ) : aisPosition?.source === 'saved' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        Guardada (BD)
                      </span>
                    ) : (
                      <span className="text-slate-500">Sem posição</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-sky-500">Velocidade</div>
                  <div className="mt-1 font-semibold text-sky-900">
                    {aisPosition && Number(aisPosition.speed) >= 0 ? `${Number(aisPosition.speed).toFixed(1)} kn` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-sky-500">Rumo</div>
                  <div className="mt-1 font-semibold text-sky-900">
                    {aisPosition && Number(aisPosition.course) >= 0 ? `${Number(aisPosition.course).toFixed(0)}°` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-sky-500">Última atualização</div>
                  <div className="mt-1 font-semibold text-sky-900">
                    {aisPosition?.updatedAt ? formatDateLabel(aisPosition.updatedAt, { includeTime: true }) : '—'}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {aisLastRefreshAt ? `Atualização automática a cada 60s (${formatDateLabel(aisLastRefreshAt.toISOString(), { includeTime: true })})` : 'Sem atualização automática ainda'}
                  </div>
                </div>
              </div>

              {!data.mmsi && !data.callSignal ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Este navio ainda não tem MMSI nem indicativo de chamada registado. Preencha estes campos na <button onClick={() => setActiveTab('technical')} className="font-semibold underline underline-offset-2">Ficha Técnica</button> para pesquisa AIS por MMSI.
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
