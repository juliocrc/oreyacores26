'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, ClipboardCheck, Package, Ship, Anchor, Cylinder, ShieldAlert, Activity, Info, Printer, FileSpreadsheet, Edit, Save, X as XIcon, RotateCcw, ArrowLeftRight, MinusCircle, PlusCircle, AlertCircle } from 'lucide-react';
import { computeNextInspectionDate, needsThreeYearRule } from '../../lib/inspectionUtils';
import { formatDate, calculateQueda, formatMonthYear } from '@/lib/inspecao-detalhes-dialog-helpers';
import { formatValidityDisplay } from '@/lib/date-display';
import { fmtPeso } from '@/lib/liferaft-diagram-helpers';
import { buildWpDerivedValues, buildQuadroChecklistPayload } from '@/lib/quadro-payload';
import type { Inspecao, InspecaoDetalhesDialogProps } from '@/types/inspecao-detalhes-dialog';

export function InspecaoDetalhesDialog({
  inspecao,
  onClose,
}: InspecaoDetalhesDialogProps) {
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'geral' | 'cilindro' | 'artigos' | 'substituicoes' | 'checklist'>('geral');
  const [isEditing, setIsEditing] = useState(false);
  const [editNumeroObra, setEditNumeroObra] = useState(inspecao.numeroObra || '');
  const [saving, setSaving] = useState(false);

  // Compute next inspection date according to business rule
  const computedNextDate = computeNextInspectionDate(inspecao, snapshot?.brand);
  // Determine if the date was auto‑calculated
  const isAutoCalculated = !inspecao.dataProxInspecao && needsThreeYearRule(snapshot?.brand);

  const checklistSnapshot: Record<string, { status?: string; notes?: string; fotos?: string[] }> | null =
    inspecao.checklistSnapshot && typeof inspecao.checklistSnapshot === 'object'
      ? inspecao.checklistSnapshot
      : null;

  // Fetch previous inspection snapshot for comparison
  const fetchPreviousSnapshot = async () => {
    if (!inspecao.jangadaId) return;
    Promise.resolve().then(() => setLoadingPrev(true));
    try {
      // Get previous inspection for this jangada
      const res = await fetch(`/api/inspecoes/previous?jangadaId=${inspecao.jangadaId}&beforeDate=${inspecao.dataInspecao}`);
      if (res.ok) {
        const data = await res.json();
        if (data.prevCertificadoNumero) {
          const snapRes = await fetch(`/api/inspecoes/snapshot?certificadoNumero=${encodeURIComponent(data.prevCertificadoNumero)}`);
          if (snapRes.ok) {
            const snapData = await snapRes.json();
            setPrevSnapshot(snapData.snapshot);
          }
        }
      }
    } catch (err) {
      console.error("Error loading previous snapshot:", err);
    } finally {
      setLoadingPrev(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(fetchPreviousSnapshot);
  }, [inspecao.jangadaId, inspecao.dataInspecao]);

  const printFichaHistorica = () => {
    if (!snapshot) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita popups para poder imprimir.');
      return;
    }

    const pBruto = snapshot.cylinderPesoBruto ? parseFloat(snapshot.cylinderPesoBruto) : null;
    const tara = snapshot.cylinderTara ? parseFloat(snapshot.cylinderTara) : null;
    const co2 = snapshot.cylinderCo2 ? parseFloat(snapshot.cylinderCo2) : null;
    const n2 = snapshot.cylinderN2 ? parseFloat(snapshot.cylinderN2) : null;
    const soma = (tara || 0) + (co2 || 0) + (n2 || 0);
    const diffGrams = pBruto !== null ? Math.round((pBruto - soma) * 1000) : 0;
    const isWeightOk = Math.abs(diffGrams) <= 50;

    const artigosHtml = (snapshot.artigos || []).map((art: any) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 4px 8px; font-weight: 600; text-align: left;">${art.name}</td>
        <td style="padding: 4px 8px; text-align: left;">${art.referencia || '—'}</td>
        <td style="padding: 4px 8px; text-align: left;">${art.codigoFabricante || '—'}</td>
        <td style="padding: 4px 8px; text-align: center;">${art.quantidade}</td>
        <td style="padding: 4px 8px; font-weight: 600; text-align: left;">${art.validade ? formatValidityDisplay(art.validade) : '—'}</td>
      </tr>
    `).join('');

    const CHECKLIST_LABELS: Record<string, string> = {
      cobertura_exterior: 'Cobertura Exterior', saida_antena: 'Saída de Antena', refletores: 'Refletores',
      tubo_identificacao: 'Tubo de Identificação', costuras_juntas: 'Protectores de Juntas', camara_fundos: 'Câmara e Fundo',
      sistema_endireitar: 'Sistema de Endireitar', bolsas_estabilizacao: 'Bolsas de Estabilização', luz_exterior_bateria: 'Luz Exterior e Bateria',
      escada_borda: 'Rampa ou Escada', grinalda_espelhos: 'Grinalda e Espelhos', escada_entrada: 'Escada de Entrada',
      grinalda_interior: 'Grinalda Interior', anel_linha: 'Anel com Linha', faca_seguranca: 'Facas de Segurança',
      cobertura_interior: 'Cobertura Interior', fecho_cobertura: 'Fecho da Cobertura', colectores_agua: 'Colectores de Água',
      manual_instrucoes: 'Manual de Instruções', tecido_camara_fundo: 'Tecido de Câmara e Fundo', luz_interior_bateria: 'Luz Interior e Bateria',
    };

    const checklistSnap = (inspecao as any).checklistSnapshot || {};
    const fotoGroups = Object.entries(checklistSnap)
      .map(([key, value]: [string, any]) => ({ key, ...value }))
      .filter((item) => Array.isArray(item.fotos) && item.fotos.length > 0);
    const fotosHtml = fotoGroups.map((item) => `
      <div style="margin-bottom: 6px;">
        <div style="font-size: 8px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 4px;">
          ${CHECKLIST_LABELS[item.key] || item.key}${item.status ? ` (${item.status})` : ''} — ${item.fotos.length} foto(s)
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${item.fotos.map((f: string) => `<img src="${f}" style="width: 96px; height: 72px; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 4px;" />`).join('')}
        </div>
      </div>
    `).join('');

    const htmlContent = `
      <html>
        <head>
          <title>Ficha Histórica - Certificado ${inspecao.certificadoNumero || '—'}</title>
          <style>
            @page { size: A4 landscape; margin: 8mm; }
            body { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; color: #1e293b; margin: 0; line-height: 1.3; }
            .header { border-bottom: 2px solid #4f46e5; padding-bottom: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            .header h1 { font-size: 14px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .box { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; margin-bottom: 8px; }
            .box-title { background: #f8fafc; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-size: 8px; text-transform: uppercase; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
            td, th { padding: 3px 6px; text-align: left; }
            tr:not(:last-child) { border-bottom: 1px solid #f1f5f9; }
            .label { color: #64748b; font-weight: 600; width: 35%; text-align: left; }
            .val { font-weight: bold; color: #0f172a; text-align: left; }
            .val-highlight { font-weight: bold; color: #4f46e5; text-align: left; }
            
            /* Regras de ocultação do dossier (AGENTS.md) */
            .camara-sup-row, .camara-inf-row, .valvulas-alivio-row, .valvulas-atestar-row, .contentor-mod-row {
              display: none !important;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h1 style="margin: 0; font-size: 14px; font-weight: 900;">Ficha</h1>
              <span style="font-size: 7px; color: #94a3b8; font-weight: bold;">(Histórico da Vistoria)</span>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 8px; font-weight: bold;">Certificado nº: ${inspecao.certificadoNumero || 'Draft'}</div>
              <div style="font-size: 6px; color: #64748b;">Data da Inspeção: ${formatDate(inspecao.dataInspecao)} · ID Jangada: #${snapshot.id}</div>
            </div>
          </div>
          
          <div class="grid">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div class="box">
                <div class="box-title">1. Identificação da Jangada</div>
                <table>
                  <tbody>
                    <tr><td class="label">Marca</td><td class="val">${snapshot.brand || '—'}</td></tr>
                    <tr><td class="label">Modelo</td><td class="val">${snapshot.model || '—'}</td></tr>
                    <tr><td class="label">Nº Série</td><td class="val" style="font-family: monospace;">${snapshot.serial || '—'}</td></tr>
                    <tr><td class="label">Lotação</td><td class="val">${snapshot.capacity ? `${snapshot.capacity} P` : '—'}</td></tr>
                    <tr><td class="label">Tipo Pack</td><td class="val">${snapshot.packType || '—'}</td></tr>
                    <tr><td class="label">Fabricação</td><td class="val">${formatValidityDisplay(snapshot.dataFabrico)}</td></tr>
                    <tr><td class="label">Tipo Lançam.</td><td class="val">${snapshot.launchType || '—'}</td></tr>
                    <tr><td class="label">Alt. Lançam.</td><td class="val">${snapshot.maxStowageHeight ? `${snapshot.maxStowageHeight} m` : '—'}</td></tr>
                    <tr><td class="label">Navio</td><td class="val-highlight">${snapshot.shipNameManual || '—'}</td></tr>
                    <tr><td class="label">Proprietário</td><td class="val">${snapshot.owner || '—'}</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="box">
                <div class="box-title">3. Válvulas, Disparo & Extras</div>
                <table>
                  <tbody>
                    <tr><td class="label">Cabeça Disparo</td><td class="val">${snapshot.cylinderCabecaDisparoRef || '—'}</td></tr>
                    <tr><td class="label">Nº Série Disp.</td><td class="val">${snapshot.cylinderCabecaDisparoSerial || '—'}</td></tr>
                    <tr class="camara-sup-row"><td class="label">Câmara Sup.</td><td class="val">${snapshot.cylinderTuboCamaraSuperiorRef || '—'}</td></tr>
                    <tr class="camara-inf-row"><td class="label">Câmara Inf.</td><td class="val">${snapshot.cylinderTuboCamaraInferiorRef || '—'}</td></tr>
                    <tr class="valvulas-alivio-row"><td class="label">Válvulas Alívio</td><td class="val">${snapshot.valvulasAlivio || '—'}</td></tr>
                    <tr class="valvulas-atestar-row"><td class="label">Válvulas Atestar</td><td class="val">${snapshot.valvulasAtestar || '—'}</td></tr>
                    <tr class="contentor-mod-row"><td class="label">Contentor Mod.</td><td class="val">${snapshot.containerModel || '—'}</td></tr>
                    <tr><td class="label">Última Insp.</td><td class="val">${formatDate(inspecao.dataInspecao)}</td></tr>
                    <tr><td class="label">Próx. Insp.</td><td class="val" style="color: #4f46e5;">${formatDate(inspecao.dataProxInspecao)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div class="box">
                <div class="box-title">2. Cilindro & HRU</div>
                <table>
                  <tbody>
                    <tr><td class="label">Cilindro Série</td><td class="val" style="font-family: monospace;">${snapshot.cylinderSerial || '—'}</td></tr>
                    <tr><td class="label">Insuflação</td><td class="val">${snapshot.cylinderSistema || '—'}</td></tr>
                    <tr><td class="label">Bruto / Tara</td><td class="val">${fmtPeso(snapshot.cylinderPesoBruto, ' kg')} / ${fmtPeso(snapshot.cylinderTara, ' kg')}</td></tr>
                    <tr><td class="label">Gás CO2 / N2</td><td class="val">${fmtPeso(snapshot.cylinderCo2, ' kg')} / ${fmtPeso(snapshot.cylinderN2, ' kg')}</td></tr>
                    <tr><td class="label">Teste Hidráulico</td><td class="val">${snapshot.cylinderDataTeste ? formatDate(snapshot.cylinderDataTeste) : '—'}</td></tr>
                    <tr><td class="label">HRU Ref / Val</td><td class="val">${snapshot.hruReferencia || '—'} / ${formatValidityDisplay(snapshot.hruValidade)}</td></tr>
                    <tr><td class="label">Diferença Gás</td><td class="val" style="color: ${isWeightOk ? '#16a34a' : '#dc2626'}">${diffGrams}g (${isWeightOk ? 'Válido' : 'Fora de Tolerância'})</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="box">
                <div class="box-title">4. Ensaio WP (Pressão)</div>
                <table>
                  <tbody>
                    <tr><td class="label">Data Ensaio</td><td class="val">${snapshot.testeWP ? formatDate(snapshot.testeWP) : '—'}</td></tr>
                    <tr><td class="label">Horário</td><td class="val">${snapshot.testeWPHoraInicio || '—'} → ${snapshot.testeWPHoraFim || '—'}</td></tr>
                    <tr><td class="label">Câmara Superior</td><td class="val">${snapshot.testeWPCamaraSuperiorInicio || '—'} → ${snapshot.testeWPCamaraSuperiorFim || '—'} hPa (Queda: ${calculateQueda(snapshot.testeWPCamaraSuperiorInicio, snapshot.testeWPCamaraSuperiorFim)})</td></tr>
                    <tr><td class="label">Câmara Inferior</td><td class="val">${snapshot.testeWPCamaraInferiorInicio || '—'} → ${snapshot.testeWPCamaraInferiorFim || '—'} hPa (Queda: ${calculateQueda(snapshot.testeWPCamaraInferiorInicio, snapshot.testeWPCamaraInferiorFim)})</td></tr>
                    <tr><td class="label">Adicionais</td><td class="val" style="font-size: 7.5px;">NAP: ${snapshot.testeNAP || '—'} | FS: ${snapshot.testeFS || '—'} | GI: ${snapshot.testeGI || '—'} | DL: ${snapshot.testeDL || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="box" style="margin-top: 10px;">
            <div class="box-title">5. Consumíveis e Artigos Substituídos / Verificados</div>
            <table style="font-size: 7.5px;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-weight: bold; color: #475569;">
                  <th style="padding: 4px 8px; text-align: left;">Designação</th>
                  <th style="padding: 4px 8px; text-align: left;">Referência</th>
                  <th style="padding: 4px 8px; text-align: left;">Lote</th>
                  <th style="padding: 4px 8px; text-align: center;">Qtd.</th>
                  <th style="padding: 4px 8px; text-align: left;">Validade</th>
                </tr>
              </thead>
              <tbody>
                ${artigosHtml || '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 10px;">Nenhum artigo registado nesta vistoria.</td></tr>'}
              </tbody>
            </table>
          </div>

          ${fotoGroups.length > 0 ? `
          <div class="box" style="margin-top: 10px; page-break-inside: avoid;">
            <div class="box-title">6. Evidências Fotográficas do Checklist</div>
            ${fotosHtml}
          </div>
          ` : ''}

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSaveNumeroObra = async () => {
    if (!editNumeroObra.trim() && !inspecao.numeroObra) {
      alert('Por favor, insira um número de obra ou deixe vazio explicitamente.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/inspecoes?id=${inspecao.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroObra: editNumeroObra.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao atualizar número de obra');
      }
      setIsEditing(false);
      // Update local state
      if (snapshot) {
        setSnapshot({ ...snapshot, numeroObra: editNumeroObra.trim() || null });
      }
      // Also update the inspecao prop locally for display
      // Note: In a real app, you'd want to trigger a refetch or use a state management solution
      alert('Número de obra atualizado com sucesso!');
    } catch (err: any) {
      alert('Erro ao guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const buildHistoricalChecklistPayload = () => {
    return buildQuadroChecklistPayload({
      inspectionChecklistValues: snapshot?.inspectionChecklistValues || {},
      artigos: snapshot?.artigos || inspecao.artigos || [],
      prevArtigos: prevSnapshot?.artigos || snapshot?.artigos || inspecao.artigos || [],
      testeWP: snapshot?.testeWP || inspecao.testeWP,
      testeNAP: snapshot?.testeNAP,
      testeFS: snapshot?.testeFS,
      testeGI: snapshot?.testeGI,
      testeDL: snapshot?.testeDL,
      hruValidade: snapshot?.hruValidade,
      dataInspecao: snapshot?.dataInspecao || inspecao.dataInspecao,
      cylinderDataTeste: snapshot?.cylinderDataTeste,
    });
  };

  const handleExportCertificadoExcel = async () => {
    if (!snapshot) return;
    try {
      let linkedShip: any = null;
      if (snapshot.shipId) {
        try {
          const shipRes = await fetch(`/api/navios/${snapshot.shipId}`);
          if (shipRes.ok) linkedShip = await shipRes.json();
        } catch {}
      }

      const payload = {
        certNumber: inspecao.certificadoNumero || '',
        inspectionDate: inspecao.dataInspecao || '',
        nextInspectionDate: inspecao.dataProxInspecao || '',
        shipName: snapshot.shipNameManual || linkedShip?.nome || '',
        shipFlag: linkedShip?.bandeira || '',
        shipImo: linkedShip?.imo || '',
        shipCallSign: linkedShip?.callSignal || '',
        owner: linkedShip?.cliente?.nome || snapshot.owner || '',
        brand: snapshot.brand || '',
        raftModel: snapshot.model || '',
        raftCapacity: snapshot.capacity || '',
        raftSerial: snapshot.serial || '',
        manufactureDate: snapshot.dataFabrico || '',
        fabricType: snapshot.fabricType || '',
        painterLength: snapshot.painterLength || '',
        maxStowageHeight: snapshot.maxStowageHeight || '',
        cylinderSerial: snapshot.cylinderSerial || '',
        cylinderCo2: snapshot.cylinderCo2 || '',
        cylinderN2: snapshot.cylinderN2 || '',
        cylinderHydroTestDate: snapshot.cylinderDataTeste || '',
        packType: snapshot.packType || '',
        hruReference: snapshot.hruReferencia || '',
        hruExpiry: snapshot.hruValidade || '',
        radarReflector: snapshot.radarReflector || '',
        radarReflectorExpiry: snapshot.radarReflectorValidade || '',
        technician: inspecao.responsavel || 'Técnico Autorizado',
        status: inspecao.status || 'Concluída',
        checklist: buildHistoricalChecklistPayload()
      };

      const res = await fetch('/api/certificados/orey?format=xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao gerar o certificado');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.certNumber} ${payload.shipName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert('Erro ao exportar certificado histórico: ' + error.message);
    }
  };

  const handleExportQuadroExcel = async () => {
    if (!snapshot) return;
    try {
      const derivedWp = buildWpDerivedValues({
        pressureUnit: snapshot.testeWPUnidadePressao,
        startTime: snapshot.testeWPHoraInicio,
        tempInitial: snapshot.testeWPTemperaturaInicial,
        tempFinal: snapshot.testeWPTemperaturaFinal,
        baroInitial: snapshot.testeWPPressaoAtmosfericaInicial,
        baroFinal: snapshot.testeWPPressaoAtmosfericaFinal,
        upperStart: snapshot.testeWPCamaraSuperiorInicio,
        upperEnd: snapshot.testeWPCamaraSuperiorFim,
        lowerStart: snapshot.testeWPCamaraInferiorInicio,
        lowerEnd: snapshot.testeWPCamaraInferiorFim,
      });

      const payload = {
        numeroObra: snapshot.numeroObra || inspecao.numeroObra || '',
        certNumber: inspecao.certificadoNumero || '',
        inspectionDate: inspecao.dataInspecao || '',
        nextInspectionDate: inspecao.dataProxInspecao || '',
        shipName: snapshot.shipNameManual || '',
        brand: snapshot.brand || '',
        raftModel: snapshot.model || '',
        raftCapacity: snapshot.capacity || '',
        raftSerial: snapshot.serial || '',
        manufactureDate: snapshot.dataFabrico || '',
        cylinderSerial: snapshot.cylinderSerial || '',
        cylinderGrossWeight: snapshot.cylinderPesoBruto || '',
        cylinderTara: snapshot.cylinderTara || '',
        cylinderTare: snapshot.cylinderTara || '',
        cylinderCo2: snapshot.cylinderCo2 || '',
        cylinderN2: snapshot.cylinderN2 || '',
        cylinderHydroTestDate: snapshot.cylinderDataTeste || '',
        packType: snapshot.packType || '',
        pressureUnit: snapshot.testeWPUnidadePressao || 'inh2o',
        tempInitial: snapshot.testeWPTemperaturaInicial || '',
        tempFinal: snapshot.testeWPTemperaturaFinal || '',
        baroInitial: snapshot.testeWPPressaoAtmosfericaInicial || '',
        baroFinal: snapshot.testeWPPressaoAtmosfericaFinal || '',
        wpStartTime: snapshot.testeWPHoraInicio || '',
        wpEndTime: snapshot.testeWPHoraFim || '',
        wpUpperStart: snapshot.testeWPCamaraSuperiorInicio || '',
        wpUpperEnd: snapshot.testeWPCamaraSuperiorFim || '',
        wpUpperCorrected: derivedWp.upper.correctedEndDisplay || '',
        wpUpperDrop: derivedWp.upper.dropDisplay || '',
        wpUpperDropPercent: derivedWp.upper.dropPercentDisplay || '',
        wpLowerStart: snapshot.testeWPCamaraInferiorInicio || '',
        wpLowerEnd: snapshot.testeWPCamaraInferiorFim || '',
        wpLowerCorrected: derivedWp.lower.correctedEndDisplay || '',
        wpLowerDrop: derivedWp.lower.dropDisplay || '',
        wpLowerDropPercent: derivedWp.lower.dropPercentDisplay || '',
        napTestDone: snapshot.testeNAP || '',
        fsTestDone: snapshot.testeFS || '',
        giTestDone: snapshot.testeGI || '',
        dlTestDone: snapshot.testeDL || '',
        checklist: buildHistoricalChecklistPayload(),
        substituicoes: (snapshot?.artigos || inspecao.artigos || []).map((art: any) => ({
          descricao: art.name,
          referencia: art.referencia || undefined,
          quantidade: art.quantidade,
          validade: art.validade || undefined,
          codigoFabricante: art.codigoFabricante || undefined,
        })),
      };

      const res = await fetch('/api/exportar-raft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao gerar o quadro');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const inspectionDate = new Date(payload.inspectionDate);
      const month = String(inspectionDate.getMonth() + 1).padStart(2, '0');
      const year = inspectionDate.getFullYear();
      const monthYear = `${month} ${year}`;
      a.download = `${payload.raftSerial} ${payload.raftModel} ${payload.raftCapacity}P (${monthYear}).xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert('Erro ao exportar quadro histórico: ' + error.message);
    }
  };

  const handleExportQuadroPDF = async () => {
    if (!snapshot) return;
    try {
      const derivedWp = buildWpDerivedValues({
        pressureUnit: snapshot.testeWPUnidadePressao,
        startTime: snapshot.testeWPHoraInicio,
        tempInitial: snapshot.testeWPTemperaturaInicial,
        tempFinal: snapshot.testeWPTemperaturaFinal,
        baroInitial: snapshot.testeWPPressaoAtmosfericaInicial,
        baroFinal: snapshot.testeWPPressaoAtmosfericaFinal,
        upperStart: snapshot.testeWPCamaraSuperiorInicio,
        upperEnd: snapshot.testeWPCamaraSuperiorFim,
        lowerStart: snapshot.testeWPCamaraInferiorInicio,
        lowerEnd: snapshot.testeWPCamaraInferiorFim,
      });

      const payload = {
        numeroObra: snapshot.numeroObra || inspecao.numeroObra || '',
        certNumber: inspecao.certificadoNumero || '',
        inspectionDate: inspecao.dataInspecao || '',
        nextInspectionDate: inspecao.dataProxInspecao || '',
        shipName: snapshot.shipNameManual || '',
        brand: snapshot.brand || '',
        raftModel: snapshot.model || '',
        raftCapacity: snapshot.capacity || '',
        raftSerial: snapshot.serial || '',
        manufactureDate: snapshot.dataFabrico || '',
        cylinderSerial: snapshot.cylinderSerial || '',
        cylinderGrossWeight: snapshot.cylinderPesoBruto || '',
        cylinderTara: snapshot.cylinderTara || '',
        cylinderTare: snapshot.cylinderTara || '',
        cylinderCo2: snapshot.cylinderCo2 || '',
        cylinderN2: snapshot.cylinderN2 || '',
        cylinderHydroTestDate: snapshot.cylinderDataTeste || '',
        packType: snapshot.packType || '',
        pressureUnit: snapshot.testeWPUnidadePressao || 'inh2o',
        tempInitial: snapshot.testeWPTemperaturaInicial || '',
        tempFinal: snapshot.testeWPTemperaturaFinal || '',
        baroInitial: snapshot.testeWPPressaoAtmosfericaInicial || '',
        baroFinal: snapshot.testeWPPressaoAtmosfericaFinal || '',
        wpStartTime: snapshot.testeWPHoraInicio || '',
        wpEndTime: snapshot.testeWPHoraFim || '',
        wpUpperStart: snapshot.testeWPCamaraSuperiorInicio || '',
        wpUpperEnd: snapshot.testeWPCamaraSuperiorFim || '',
        wpUpperCorrected: derivedWp.upper.correctedEndDisplay || '',
        wpUpperDrop: derivedWp.upper.dropDisplay || '',
        wpUpperDropPercent: derivedWp.upper.dropPercentDisplay || '',
        wpLowerStart: snapshot.testeWPCamaraInferiorInicio || '',
        wpLowerEnd: snapshot.testeWPCamaraInferiorFim || '',
        wpLowerCorrected: derivedWp.lower.correctedEndDisplay || '',
        wpLowerDrop: derivedWp.lower.dropDisplay || '',
        wpLowerDropPercent: derivedWp.lower.dropPercentDisplay || '',
        napTestDone: snapshot.testeNAP || '',
        fsTestDone: snapshot.testeFS || '',
        giTestDone: snapshot.testeGI || '',
        dlTestDone: snapshot.testeDL || '',
        checklist: buildHistoricalChecklistPayload(),
        substituicoes: (snapshot?.artigos || inspecao.artigos || []).map((art: any) => ({
          descricao: art.name,
          referencia: art.referencia || undefined,
          quantidade: art.quantidade,
          validade: art.validade || undefined,
          codigoFabricante: art.codigoFabricante || undefined,
        })),
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
    } catch (error: any) {
      alert('Erro ao exportar quadro histórico PDF: ' + error.message);
    }
  };

  useEffect(() => {
    if (!inspecao.certificadoNumero) return;
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/inspecoes/snapshot?certificadoNumero=${encodeURIComponent(inspecao.certificadoNumero)}`)
      .then(res => res.json())
      .then(data => {
        if (data.snapshot) {
          setSnapshot(data.snapshot);
        }
      })
      .catch(err => console.error("Error loading snapshot:", err))
      .finally(() => setLoading(false));
  }, [inspecao.certificadoNumero]);

  // Use snapshot articles if available, otherwise fall back to inspection articles
  const artigos = snapshot?.artigos || inspecao.artigos || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardCheck className="text-indigo-650" size={22} />
              Detalhes da Inspeção
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Histórico completo com os dados e componentes da jangada tal como estavam na data desta inspeção.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {snapshot && (
              <>
                {!isEditing ? (
                  <button
                    onClick={() => { setIsEditing(true); setEditNumeroObra(snapshot.numeroObra || inspecao.numeroObra || ''); }}
                    title="Editar Número de Obra"
                    className="text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-medium"
                  >
                    <Edit size={15} />
                    <span>Editar Nº Obra</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSaveNumeroObra}
                      disabled={saving}
                      title="Guardar Número de Obra"
                      className="text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-emerald-200 shadow-sm disabled:opacity-50 mr-0.5"
                    >
                      <Save size={15} />
                      <span>Guardar</span>
                    </button>
                    <button
                      onClick={() => { setIsEditing(false); setEditNumeroObra(inspecao.numeroObra || ''); }}
                      disabled={saving}
                      title="Cancelar"
                      className="text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-medium disabled:opacity-50 mr-0.5"
                    >
                      <XIcon size={15} />
                      <span>Cancelar</span>
                    </button>
                  </>
                )}
                <button
                  onClick={handleExportCertificadoExcel}
                  title="Exportar Certificado Histórico em Excel"
                  className="text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-emerald-200 shadow-sm mr-0.5"
                >
                  <FileSpreadsheet size={15} />
                  <span>Certificado Excel</span>
                </button>
                <button
                  onClick={handleExportQuadroExcel}
                  title="Exportar Quadro de Inspeção Histórico em Excel"
                  className="text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-teal-200 shadow-sm mr-0.5"
                >
                  <FileSpreadsheet size={15} />
                  <span>Quadro Excel</span>
                </button>
                <button
                  onClick={handleExportQuadroPDF}
                  title="Exportar Quadro de Inspeção Histórico em PDF"
                  className="text-red-700 hover:text-red-900 hover:bg-red-50 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-red-200 shadow-sm mr-0.5"
                >
                  <FileSpreadsheet size={15} />
                  <span>Quadro PDF</span>
                </button>
                <button
                  onClick={printFichaHistorica}
                  title="Imprimir Ficha Histórica"
                  className="text-indigo-650 hover:text-indigo-850 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-indigo-150 shadow-sm mr-1"
                >
                  <Printer size={15} />
                  <span>Imprimir Ficha</span>
                </button>
              </>
            )}
            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-slate-650 hover:bg-slate-50 p-1.5 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        {snapshot && (
          <div className="flex bg-slate-50 border-b border-slate-100 px-6 pt-2 gap-2">
            {[
              { id: 'geral', label: 'Dados da Jangada', icon: Anchor },
              { id: 'cilindro', label: 'Cilindro & Ensaios (WP)', icon: Cylinder },
              { id: 'artigos', label: 'Artigos no Pack', icon: Package },
              { id: 'substituicoes', label: 'Histórico Substituições', icon: RotateCcw },
              ...(checklistSnapshot ? [{ id: 'checklist', label: 'Checklist & Fotos', icon: ClipboardCheck }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  activeSubTab === tab.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-850'
                }`}
              >
                <tab.icon size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6 text-left flex-1 overflow-y-auto">
          {/* Main Inspection Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificado Nº</span>
              <p className="font-bold text-slate-800 mt-0.5">{inspecao.certificadoNumero || 'Draft / Não emitido'}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data de Inspeção</span>
              <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                {formatDate(inspecao.dataInspecao)}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próxima Inspeção</span>
              <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                {formatDate(computedNextDate)}
                {isAutoCalculated && (
                  <span title="Data calculada automaticamente – 3 anos">
                    <Info size={14} className="text-slate-500 ml-1" />
                  </span>
                )}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado</span>
              <div className="mt-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  inspecao.status === 'Concluída' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : inspecao.status === 'Draft'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                }`}>
                  {inspecao.status}
                </span>
              </div>
            </div>
          </div>

          {inspecao.responsavel && (
            <div className="text-sm text-slate-650 bg-indigo-50/40 border border-indigo-100/20 rounded-2xl p-4">
              <span>Técnico Responsável: <strong className="text-indigo-950 font-bold">{inspecao.responsavel}</strong></span>
            </div>
          )}

          {/* Linha Temporal do Ciclo de Vida */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <Calendar size={16} className="text-slate-500" />
              Linha Temporal do Ciclo de Vida
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(() => {
                const statusColor = (s: string) =>
                  s === 'Concluída' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : s === 'Draft' ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200';

                const events: Array<{ label: string; date: string; sub?: string; active?: boolean; badge?: boolean; pending?: boolean }> = [];

                if (prevSnapshot?.dataInspecao) {
                  events.push({
                    label: 'Vistoria Anterior',
                    date: formatDate(prevSnapshot.dataInspecao),
                    sub: prevSnapshot.certificadoNumero || 'Cert. anterior',
                  });
                }
                if (snapshot?.testeWP) {
                  events.push({
                    label: 'Ensaio de Pressão (WP)',
                    date: formatDate(snapshot.testeWP),
                    sub: snapshot.testeWPHoraInicio ? `${snapshot.testeWPHoraInicio} → ${snapshot.testeWPHoraFim || '—'}` : 'Realizado',
                  });
                }
                events.push({
                  label: 'Última Inspeção',
                  date: formatDate(inspecao.dataInspecao),
                  sub: `${inspecao.status}${inspecao.responsavel ? ` · ${inspecao.responsavel}` : ''}`,
                  active: true,
                  badge: true,
                });
                if (inspecao.certificadoNumero) {
                  events.push({
                    label: 'Certificado Emitido',
                    date: formatDate(inspecao.dataInspecao),
                    sub: `Nº ${inspecao.certificadoNumero}`,
                  });
                }
                events.push({
                  label: 'Próxima Vistoria',
                  date: formatDate(computedNextDate) || '—',
                  sub: inspecao.dataProxInspecao ? 'Agendada' : 'A calcular (3 anos)',
                  pending: true,
                });

                return events.map((ev, i) => (
                  <div
                    key={i}
                    className={`relative rounded-xl border p-3 ${ev.active ? 'border-indigo-200 bg-indigo-50/50' : ev.pending ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-white'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        ev.active ? 'bg-indigo-600' : ev.pending ? 'bg-slate-400' : i === 0 && !prevSnapshot ? 'bg-slate-200' : 'bg-emerald-500'
                      }`} />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ev.label}</p>
                    </div>
                    <p className="text-sm font-black text-slate-800 mt-1.5">{ev.date}</p>
                    {ev.sub && (
                      <p className="text-[11px] text-slate-500 font-medium truncate">{ev.sub}</p>
                    )}
                    {ev.badge && inspecao.status && (
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusColor(inspecao.status)}`}>
                        {inspecao.status}
                      </span>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Conditional Sub-Tabs content based on snapshot loading */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 font-medium">Carregando dados históricos...</div>
          ) : snapshot ? (
            <>
              {activeSubTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
                  {/* General specs */}
                  <div className="bg-white border border-slate-150 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Anchor size={16} className="text-slate-500" />
                      <span>Características Gerais</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-400 block">Marca / Modelo</span>
                        <span className="font-semibold text-slate-800">{snapshot.brand} / {snapshot.model}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Nº de Série</span>
                        <span className="font-semibold text-slate-800">{snapshot.serial}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Lotação (Pessoas)</span>
                        <span className="font-semibold text-slate-800">{snapshot.capacity} pax</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Tipo de Pack</span>
                        <span className="font-semibold text-slate-800">Pack {snapshot.packType || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Data de Fabrico</span>
                        <span className="font-semibold text-slate-800">{formatMonthYear(snapshot.dataFabrico)}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Tipo de Tecido</span>
                        <span className="font-semibold text-slate-800">{snapshot.fabricType || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vessel specs */}
                  <div className="bg-white border border-slate-150 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Ship size={16} className="text-slate-550" />
                      <span>Embarcação & Armador</span>
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-xs text-slate-400 block">Navio Associado</span>
                        <span className="font-semibold text-slate-800">{snapshot.shipNameManual || 'Sem navio associado'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Proprietário / Armador</span>
                        <span className="font-semibold text-slate-800">{snapshot.owner || '—'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-slate-400 block">Tipo de Lançamento</span>
                          <span className="font-semibold text-slate-800">{snapshot.launchType || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block">Número de Obra</span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editNumeroObra}
                              onChange={(e) => setEditNumeroObra(e.target.value)}
                              className="w-full border border-indigo-300 bg-indigo-50 rounded-xl px-3 py-2 text-sm font-mono font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="Ex: OB-2026/04"
                              autoFocus
                            />
                          ) : (
                            <span className="font-semibold text-indigo-700 font-bold">{snapshot.numeroObra || (inspecao as any).numeroObra || '—'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === 'cilindro' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
                  {/* Cylinder Info */}
                  <div className="bg-white border border-slate-150 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Cylinder size={16} className="text-slate-550" />
                      <span>Cilindro de Insuflação</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-400 block">Nº de Série</span>
                        <span className="font-semibold text-slate-800">{snapshot.cylinderSerial || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Sistema</span>
                        <span className="font-semibold text-slate-800">{snapshot.cylinderSistema || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Peso Bruto / Tara</span>
                        <span className="font-semibold text-slate-800">
                          {fmtPeso(snapshot.cylinderPesoBruto, ' kg')} / {fmtPeso(snapshot.cylinderTara, ' kg')}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Carga Gás (CO2 / N2)</span>
                        <span className="font-semibold text-slate-800">
                          {fmtPeso(snapshot.cylinderCo2, ' kg')} / {fmtPeso(snapshot.cylinderN2, ' kg')}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-slate-400 block">Data do Teste Hidráulico</span>
                        <span className="font-semibold text-slate-800">{snapshot.cylinderDataTeste ? formatDate(snapshot.cylinderDataTeste) : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* WP Test Info */}
                  <div className="bg-white border border-slate-150 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Activity size={16} className="text-slate-550" />
                      <span>Ensaio WP (Pressão de Trabalho)</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-400 block">Realizado Em</span>
                        <span className="font-semibold text-slate-800">{snapshot.testeWP ? formatDate(snapshot.testeWP) : '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Horário</span>
                        <span className="font-semibold text-slate-800">
                          {snapshot.testeWPHoraInicio || '—'} às {snapshot.testeWPHoraFim || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Queda Câmara Sup.</span>
                        <span className="font-semibold text-slate-850">
                          {snapshot.testeWPCamaraSuperiorInicio ? `${snapshot.testeWPCamaraSuperiorInicio} → ${snapshot.testeWPCamaraSuperiorFim}` : '—'}
                          {snapshot.testeWPCamaraSuperiorInicio && snapshot.testeWPCamaraSuperiorFim ? ` (Queda: ${calculateQueda(snapshot.testeWPCamaraSuperiorInicio, snapshot.testeWPCamaraSuperiorFim)})` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block">Queda Câmara Inf.</span>
                        <span className="font-semibold text-slate-850">
                          {snapshot.testeWPCamaraInferiorInicio ? `${snapshot.testeWPCamaraInferiorInicio} → ${snapshot.testeWPCamaraInferiorFim}` : '—'}
                          {snapshot.testeWPCamaraInferiorInicio && snapshot.testeWPCamaraInferiorFim ? ` (Queda: ${calculateQueda(snapshot.testeWPCamaraInferiorInicio, snapshot.testeWPCamaraInferiorFim)})` : ''}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-slate-400 block">Testes Adicionais</span>
                        <span className="font-semibold text-slate-700 text-xs block">
                          NAP: {snapshot.testeNAP || '—'} | FS: {snapshot.testeFS || '—'} | GI: {snapshot.testeGI || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === 'artigos' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Package size={16} className="text-slate-500" />
                    <span>Consumíveis do Pack no Momento da Inspeção ({artigos.length})</span>
                  </h3>
                  <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                          <th className="px-5 py-3.5">Artigo / Peça</th>
                          <th className="px-5 py-3.5">Referência</th>
                          <th className="px-5 py-3.5">Cód. Fabr.</th>
                          <th className="px-5 py-3.5 text-center">Quantidade</th>
                          <th className="px-5 py-3.5 text-center" title="Quantidade registada na inspeção anterior (substituída nesta inspeção)">Qtd Subst.</th>
                          <th className="px-5 py-3.5">Validade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {artigos.map((artigo: any) => {
                          const prevItem = (prevSnapshot?.artigos || []).find((art: any) =>
                            (art.referencia && artigo.referencia && art.referencia === artigo.referencia) ||
                            (art.name && art.name === artigo.name)
                          );
                          const qtdSubstituida = prevItem ? Number(prevItem.quantidade || 0) : 0;
                          return (
                            <tr key={artigo.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3 font-semibold text-slate-800">{artigo.name}</td>
                              <td className="px-5 py-3 font-mono text-xs text-slate-500">{artigo.referencia || '—'}</td>
                              <td className="px-5 py-3 text-slate-500">{artigo.codigoFabricante || '—'}</td>
                              <td className="px-5 py-3 text-center font-bold text-slate-700">{artigo.quantidade}</td>
                              <td className="px-5 py-3 text-center">
                                {qtdSubstituida > 0 ? (
                                  <span className="font-bold text-indigo-600">{qtdSubstituida}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-600 font-semibold">{formatMonthYear(artigo.validade)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === 'substituicoes' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <RotateCcw size={16} className="text-slate-500" />
                    <span>Histórico de Substituições vs Inspeção Anterior</span>
                  </h3>
                  
                  {loadingPrev ? (
                    <div className="text-center py-8 text-slate-500">Carregando inspeção anterior...</div>
                  ) : !prevSnapshot ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                      <ArrowLeftRight className="mx-auto text-slate-300 mb-2" size={32} />
                      <p className="font-semibold text-slate-700">Nenhuma inspeção anterior encontrada</p>
                      <p className="text-xs text-slate-500 mt-1">Esta é a primeira inspeção registrada para esta jangada no sistema.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                        <p className="text-xs text-blue-800 flex items-center gap-1">
                          <Info size={14} />
                          Comparando com inspeção de <strong>{formatDate(prevSnapshot.dataInspecao)}</strong> (Cert. <strong>{inspecao.certificadoNumero}</strong>)
                        </p>
                      </div>
                      
                      {/* Comparison Table */}
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                        <table className="w-full text-left border-collapse bg-white">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                              <th className="px-4 py-3">Artigo</th>
                              <th className="px-4 py-3 text-center">Inspeção Anterior</th>
                              <th className="px-4 py-3 text-center">Inspeção Atual</th>
                              <th className="px-4 py-3 text-center">Alteração</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {(() => {
                              const prevArtigos = prevSnapshot.artigos || [];
                              const currArtigos = artigos;
                              
                              // Create maps by name for comparison
                              const prevMap: Map<string, any> = new Map(prevArtigos.map((a: any) => [a.name.toLowerCase(), a]));
                              const currMap: Map<string, any> = new Map(currArtigos.map((a: any) => [a.name.toLowerCase(), a]));
                              
                              // Get all unique article names
                              const allNames = new Set([...prevMap.keys(), ...currMap.keys()]);
                              
                              return Array.from(allNames).map(name => {
                                const prev = prevMap.get(name);
                                const curr = currMap.get(name);
                                
                                if (!prev && curr) {
                                  // New article
                                  return (
                                    <tr key={`new-${name}`} className="bg-emerald-50 hover:bg-emerald-100/50">
                                      <td className="px-4 py-3 font-semibold text-emerald-800 flex items-center gap-2">
                                        <PlusCircle className="text-emerald-600" size={16} />
                                        {curr.name}
                                      </td>
                                      <td className="px-4 py-3 text-center text-slate-400">—</td>
                                      <td className="px-4 py-3 text-center">
                                        <div className="font-mono text-xs text-slate-500">{curr.referencia || '—'}</div>
                                        <div className="text-slate-600 font-semibold">{formatMonthYear(curr.validade)}</div>
                                        <div className="text-slate-500 text-center">Qtd: {curr.quantidade}</div>
                                      </td>
                                      <td className="px-4 py-3 text-center text-emerald-700 font-bold">
                                        <span className="flex items-center justify-center gap-1">
                                          <PlusCircle size={14} /> NOVO
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                }
                                
                                if (prev && !curr) {
                                  // Removed article
                                  return (
                                    <tr key={`removed-${name}`} className="bg-red-50 hover:bg-red-100/50">
                                      <td className="px-4 py-3 font-semibold text-red-800 flex items-center gap-2">
                                        <MinusCircle className="text-red-600" size={16} />
                                        {prev.name}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <div className="font-mono text-xs text-slate-500">{prev.referencia || '—'}</div>
                                        <div className="text-slate-600 font-semibold">{formatMonthYear(prev.validade)}</div>
                                        <div className="text-slate-500 text-center">Qtd: {prev.quantidade}</div>
                                      </td>
                                      <td className="px-4 py-3 text-center text-slate-400">—</td>
                                      <td className="px-4 py-3 text-center text-red-700 font-bold">
                                        <span className="flex items-center justify-center gap-1">
                                          <MinusCircle size={14} /> REMOVIDO
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                }
                                
                                // Both exist - compare
                                const refChanged = prev.referencia !== curr.referencia;
                                const validadeChanged = prev.validade !== curr.validade;
                                const qtdChanged = prev.quantidade !== curr.quantidade;
                                const loteChanged = prev.codigoFabricante !== curr.codigoFabricante;
                                
                                const hasChanges = refChanged || validadeChanged || qtdChanged || loteChanged;
                                
                                return (
                                  <tr key={`compare-${name}`} className={hasChanges ? 'bg-amber-50 hover:bg-amber-100/50' : 'hover:bg-slate-50/50'}>
                                    <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                                      {hasChanges && <AlertCircle className="text-amber-600" size={16} />}
                                      {curr.name}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="font-mono text-xs text-slate-500">{prev.referencia || '—'}</div>
                                      <div className="text-slate-600 font-semibold">{formatMonthYear(prev.validade)}</div>
                                      <div className="text-slate-500 text-center">Qtd: {prev.quantidade}</div>
                                      {prev.codigoFabricante && <div className="text-xs text-slate-400">Lote: {prev.codigoFabricante}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className={`font-mono text-xs ${refChanged ? 'text-blue-700 font-bold' : 'text-slate-500'}`}>{curr.referencia || '—'}</div>
                                      <div className={`${validadeChanged ? 'text-blue-700 font-bold' : 'text-slate-600 font-semibold'}`}>{formatMonthYear(curr.validade)}</div>
                                      <div className={`${qtdChanged ? 'text-blue-700 font-bold' : 'text-slate-500'} text-center`}>Qtd: {curr.quantidade}</div>
                                      {curr.codigoFabricante && <div className={`text-xs ${loteChanged ? 'text-blue-700 font-bold' : 'text-slate-400'}`}>Lote: {curr.codigoFabricante}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {hasChanges ? (
                                        <div className="flex flex-col items-center gap-1">
                                          {refChanged && <span className="text-blue-700 text-xs font-bold flex items-center gap-1"><ArrowLeftRight size={10} /> Ref</span>}
                                          {validadeChanged && <span className="text-blue-700 text-xs font-bold flex items-center gap-1"><Calendar size={10} /> Val</span>}
                                          {qtdChanged && <span className="text-blue-700 text-xs font-bold flex items-center gap-1"><RotateCcw size={10} /> Qtd</span>}
                                          {loteChanged && <span className="text-blue-700 text-xs font-bold flex items-center gap-1"><ArrowLeftRight size={10} /> Lote</span>}
                                        </div>
                                      ) : (
                                        <span className="text-emerald-600 text-xs font-bold">✓ Sem alterações</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        {(() => {
                          const prevArtigos = prevSnapshot.artigos || [];
                          const currArtigos = artigos;
                          const prevMap: Map<string, any> = new Map(prevArtigos.map((a: any) => [a.name.toLowerCase(), a]));
                          const currMap: Map<string, any> = new Map(currArtigos.map((a: any) => [a.name.toLowerCase(), a]));
                          const allNames = new Set([...prevMap.keys(), ...currMap.keys()]);
                          
                          let novos = 0, removidos = 0, alterados = 0, iguais = 0;
                          
                          allNames.forEach(name => {
                            const prev = prevMap.get(name);
                            const curr = currMap.get(name);
                            
                            if (!prev && curr) novos++;
                            else if (prev && !curr) removidos++;
                            else {
                              const refChanged = prev.referencia !== curr.referencia;
                              const validadeChanged = prev.validade !== curr.validade;
                              const qtdChanged = prev.quantidade !== curr.quantidade;
                              const loteChanged = prev.codigoFabricante !== curr.codigoFabricante;
                              
                              if (refChanged || validadeChanged || qtdChanged || loteChanged) alterados++;
                              else iguais++;
                            }
                          });
                          
                          return (
                            <>
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-emerald-700">{novos}</p>
                                <p className="text-xs text-emerald-800">Novos</p>
                              </div>
                              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-red-700">{removidos}</p>
                                <p className="text-xs text-red-800">Removidos</p>
                              </div>
                              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-amber-700">{alterados}</p>
                                <p className="text-xs text-amber-800">Alterados</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeSubTab === 'checklist' && checklistSnapshot && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <ClipboardCheck size={16} className="text-slate-500" />
                    <span>Checklist de Inspeção ({Object.keys(checklistSnapshot).length} itens)</span>
                  </h3>

                  {(() => {
                    const counts: Record<string, number> = {};
                    Object.values(checklistSnapshot).forEach((v) => {
                      const s = v?.status || '—';
                      counts[s] = (counts[s] || 0) + 1;
                    });
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(counts).map(([s, n]) => (
                          <div key={s} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                            <p className="text-xl font-black text-slate-800">{n}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="space-y-2.5">
                    {Object.entries(checklistSnapshot).map(([itemId, item]) => {
                      const status = item?.status || '';
                      const statusColor =
                        status === 'OK'
                          ? 'bg-emerald-100 text-emerald-800'
                          : status === 'REPROVADO'
                            ? 'bg-red-100 text-red-800'
                            : status === 'SUBSTITUIDO'
                              ? 'bg-sky-100 text-sky-800'
                              : status === 'NA'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-amber-100 text-amber-800';
                      const fotos = Array.isArray(item?.fotos) ? item!.fotos : [];
                      return (
                        <div key={itemId} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-bold text-slate-800">{itemId}</p>
                            {status && <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${statusColor}`}>{status}</span>}
                          </div>
                          {item?.notes && <p className="mt-1 text-xs text-slate-600">{item.notes}</p>}
                          {fotos.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {fotos.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer" title="Abrir foto de evidência">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`Evidência ${i + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover shadow-sm" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Fallback for older inspections (no snapshot available)
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-xs flex items-start gap-2">
                <ShieldAlert className="text-amber-605" size={18} />
                <div>
                  <p className="font-bold">Dados parciais (Inspeção Legada)</p>
                  <p className="mt-0.5">Esta inspeção foi registada antes da ativação do sistema de snapshots históricos. Apenas a lista de artigos substituídos está disponível.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Package size={16} className="text-slate-550" />
                  Consumíveis e Peças Instaladas ({artigos.length})
                </h3>
                
                {artigos.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Package className="mx-auto text-slate-350 mb-2" size={32} />
                    <p className="text-xs text-slate-400">Não há registo de artigos associados a esta inspeção.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                          <th className="px-5 py-3.5">Artigo / Peça</th>
                          <th className="px-5 py-3.5">Referência</th>
                          <th className="px-5 py-3.5">Cód. Fabr.</th>
                          <th className="px-5 py-3.5 text-center">Quantidade</th>
                          <th className="px-5 py-3.5 text-center" title="Quantidade registada na inspeção anterior (substituída nesta inspeção)">Qtd Subst.</th>
                          <th className="px-5 py-3.5">Validade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {artigos.map((artigo: any) => {
                          const prevItem = (prevSnapshot?.artigos || []).find((art: any) =>
                            (art.referencia && artigo.referencia && art.referencia === artigo.referencia) ||
                            (art.name && art.name === artigo.name)
                          );
                          const qtdSubstituida = prevItem ? Number(prevItem.quantidade || 0) : 0;
                          return (
                            <tr key={artigo.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3 font-semibold text-slate-800">{artigo.name}</td>
                              <td className="px-5 py-3 font-mono text-xs text-slate-500">{artigo.referencia || '—'}</td>
                              <td className="px-5 py-3 text-slate-500">{artigo.codigoFabricante || '—'}</td>
                              <td className="px-5 py-3 text-center font-bold text-slate-700">{artigo.quantidade}</td>
                              <td className="px-5 py-3 text-center">
                                {qtdSubstituida > 0 ? (
                                  <span className="font-bold text-indigo-600">{qtdSubstituida}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-600 font-semibold">{formatMonthYear(artigo.validade)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-150 px-6 py-4 flex justify-end bg-slate-50 rounded-b-3xl">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 hover:bg-slate-900 border border-slate-200 px-5 py-2.5 text-sm font-bold text-white transition-all shadow-sm"
          >
            Fechar Detalhes
          </button>
        </div>
      </div>
    </div>
  );
}
