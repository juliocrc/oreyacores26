"use client";

import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Printer, Ship, LifeBuoy, ShieldAlert, Navigation, Flame } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'react-qr-code';

type DossierJangada = {
  id: number;
  brand: string | null;
  model: string | null;
  serial: string;
  capacity: number | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
};

type DossierColete = {
  id: number;
  marca: string | null;
  modelo: string | null;
  serial: string;
  tamanho: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
};

type DossierEpirb = {
  id: number;
  marca: string | null;
  modelo: string | null;
  hexId: string | null;
  hexCode: string | null;
  serial: string;
  dataValidadeBateria: string | null;
  validadeBateria: string | null;
  validadeHydro: string | null;
};

type DossierExtintor = {
  id: number;
  marca: string | null;
  modelo: string | null;
  serial: string | null;
  capacidadeKg: number | null;
  tipoAgente: string | null;
  localizacao: string | null;
  estado: string | null;
  dataProxRecarga: string | null;
  dataProxTesteHidraulico: string | null;
};

type DossierNavio = {
  nome: string;
  matricula: string | null;
  imo: string | null;
  mmsi: string | null;
  tipoNavio: string | null;
  bandeira: string | null;
  portoRegisto: string | null;
  comprimentoMetros: number | null;
  lotacao: number | null;
  proprietario: string | null;
  cliente: {
    nome: string | null;
    telefone: string | null;
    telmovel: string | null;
    morada: string | null;
    localidade: string | null;
  } | null;
  jangadas: DossierJangada[];
  coletes: DossierColete[];
  epirbs: DossierEpirb[];
  extintores: DossierExtintor[];
};

