"use client";
import { useState } from "react";

export type JangadaData = {
  brand?: string;
  model?: string;
  serial?: string;
  capacity?: string | number;
  dataFabrico?: string;
  packType?: string;
  fabricType?: string;
  launchType?: string;
  painterLength?: string;
  maxStowageHeight?: string;
  containerModel?: string;
  tuboIdentificacao?: string;
  cylinderSerial?: string;
  cylinderSistema?: string;
  cylinderPesoBruto?: string;
  cylinderTara?: string;
  cylinderCo2?: string;
  cylinderN2?: string;
  cylinderDataTeste?: string;
  cylinderDataProxTeste?: string;
  cylinderCabecaDisparoRef?: string;
  cylinderCabecaDisparoSerial?: string;
  valvulasAlivio?: string;
  valvulasAtestar?: string;
  hruReferencia?: string;
  hruDataInstalacao?: string;
  hruValidade?: string;
  radarReflector?: string;
  radarReflectorValidade?: string;
  dataInspecao?: string;
  dataProxInspecao?: string;
  ultimoCertificadoNumero?: string;
  certificadoNumeroOriginal?: string;
  numeroObra?: string;
  owner?: string;
  ownerDisplay?: string;
  shipNameManual?: string;
  inspecoes?: Array<{
    dataInspecao?: string;
    dataProxInspecao?: string;
    certificadoNumero?: string;
    navioNome?: string;
    numeroObra?: string;
    status?: string;
  }>;
};

