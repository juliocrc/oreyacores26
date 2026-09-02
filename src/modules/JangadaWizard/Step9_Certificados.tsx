"use client";
import React, { useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { CheckCircle, Download, FileText, Loader2, ArrowRight, ExternalLink, Upload, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getMandatoryPackItemsForRaft } from '../rafts/mandatoryPack';
import { appToast } from '@/lib/app-toast';

const HarbourOne_URL = "https://survitec2.my.site.com/HarbourOne/login?ec=302&startURL=%2FHarbourOne%2F";

export default function Step9_Certificados() {
  const router = useRouter();
  const { inspectionData, setInspectionData, jangadaId, shipId, inspecaoId } = useJangadaWizardStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [extSaving, setExtSaving] = useState(false);

  const hasExternalCert = Boolean(
    (inspectionData.certificadoExternoNumero || '').trim() || (inspectionData.certificadoExternoUrl || '').trim()
  );

  const openHarbourOne = () => {
    window.open(HarbourOne_URL, "_blank", "noopener,noreferrer");
  };

  const handleExternalFile = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      appToast.error("O certificado externo deve ser um ficheiro PDF.");
      return;
    }
    try {
      setExtSaving(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "certificados/externos");
      const res = await fetch("/api/upload-documento", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no upload do certificado");
      const filename = json.filename || json.originalName;
      if (!filename) throw new Error("Não foi possível obter o nome do ficheiro.");
      const url = `/uploads/certificados/externos/${encodeURIComponent(filename)}`;
      setInspectionData({ ...inspectionData, certificadoExternoUrl: url });
      appToast.success("PDF do certificado externo carregado com sucesso!");
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar o PDF");
    } finally {
      setExtSaving(false);
    }
  };

  const handleSaveExternalCert = async () => {
    if (!jangadaId) {
      appToast.error("Jangada não associada. Não é possível guardar o certificado externo.");
      return;
    }
    try {
      setExtSaving(true);
      const res = await fetch(`/api/jangadas/${jangadaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificadoExternoNumero: (inspectionData.certificadoExternoNumero || "").trim(),
          certificadoExternoUrl: (inspectionData.certificadoExternoUrl || "").trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Erro ao guardar certificado externo");
      appToast.success("Certificado externo guardado com sucesso!");
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao guardar certificado externo");
    } finally {
      setExtSaving(false);
    }
  };

  const clearExternalCert = () => {
    setInspectionData({
      ...inspectionData,
      certificadoExternoNumero: "",
      certificadoExternoUrl: "",
    });
  };

  const buildCertificatePayload = () => {
    const testes = inspectionData.testes || {};
    const mandatoryItems = getMandatoryPackItemsForRaft({
      brand: inspectionData.brand,
      model: inspectionData.model,
      packType: inspectionData.packType,
      capacity: inspectionData.capacity as number,
    });

    const artigosSubstituidos = Object.values(inspectionData.packItems || {})
      .filter((item: any) => item.quantidade > 0)
      .map((item: any) => {
        const mand = mandatoryItems.find((m: any) => m.checklistName === item.checklistName);
        return {
          stockId: item.stockId || null,
          referencia: item.referencia,
          descricao: item.descricao || item.name || mand?.label || item.checklistName || 'Artigo',
          quantidade: item.quantidade,
          validade: item.validade || null,
        };
      });

    // Build checklist for quadro template with article references, quantities, validities, and explicit replacement keys
    const buildQuadroChecklist = () => {
      const checklist: Record<string, any> = {
        ...(inspectionData.checklist || {}),
        ...(inspectionData.testes || {})
      };

      const normalizeText = (text: string) => {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      };

      const findPackItem = (tokens: string[]) => {
        return Object.values(inspectionData.packItems || {}).find((item: any) => {
          const nameNorm = normalizeText(item.descricao || item.name || '');
          return tokens.every(token => nameNorm.includes(normalizeText(token)));
        });
      };

      const findMandatoryItem = (tokens: string[]) => {
        return mandatoryItems.find((item: any) => {
          const nameNorm = normalizeText(item.label || '');
          return tokens.every(token => nameNorm.includes(normalizeText(token)));
        });
      };

      const mapItem = (tokens: string[], refKey?: string, valKey?: string, qtyKey?: string, statusKey?: string, loteKey?: string, explicitReplacementKey?: string) => {
        const packItem = findPackItem(tokens);
        const mandItem = findMandatoryItem(tokens);
        
        // Use packItem (replacement data) if available, otherwise use mandatory item reference
        const referencia = packItem?.referencia || mandItem?.stockReferences?.[0] || '';
        const quantidade = packItem?.quantidade || mandItem?.quantity || 0;
        const validade = packItem?.validade || '';
        const lote = packItem?.lote || '';
        
        if (referencia && refKey) checklist[refKey] = referencia;
        if (validade && valKey) {
          const valStr = String(validade);
          if (valStr.includes('T')) {
            checklist[valKey] = valStr.slice(0, 7);
          } else {
            checklist[valKey] = valStr;
          }
        }
        if (quantidade > 0 && qtyKey) checklist[qtyKey] = quantidade;
        if (statusKey) checklist[statusKey] = 'YES';
        if (lote && loteKey) {
          const loteStr = String(lote).trim();
          checklist[loteKey] = loteStr.toUpperCase().startsWith('LOTE') ? loteStr : `LOTE ${loteStr}`;
        }
        if (explicitReplacementKey && quantidade > 0) {
          checklist[explicitReplacementKey] = quantidade;
        }
      };

      mapItem(['farmacia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
      if (!checklist.ref_farmacia) mapItem(['ambulancia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
      if (!checklist.ref_farmacia) mapItem(['first', 'aid'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');
      if (!checklist.ref_farmacia) mapItem(['socorros'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'lote_farmacia', 'substituicao_explicita__farmacia');

      mapItem(['comprimido'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
      if (!checklist.ref_comprimidos) mapItem(['pastilha'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
      if (!checklist.ref_comprimidos) mapItem(['enjoo'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
      if (!checklist.ref_comprimidos) mapItem(['seasick'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');
      if (!checklist.ref_comprimidos) mapItem(['tables'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'lote_comprimidos', 'substituicao_explicita__comprimidos_p_enjoo');

      mapItem(['paraquedas'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
      if (!checklist.ref_paraquedas) mapItem(['parachute'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
      if (!checklist.ref_paraquedas) mapItem(['rocket'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'lote_paraquedas', 'substituicao_explicita__foguetes_paraquedas');

      mapItem(['facho'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');
      if (!checklist.ref_fachos) mapItem(['handflare'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');
      if (!checklist.ref_fachos) mapItem(['handflares'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'lote_fachos', 'substituicao_explicita__fachos_de_mao');

      mapItem(['fumo'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
      if (!checklist.ref_potes) mapItem(['smoke'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
      if (!checklist.ref_potes) mapItem(['fumigeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');
      if (!checklist.ref_potes) mapItem(['fumígeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'lote_potes', 'substituicao_explicita__potes_de_fumo');

      mapItem(['lanterna'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna', 'lote_lanterna');
      if (!checklist.ref_lanterna) mapItem(['torch'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna', 'lote_lanterna');

      mapItem(['pilha'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'lote_bateria', 'substituicao_explicita__pilhas_para_lanterna');
      if (!checklist.ref_bateria) mapItem(['torch', 'batter'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'lote_bateria', 'substituicao_explicita__pilhas_para_lanterna');

      mapItem(['bateria', 'litio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');
      if (!checklist.ref_bateria_litio) mapItem(['bateria', 'lítio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');
      if (!checklist.ref_bateria_litio) mapItem(['bateria', 'lithium'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio', 'lote_bateria_litio');

      mapItem(['cinta', 'fecho'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
      if (!checklist.ref_cinta_fecho) mapItem(['bursting', 'band'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
      if (!checklist.ref_cinta_fecho) mapItem(['bursting', 'tape'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');

      mapItem(['jogo', 'repara'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');
      if (!checklist.ref_jogo_reparacao) mapItem(['repair', 'kit'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');

      mapItem(['luz', 'ext'], undefined, 'validade_luzes_exteriores', undefined, 'luz_exterior_bateria');
      mapItem(['luz', 'int'], undefined, 'validade_bateria', undefined, 'luz_interior_bateria');

      mapItem(['agua'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
      if (!checklist.ref_agua) mapItem(['água'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
      if (!checklist.ref_agua) mapItem(['water'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');

      mapItem(['racao'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
      if (!checklist.ref_racoes) mapItem(['ração'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
      if (!checklist.ref_racoes) mapItem(['racoes'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
      if (!checklist.ref_racoes) mapItem(['rações'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
      if (!checklist.ref_racoes) mapItem(['ration'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
      if (!checklist.ref_racoes) mapItem(['food'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');

      return checklist;
    };

    const rawUnit = testes.wpUnidadePressao || testes.testeWPUnidadePressao || 'hpa';
    const unit = rawUnit === 'mbar' ? 'hpa' : rawUnit;

    const tIn = parseFloat(testes.wpTempInicio || testes.testeWPTemperaturaInicial || '0');
    const tOut = parseFloat(testes.wpTempFim || testes.testeWPTemperaturaFinal || '0');
    const pAtmIn = parseFloat(testes.wpPressaoAtmInicio || testes.testeWPPressaoAtmosfericaInicial || '0');
    const pAtmOut = parseFloat(testes.wpPressaoAtmFim || testes.testeWPPressaoAtmosfericaFinal || '0');
    
    const supIn = parseFloat(testes.wpCamaraSupInicio || testes.testeWPCamaraSuperiorInicio || '0');
    const supOut = parseFloat(testes.wpCamaraSupFim || testes.testeWPCamaraSuperiorFim || '0');
    const infIn = parseFloat(testes.wpCamaraInfInicio || testes.testeWPCamaraInferiorInicio || '0');
    const infOut = parseFloat(testes.wpCamaraInfFim || testes.testeWPCamaraInferiorFim || '0');

    const toMbar = (val: number) => {
      if (isNaN(val) || val <= 0) return NaN;
      if (unit === 'inhg') return val * 33.8638866667;
      if (unit === 'inh2o') return val * 2.490889;
      return val;
    };

    const fromMbar = (val: number) => {
      if (isNaN(val) || val <= 0) return NaN;
      if (unit === 'inhg') return val / 33.8638866667;
      if (unit === 'inh2o') return val / 2.490889;
      return val;
    };

    let wpUpperCorrected: string | number = '';
    let wpUpperDrop: string | number = '';
    let wpUpperDropPercent: string | number = '';
    let wpLowerCorrected: string | number = '';
    let wpLowerDrop: string | number = '';
    let wpLowerDropPercent: string | number = '';

    if (!isNaN(tIn) && !isNaN(tOut) && !isNaN(pAtmIn) && !isNaN(pAtmOut)) {
      const tempDelta = tOut - tIn;
      const baroDelta = pAtmOut - pAtmIn;
      const correctionTempMb = -(tempDelta * 4);
      const correctionBaroMb = baroDelta;
      const totalCorrectionMb = correctionTempMb + correctionBaroMb;

      if (!isNaN(supIn) && !isNaN(supOut)) {
        const startMb = toMbar(supIn);
        const endMb = toMbar(supOut);
        const correctedEndMb = endMb + totalCorrectionMb;
        const dropMb = Math.max(0, startMb - correctedEndMb);
        const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
        wpUpperCorrected = isNaN(correctedEndMb) ? '' : Number(fromMbar(correctedEndMb).toFixed(2));
        wpUpperDrop = isNaN(dropMb) ? '' : Number(fromMbar(dropMb).toFixed(2));
        wpUpperDropPercent = isNaN(percent) ? '' : Number(percent.toFixed(2));
      }

      if (!isNaN(infIn) && !isNaN(infOut)) {
        const startMb = toMbar(infIn);
        const endMb = toMbar(infOut);
        const correctedEndMb = endMb + totalCorrectionMb;
        const dropMb = Math.max(0, startMb - correctedEndMb);
        const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
        wpLowerCorrected = isNaN(correctedEndMb) ? '' : Number(fromMbar(correctedEndMb).toFixed(2));
        wpLowerDrop = isNaN(dropMb) ? '' : Number(fromMbar(dropMb).toFixed(2));
        wpLowerDropPercent = isNaN(percent) ? '' : Number(percent.toFixed(2));
      }
    }

    return {
      id: jangadaId,
      inspectionId: inspecaoId,
      certNumber: inspectionData.certificadoNumero || '',
      numeroObra: inspectionData.numeroObra || '',
      inspectionDate: inspectionData.dataInspecao || new Date().toISOString().slice(0, 10),
      nextInspectionDate: inspectionData.dataProxInspecao || '',
      shipName: inspectionData.shipName || inspectionData.shipNameManual || 'Sem navio',
      brand: inspectionData.brand || '',
      raftModel: inspectionData.model || '',
      raftCapacity: String(inspectionData.capacity || ''),
      raftSerial: inspectionData.serial || '',
      manufactureDate: inspectionData.dataFabrico || '',
      packType: inspectionData.packType || '',
      
      owner: inspectionData.owner || '',
      shipFlag: inspectionData.shipFlag || '',
      shipImo: inspectionData.shipImo || '',
      shipCallSign: inspectionData.shipCallSign || '',
      launchType: inspectionData.launchType || '',
      fabricType: inspectionData.fabricType || '',
      painterLength: inspectionData.painterLength || '',
      maxStowageHeight: inspectionData.maxStowageHeight || '',
      cylinderHydroTestDate: inspectionData.cylinder?.dataTeste || '',
      hruReference: inspectionData.hruReference || '',
      hruExpiry: inspectionData.hruExpiry || '',
      radarReflector: inspectionData.radarReflector || '',
      radarReflectorExpiry: inspectionData.radarReflectorExpiry || '',

      cylinderSerial: inspectionData.cylinder?.serial || '',
      cylinderGrossWeight: inspectionData.cylinder?.pesoBruto || '',
      cylinderTare: inspectionData.cylinder?.tara || '',
      cylinderCo2: inspectionData.cylinder?.co2 || '',
      cylinderN2: inspectionData.cylinder?.n2 || '',

      pressureUnit: unit,
      tempInitial: testes.wpTempInicio || testes.testeWPTemperaturaInicial || '',
      tempFinal: testes.wpTempFim || testes.testeWPTemperaturaFinal || '',
      baroInitial: testes.wpPressaoAtmInicio || testes.testeWPPressaoAtmosfericaInicial || '',
      baroFinal: testes.wpPressaoAtmFim || testes.testeWPPressaoAtmosfericaFinal || '',
      wpStartTime: testes.wpHoraInicio || testes.testeWPHoraInicio || '',
      wpEndTime: testes.wpHoraFim || testes.testeWPHoraFim || '',
      wpUpperStart: testes.wpCamaraSupInicio || testes.testeWPCamaraSuperiorInicio || '',
      wpUpperEnd: testes.wpCamaraSupFim || testes.testeWPCamaraSuperiorFim || '',
      wpUpperCorrected,
      wpUpperDrop,
      wpUpperDropPercent,
      wpLowerStart: testes.wpCamaraInfInicio || testes.testeWPCamaraInferiorInicio || '',
      wpLowerEnd: testes.wpCamaraInfFim || testes.testeWPCamaraInferiorFim || '',
      wpLowerCorrected,
      wpLowerDrop,
      wpLowerDropPercent,

      napTestDone: inspectionData.testes?.teste_nap || testes.testeNAP || 'NAO',
      fsTestDone: inspectionData.testes?.teste_fs || testes.testeFS || 'NAO',
      giTestDone: inspectionData.testes?.teste_gi || testes.testeGI || 'NAO',
      loadTestDone: inspectionData.testes?.teste_dl || testes.testeDL || 'NAO',
      
      status: 'Concluída',
      checklist: buildQuadroChecklist(),
      artigosSubstituidos,
      substituicoes: artigosSubstituidos,
    };
  };

  const handleGenerate = async (type: 'orey-html' | 'orey-xlsx' | 'survitec' | 'quadro-xlsx') => {
    setLoading(type);
    setPreviewHtml(null);
    try {
      const payload = buildCertificatePayload();
      let url = '';
      
      if (type === 'orey-html') url = '/api/certificados/orey?format=html';
      if (type === 'orey-xlsx') url = '/api/certificados/orey?format=xlsx';
      if (type === 'survitec') url = '/api/certificados/survitec-moderno';
      if (type === 'quadro-xlsx') url = '/api/exportar-raft';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Falha ao gerar certificado');

      if (type === 'orey-xlsx' || type === 'quadro-xlsx') {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;

        let fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1];
        if (!fileName) {
          if (type === 'quadro-xlsx') {
            const rawDate = inspectionData.inspectionDate || payload.inspectionDate || new Date().toISOString();
            const inspectionDate = new Date(rawDate as string);
            const month = String(inspectionDate.getMonth() + 1).padStart(2, '0');
            const year = inspectionDate.getFullYear();
            const monthYear = `${month} ${year}`;

            const serial = inspectionData.serial || '';
            const model = inspectionData.model || '';
            const rawCap = inspectionData.capacity || '';
            const capMatch = String(rawCap).match(/\d+/);
            const capacity = capMatch ? `${Number(capMatch[0])}P` : String(rawCap).trim();

            fileName = `${serial} ${model} ${capacity} (${monthYear}).xlsx`;
          } else {
            fileName = `Certificado_Orey_${inspectionData.serial}.xlsx`;
          }
        }

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } else {
        const data = await response.json();
        setPreviewHtml(data.html);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao gerar certificado. Verifique a consola.');
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadPreview = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Certificado_${inspectionData.serial}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-4 py-8">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50">
          <CheckCircle size={40} className="animate-bounce" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Inspeção Submetida!</h2>
        <p className="text-slate-500 max-w-md mx-auto text-lg">
          A jangada <span className="font-bold text-slate-700">{inspectionData.serial}</span> foi atualizada e os consumos de stock aplicados com sucesso.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <FileText className="text-indigo-500" />
          Emissão de Certificados
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => handleGenerate('orey-xlsx')}
            disabled={loading !== null}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-emerald-100 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-200 transition-all text-emerald-700 font-bold"
          >
            {loading === 'orey-xlsx' ? <Loader2 className="animate-spin" size={32} /> : <Download size={32} />}
            <span>Exportar Excel</span>
            <span className="text-xs font-medium text-emerald-400">Certificado .xlsx</span>
          </button>

          <button 
            onClick={() => handleGenerate('quadro-xlsx')}
            disabled={loading !== null}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-200 transition-all text-blue-700 font-bold"
          >
            {loading === 'quadro-xlsx' ? <Loader2 className="animate-spin" size={32} /> : <FileText size={32} />}
            <span>Quadro Inspeção</span>
            <span className="text-xs font-medium text-blue-400">Tabela de Dados</span>
          </button>
        </div>
      </div>

      {/* Certificado Externo (HarbourOne) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-amber-500" />
            Certificado Externo
          </h3>
          <button
            onClick={openHarbourOne}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md transition-all"
          >
            <ExternalLink size={16} />
            Abrir HarbourOne
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Quando o certificado é feito no HarbourOne (fabricante), preencha abaixo o número do certificado e
          carregue o PDF. Se for indicado um certificado externo, o número interno no formato{" "}
          <span className="font-mono font-bold text-slate-700">AZ26-XXX</span> fica sem efeito.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº do Certificado Externo</label>
            <input
              type="text"
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              placeholder="Ex: HB-2026-123"
              value={inspectionData.certificadoExternoNumero || ''}
              onChange={(e) => setInspectionData({ ...inspectionData, certificadoExternoNumero: e.target.value })}
            />
            {hasExternalCert && (
              <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <ShieldCheck size={12} />
                Certificado externo indicado — o número AZ26-XXX é ignorado nesta inspeção.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Documento PDF do Certificado</label>
            {inspectionData.certificadoExternoUrl ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <a
                  href={inspectionData.certificadoExternoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 truncate"
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">Ver Certificado PDF Carregado</span>
                </a>
                <button
                  type="button"
                  onClick={clearExternalCert}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                >
                  Remover
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-50 hover:bg-amber-50/30 transition-all text-xs font-bold text-slate-600">
                {extSaving ? <Loader2 className="animate-spin text-amber-600" size={16} /> : <Upload size={16} className="text-amber-600" />}
                <span>{extSaving ? "A carregar..." : "Carregar Ficheiro PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={extSaving}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleExternalFile(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSaveExternalCert}
            disabled={extSaving || !hasExternalCert}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md transition"
          >
            {extSaving ? "A Guardar..." : "Guardar Certificado Externo"}
          </button>
        </div>
      </div>

      {previewHtml && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl animate-in slide-in-from-bottom-8">
          <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              Visualização Prévia do Certificado
            </h3>
            <button 
              onClick={handleDownloadPreview}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-colors"
            >
              <Download size={16} />
              Transferir HTML
            </button>
          </div>
          <div className="p-0 bg-slate-100 relative h-[800px] overflow-auto">
            <iframe 
              srcDoc={previewHtml} 
              className="w-full h-full bg-white scale-95 origin-top mt-4 rounded-xl shadow-sm border border-slate-200"
            />
          </div>
        </div>
      )}

      <div className="flex justify-center pt-8">
        <button 
          onClick={() => router.push('/jangadas')}
          className="px-8 py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center gap-3 transition-transform hover:scale-105"
        >
          Voltar para a Lista de Jangadas
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