export default function NavioPremiumDossierClient({ navioId }: { navioId: number | string }) {
  const [data, setData] = useState<DossierNavio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [printMode, setPrintMode] = useState<'compacto' | 'detalhado'>('compacto');
  const [issuedAt, setIssuedAt] = useState('');
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    setIssuedAt(new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }));
    setPageUrl(`${window.location.origin}/navios/${encodeURIComponent(String(navioId))}`);
    const updateTime = () => setIssuedAt(new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }));
    window.addEventListener('beforeprint', updateTime);
    return () => window.removeEventListener('beforeprint', updateTime);
  }, [navioId]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        if (typeof navioId === 'number' || !isNaN(Number(navioId))) {
          const res = await fetch(`/api/navios/${navioId}/dossier`);
          if (!res.ok) throw new Error('Not found');
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [navioId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-sky-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">A compilar o dossier do navio...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-lg max-w-lg mx-auto mt-12 border border-red-200 shadow-sm">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-700 mb-2">Navio não encontrado</h2>
        <p className="text-red-600">Não foi possível carregar o dossier premium para o navio selecionado.</p>
        <Link href="/navios" className="mt-6 inline-block bg-white px-4 py-2 rounded shadow text-slate-700 font-medium hover:bg-slate-50">
          Voltar aos Navios
        </Link>
      </div>
    );
  }

  const { jangadas = [], coletes = [], epirbs = [], extintores = [], cliente } = data;
  const dates = [
    ...jangadas.map(item => item.dataProxInspecao),
    ...coletes.map(item => item.dataProxInspecao),
    ...epirbs.flatMap(item => [item.dataValidadeBateria || item.validadeBateria, item.validadeHydro]),
    ...extintores.flatMap(item => [item.dataProxRecarga, item.dataProxTesteHidraulico]),
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = dates.map(value => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  });
  const expired = days.filter(day => day !== null && day < 0).length;
  const upcoming = days.filter(day => day !== null && day >= 0 && day <= 30).length;
  const unknown = days.filter(day => day === null).length;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('pt-PT');
  };

  const getUrgencyClasses = (dateStr: string | null) => {
    if (!dateStr) return "bg-gray-100 text-gray-800";
    const msPerDay = 1000 * 60 * 60 * 24;
    const today = new Date().getTime();
    const target = new Date(dateStr).getTime();
    const diff = Math.ceil((target - today) / msPerDay);
    if (diff < 0) return "bg-red-100 text-red-800 border border-red-200";
    if (diff <= 30) return "bg-orange-100 text-orange-800 border border-orange-200";
    return "bg-green-100 text-green-800 border border-green-200";
  };

  return (
    <div className={`dossier-print ${printMode === 'compacto' ? 'print-compact' : 'print-detailed'} bg-white rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden print:shadow-none print:border-none`}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body * { visibility: hidden; }
          .dossier-print, .dossier-print * { visibility: visible; }
          .dossier-print {
            position: absolute; top: 0; left: 0; width: 100%;
            overflow: visible !important; border-radius: 0; font-size: 9pt;
          }
          .dossier-print > div:first-of-type { padding: 0 0 3mm !important; margin: 0 0 3mm !important; }
          .dossier-print h2 { font-size: 18pt; line-height: 1.1; }
          .dossier-print > div:nth-of-type(2) { padding: 0 !important; }
          .dossier-print > div:nth-of-type(2) > * + * { margin-top: 3mm !important; }
          .dossier-print .grid { grid-template-columns: 1fr 1fr !important; gap: 5mm !important; }
          .dossier-print h3 { font-size: 10pt; line-height: 1.2; margin-bottom: 1mm !important; padding: 0 0 1mm !important; }
          .dossier-print p { font-size: 8pt; line-height: 1.2; }
          .dossier-print .space-y-3 > * + * { margin-top: 1mm !important; }
          .dossier-print table { font-size: 8pt; width: 100%; }
          .dossier-print th, .dossier-print td { padding: 1mm 1.5mm !important; overflow-wrap: anywhere; }
          .dossier-print td span { padding: 0 !important; font-size: 8pt; }
          .dossier-print .overflow-x-auto { overflow: visible !important; }
          .dossier-print tr { break-inside: avoid; }
          .dossier-print .print-hidden { display: none !important; }
          .print-compact .equipment-detail { display: none !important; }
          .print-compact .compact-summary { display: block !important; }
        }
      `}</style>
      {/* Header Cover */}
      <div className="bg-gradient-to-r from-sky-800 to-indigo-900 p-8 text-white relative overflow-hidden print:bg-white print:text-black print:p-0 print:border-b-2 print:border-sky-900 print:pb-4 print:mb-6">
        <div className="absolute top-0 right-0 opacity-10 print:hidden">
           <Ship className="w-64 h-64 -mt-10 -mr-10" />
        </div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-sky-400/20 text-sky-100 border border-sky-400/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide print:hidden">DOSSIER FROTA</span>
              <span className="text-sky-200 text-sm font-medium print:text-gray-500">Emitido: {issuedAt || '—'}</span>
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-1">{data.nome}</h2>
            <div className="flex items-center gap-4 text-sky-100 text-sm print:text-gray-700">
              {data.matricula && <p>Matrícula: <span className="font-semibold">{data.matricula}</span></p>}
              {data.imo && <p>IMO: <span className="font-semibold">{data.imo}</span></p>}
              {data.mmsi && <p>MMSI: <span className="font-semibold">{data.mmsi}</span></p>}
            </div>
          </div>
          <div className="flex flex-col gap-2 print:hidden">
            <label htmlFor="dossier-print-mode" className="text-xs font-semibold">Formato de impressão</label>
            <select id="dossier-print-mode" value={printMode} onChange={event => setPrintMode(event.target.value as 'compacto' | 'detalhado')} className="rounded-lg px-3 py-2 text-sm text-slate-900">
              <option value="compacto">Resumo compacto — A4</option>
              <option value="detalhado">Detalhado — todas as linhas</option>
            </select>
            <button onClick={() => window.print()} className="bg-white text-sky-900 hover:bg-sky-50 px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Pré-visualizar e imprimir
            </button>
            <Link href={`/jangadas?shipId=${encodeURIComponent(String(navioId))}`} className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
              <LifeBuoy className="w-4 h-4" />
              Registar jangada
            </Link>
            <a href={`/api/navios/${navioId}/dossier/proposta`} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Proposta Comercial (Excel)
            </a>
            <a href={`mailto:?subject=Aviso de Equipamentos - Navio ${data.nome}&body=Caro Cliente,%0D%0A%0D%0AEnviamos em anexo o ponto de situação dos equipamentos do navio ${data.nome}.`} className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Notificar Cliente
            </a>
          </div>
        </div>
      </div>

      <div className="p-8 print:p-0 space-y-8">
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <strong>Resumo de validades:</strong> {expired} expiradas · {upcoming} nos próximos 30 dias · {unknown} sem data válida
          <p>Contagem por prazo, não por equipamento. Confirme as datas antes de agir.</p>
        </div>
        {pageUrl && <div className="flex items-center gap-3 text-xs"><QRCode value={pageUrl} size={64} /><span>Ficha atualizada do navio (requer acesso autorizado)<br />{pageUrl}</span></div>}
        <div className="compact-summary hidden text-sm">
          <strong>Equipamentos:</strong> {jangadas.length} jangadas · {coletes.length} coletes · {epirbs.length} EPIRBs · {extintores.length} extintores.
          <p>Resumo compacto: consulte a ficha digital ou imprima o formato detalhado para ver todas as linhas.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Informação do Navio</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Tipo de Navio:</span> {data.tipoNavio || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Bandeira:</span> {data.bandeira || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Porto Registo:</span> {data.portoRegisto || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Comprimento:</span> {data.comprimentoMetros ? `${data.comprimentoMetros} m` : '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Lotação:</span> {data.lotacao ? `${data.lotacao} pessoas` : '-'}</p>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Proprietário / Cliente</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Nome:</span> {cliente?.nome || data.proprietario || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Telefone:</span> {cliente?.telefone || cliente?.telmovel || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Morada:</span> {cliente?.morada || '-'}</p>
              <p><span className="font-semibold text-slate-500 w-32 inline-block">Localidade:</span> {cliente?.localidade || '-'}</p>
            </div>
          </div>
        </div>

        {/* JANGADAS */}
        <div className="equipment-detail">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0 print:border-b-2 print:border-slate-800">
            <LifeBuoy className="w-5 h-5 text-orange-500" />
            Jangadas a Bordo ({jangadas.length})
          </h3>
          {jangadas.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 print:bg-gray-100">
                  <tr>
                    <th className="p-3">Marca / Modelo</th>
                    <th className="p-3">Número de Série</th>
                    <th className="p-3">Lotação</th>
                    <th className="p-3">Data Inspeção</th>
                    <th className="p-3">Próxima Inspeção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jangadas.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">{[j.brand, j.model].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="p-3">{j.serial}</td>
                      <td className="p-3">{j.capacity} PAX</td>
                      <td className="p-3">{formatDate(j.dataInspecao)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(j.dataProxInspecao)}`}>
                          {formatDate(j.dataProxInspecao)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Nenhuma jangada associada a este navio.</p>
          )}
        </div>

        {/* COLETES */}
        <div className="equipment-detail">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0 print:border-b-2 print:border-slate-800">
            <ShieldAlert className="w-5 h-5 text-sky-500" />
            Coletes a Bordo ({coletes.length})
          </h3>
          {coletes.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 print:bg-gray-100">
                  <tr>
                    <th className="p-3">Marca / Modelo</th>
                    <th className="p-3">Número de Série</th>
                    <th className="p-3">Tamanho</th>
                    <th className="p-3">Data Inspeção</th>
                    <th className="p-3">Próxima Inspeção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coletes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">{c.marca} / {c.modelo}</td>
                      <td className="p-3">{c.serial}</td>
                      <td className="p-3">{c.tamanho || '-'}</td>
                      <td className="p-3">{formatDate(c.dataInspecao)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(c.dataProxInspecao)}`}>
                          {formatDate(c.dataProxInspecao)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Nenhum colete associado a este navio.</p>
          )}
        </div>

        {/* EPIRBs */}
        <div className="equipment-detail">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0 print:border-b-2 print:border-slate-800">
            <Navigation className="w-5 h-5 text-indigo-500" />
            Rádio Balizas / EPIRBs ({epirbs.length})
          </h3>
          {epirbs.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 print:bg-gray-100">
                  <tr>
                    <th className="p-3">Marca / Modelo</th>
                    <th className="p-3">UIN / HEX ID</th>
                    <th className="p-3">Número de Série</th>
                    <th className="p-3">Validade Bateria</th>
                    <th className="p-3">Validade Hydro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {epirbs.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">{e.marca} / {e.modelo}</td>
                      <td className="p-3 font-mono text-xs">{e.hexId || e.hexCode || '-'}</td>
                      <td className="p-3">{e.serial}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(e.dataValidadeBateria || e.validadeBateria)}`}>
                          {formatDate(e.dataValidadeBateria || e.validadeBateria)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(e.validadeHydro)}`}>
                          {formatDate(e.validadeHydro)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Nenhuma rádio baliza associada a este navio.</p>
          )}
        </div>

        {/* EXTINTORES */}
        <div className="equipment-detail">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0 print:border-b-2 print:border-slate-800">
            <Flame className="w-5 h-5 text-orange-600" />
            Extintores a Bordo ({extintores.length})
          </h3>
          {extintores.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 print:bg-gray-100">
                  <tr>
                    <th className="p-3">Marca / Modelo</th>
                    <th className="p-3">Número de Série</th>
                    <th className="p-3">Capacidade</th>
                    <th className="p-3">Agente</th>
                    <th className="p-3">Localização</th>
                    <th className="p-3">Próx. Recarga</th>
                    <th className="p-3">Próx. Teste Hidráulico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {extintores.map((x) => (
                    <tr key={x.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">{[x.marca, x.modelo].filter(Boolean).join(" / ") || '-'}</td>
                      <td className="p-3">{x.serial || '-'}</td>
                      <td className="p-3">{x.capacidadeKg ? `${x.capacidadeKg} kg` : '-'}</td>
                      <td className="p-3">{x.tipoAgente || '-'}</td>
                      <td className="p-3">{x.localizacao || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(x.dataProxRecarga)}`}>
                          {formatDate(x.dataProxRecarga)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getUrgencyClasses(x.dataProxTesteHidraulico)}`}>
                          {formatDate(x.dataProxTesteHidraulico)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Nenhum extintor associado a este navio.</p>
          )}
        </div>

      </div>
    </div>
  );
}