export default function DgrmIdentificationForm({ data }: { data: JangadaData }) {
  const fmt = (d?: string) => d || "_______________________";
  const fmtPeso = (d?: string | number) => {
    if (d === undefined || d === null || d === "") return "_______________________";
    const n = typeof d === "number" ? d : parseFloat(String(d).replace(",", "."));
    if (Number.isNaN(n)) return String(d);
    return n.toFixed(3);
  };
  const [exporting, setExporting] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | "todos">("todos");

  const allInspecoes = Array.isArray(data.inspecoes)
    ? [...data.inspecoes].sort((a, b) => String(a.dataInspecao || "").localeCompare(String(b.dataInspecao || "")))
    : [];

  const anosDisponiveis = Array.from(
    new Set(
      allInspecoes
        .map((insp) => {
          if (!insp.dataInspecao) return null;
          const d = new Date(insp.dataInspecao);
          return isNaN(d.getTime()) ? null : d.getFullYear();
        })
        .filter(Boolean)
    )
  ).sort((a: number | null, b: number | null) => (b ?? 0) - (a ?? 0)) as number[];

  const inspecoesFiltradas = selectedYear === "todos"
    ? allInspecoes
    : allInspecoes.filter((insp) => {
        if (!insp.dataInspecao) return false;
        const d = new Date(insp.dataInspecao);
        return !isNaN(d.getTime()) && d.getFullYear() === selectedYear;
      });

  const handleExportDocx = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/export/dgrm-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Erro ao gerar DOCX");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Ficha_DGRM_Jangada.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert("Erro ao exportar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="text-[10px] leading-tight font-mono">
      <div className="max-w-[210mm] mx-auto mb-2 flex justify-end gap-2 no-print">
        <button onClick={handleExportDocx} disabled={exporting}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {exporting ? "A gerar..." : "Download DOCX"}
        </button>
      </div>
      {anosDisponiveis.length > 0 && (
        <div className="max-w-[210mm] mx-auto mb-2 flex flex-wrap gap-2 no-print">
          <button
            onClick={() => setSelectedYear("todos")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              selectedYear === "todos"
                ? "bg-slate-850 text-white border-slate-850 shadow-sm"
                : "bg-white text-slate-650 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Todas ({allInspecoes.length})
          </button>
          {anosDisponiveis.map(year => {
            const count = allInspecoes.filter((insp) => {
              if (!insp.dataInspecao) return false;
              const d = new Date(insp.dataInspecao);
              return !isNaN(d.getTime()) && d.getFullYear() === year;
            }).length;
            return (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  selectedYear === year
                    ? "bg-indigo-650 text-white border-indigo-650 shadow-sm"
                    : "bg-white text-slate-650 border-slate-200 hover:bg-slate-50 hover:text-indigo-650 hover:border-indigo-150"
                }`}
              >
                Ano {year} ({count})
              </button>
            );
          })}
        </div>
      )}
      <style>{`
        @media print { @page { margin: 15mm; } }
        .dgrm { border: 1px solid #000; padding: 4mm; font-size: 9pt; }
        .dgrm fieldset { border: 1px solid #000; padding: 3mm; margin-bottom: 3mm; }
        .dgrm legend { font-weight: bold; padding: 0 2mm; font-size: 8pt; text-transform: uppercase; }
        .dgrm .row { display: flex; align-items: baseline; gap: 4px; margin: 2px 0; flex-wrap: wrap; }
        .dgrm .label { font-weight: 600; white-space: nowrap; font-size: 7pt; }
        .dgrm .val { border-bottom: 1px solid #000; min-width: 80px; padding: 0 4px; font-weight: 500; flex: 1; }
        .dgrm .val-sm { border-bottom: 1px solid #000; min-width: 40px; padding: 0 4px; font-weight: 500; }
        .dgrm table { width: 100%; border-collapse: collapse; font-size: 7pt; }
        .dgrm td, .dgrm th { border: 1px solid #000; padding: 2px 4px; text-align: left; vertical-align: top; }
      `}</style>

      <div className="dgrm max-w-[210mm] mx-auto bg-white print:shadow-none">
        {/* Header */}
        <div className="text-center mb-2 leading-tight">
          <p className="text-[7pt] font-bold">MINISTÉRIO DO MAR</p>
          <p className="text-[7pt]">DIREÇÃO-GERAL DE RECURSOS NATURAIS, SEGURANÇA E SERVIÇOS MARÍTIMOS</p>
          <p className="text-[9pt] font-bold mt-1">FICHA DE IDENTIFICAÇÃO DE JANGADA PNEUMÁTICA</p>
          <p className="text-[9pt] font-bold">DE INSUFLAÇÃO AUTOMÁTICA</p>
          <p className="text-[6pt] italic">Log card for inflatable liferaft</p>
          <p className="text-[6pt] font-mono">M-DSAM-172(1)</p>
        </div>

        {/* Fabricante / Tipo / Serie / Capacidade */}
        <div className="row">
          <span className="label">Fabricante / Manufacturer:</span>
          <span className="val">{fmt(data.brand)}</span>
        </div>
        <div className="row">
          <span className="label">Tipo / Type:</span>
          <span className="val-sm">{fmt(data.model)}</span>
          <span className="label ml-4">N.º de série / Serial nº:</span>
          <span className="val-sm">{fmt(data.serial)}</span>
          <span className="label ml-4">Para / For:</span>
          <span className="val-sm" style={{ minWidth: 30 }}>{data.capacity?.toString() || "___"}</span>
          <span className="label">Pessoas / Persons</span>
        </div>

        {/* Garrafa de Gas */}
        <fieldset>
          <legend>Garrafa de Gás / Gas Cylinder</legend>
          <div className="row">
            <span className="label">N.º / Serial nº:</span>
            <span className="val-sm">{fmt(data.cylinderSerial)}</span>
            <span className="label ml-4">Peso / Full weight:</span>
            <span className="val-sm">{fmtPeso(data.cylinderPesoBruto)}</span>
            <span className="label ml-4">Tara / Tare weight:</span>
            <span className="val-sm">{fmtPeso(data.cylinderTara)}</span>
            <span className="label ml-4">CO₂:</span>
            <span className="val-sm">{fmtPeso(data.cylinderCo2)}</span>
            <span className="label ml-4">N₂:</span>
            <span className="val-sm">{fmtPeso(data.cylinderN2)}</span>
          </div>
        </fieldset>

        {/* Embalagem de Sobrevivencia */}
        <fieldset>
          <legend>Embalagem de Sobrevivência / Emergency Pack</legend>
          <div className="row">
            <span className="label">Tipo / Type:</span>
            <span className="val">{fmt(data.packType)}</span>
            <span className="label ml-4">Completo / Complete:</span>
            <span className="val-sm">{data.packType ? (data.packType.includes('SOLAS') ? 'X' : '___') : '_____'}</span>
            <span className="label ml-4">Reduzido / Reduced:</span>
            <span className="val-sm">{data.packType && !data.packType.includes('SOLAS') ? 'X' : '_____'}</span>
          </div>
        </fieldset>

        {/* Contentor/Saco */}
        <fieldset>
          <legend>Contentor/Saco / Container/Valise</legend>
          <div className="row">
            <span className="label">Modelo / Type:</span>
            <span className="val">{fmt(data.containerModel)}</span>
          </div>
        </fieldset>

        {/* Cabo de disparo */}
        <div className="row">
          <span className="label">Comprimento do cabo de disparo / Painter line length:</span>
          <span className="val-sm">{fmt(data.painterLength)}</span>
        </div>

        {/* HRU */}
        <fieldset>
          <legend>Libertador Hidrostático / Hydrostatic Release</legend>
          <div className="row">
            <span className="label">Referência / Reference:</span>
            <span className="val">{fmt(data.hruReferencia)}</span>
            <span className="label ml-4">Tipo / Type:</span>
            <span className="val">{fmt(data.cylinderCabecaDisparoRef)}</span>
          </div>
          <div className="row">
            <span className="label">Nº Série Cabeça Disparo / Operating Head Serial:</span>
            <span className="val">{fmt(data.cylinderCabecaDisparoSerial)}</span>
          </div>
        </fieldset>

        {/* Local e data */}
        <div className="row mt-2">
          <span className="label">Local / Place: _________________________ ,</span>
          <span className="label ml-2">Data / Date: _________________________</span>
        </div>

        {/* Assinatura */}
        <div className="row mt-3">
          <span className="label">O Responsável pela Estação de Serviço / Service Station Responsible:</span>
        </div>
        <div className="row mt-2">
          <span className="val" style={{ minWidth: 200, borderBottom: '1px solid #000' }}>&nbsp;</span>
        </div>
        <p className="text-[6pt] mt-3 italic">(Assinatura / Signature)</p>

        {/* Destino */}
        <div className="text-[6pt] mt-3 border-t border-black pt-2">
          <p className="font-bold">Destino da Ficha de Identificação:</p>
          <p>- 1 Documentos de Bordo;</p>
          <p>- 1 Interior da jangada pneumática (colocada em embalagem à prova de água, e só após a 1ª revisão)</p>
          <p>- 1+1 Arquivo da Estação de Serviço (c/ cópia para a DGRM)</p>
        </div>

        {/* Averbamento das Revisoes Periodicas */}
        <div className="mt-4">
          <p className="font-bold text-center text-[8pt]">AVERBAMENTO DAS REVISÕES PERIÓDICAS</p>
          <p className="text-center text-[6pt] italic mb-1">RECORD OF PERIODIC SURVEYS</p>
          <table>
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Data de fabrico<br/><span className="font-normal">Manufactured at</span></th>
                <th style={{ width: '12%' }}>Local<br/><span className="font-normal">Place</span></th>
                <th style={{ width: '20%' }}>N.º do certificado original<br/><span className="font-normal">Original certificate number</span></th>
                <th style={{ width: '18%' }}>Data da revisão periódica<br/><span className="font-normal">Date of periodic survey</span></th>
                <th style={{ width: '12%' }}>Navio<br/><span className="font-normal">Ship</span></th>
                <th style={{ width: '12%' }}>N.º do relatório<br/><span className="font-normal">Report nº</span></th>
                <th style={{ width: '14%' }}>Rubrica e carimbo da Estação de Serviço<br/><span className="font-normal">Signature and stamp</span></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const inspecoes = inspecoesFiltradas;
                const rows = [];
                // First row: data de fabrico, certificado original
                rows.push(
                  <tr key="header">
                    <td style={{ fontSize: '6pt' }}>{data.dataFabrico ? new Date(data.dataFabrico).toLocaleDateString("pt-PT") : ''}</td>
                    <td></td>
                    <td style={{ fontSize: '6pt' }}>{data.certificadoNumeroOriginal || ''}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                );
                // Inspection rows
                for (let i = 0; i < 19; i++) {
                  const insp = inspecoes[i];
                  const dataInsp = insp?.dataInspecao ? new Date(insp.dataInspecao).toLocaleDateString("pt-PT") : '';
                  const proxInsp = insp?.dataProxInspecao ? new Date(insp.dataProxInspecao).toLocaleDateString("pt-PT") : '';
                  const navio = insp?.navioNome || (i <= 2 ? data.shipNameManual : '') || '';
                  const relatorio = insp?.certificadoNumero || insp?.numeroObra || (i === 0 ? data.ultimoCertificadoNumero : '') || '';
                  rows.push(
                    <tr key={i}>
                      <td style={{ fontSize: '6pt' }}></td>
                      <td style={{ fontSize: '6pt' }}></td>
                      <td style={{ fontSize: '6pt' }}></td>
                      <td style={{ fontSize: '6pt' }}>
                        {dataInsp || ''}
                        {proxInsp ? <div className="text-[5.5pt] text-slate-600">→ {proxInsp}</div> : ''}
                      </td>
                      <td style={{ fontSize: '6pt' }}>{navio}</td>
                      <td style={{ fontSize: '6pt' }}>{relatorio}</td>
                      <td style={{ fontSize: '6pt' }}></td>
                    </tr>
                  );
                }
                return rows;
              })()}
            </tbody>
          </table>
        </div>

        {/* Armadores */}
        <div className="row mt-3">
          <span className="label">Armadores / Owners:</span>
          <span className="val">{fmt(data.ownerDisplay)}</span>
        </div>
      </div>
    </div>
  );
}