"use client";
import React, { useMemo, useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { AlertTriangle, CheckCircle, Save, FileText, Anchor, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SignatureCanvas from '@/components/shared/SignatureCanvas';
import { appToast } from '@/lib/app-toast';
import { enqueueOfflineSyncOperation } from '@/lib/offline-sync/client';
import { formatDateDisplay } from '@/lib/date-display';
import { getIvaRate, calcIva, round2 } from '@/lib/iva';

export default function Step8_ResumoFinal() {
  const router = useRouter();
  const { 
    jangadaId,
    shipId,
    inspecaoId,
    setInspecaoId,
    inspectionData, 
    setInspectionData,
    setStep,
    setStepByKey,
    setIsSaving,
    isSaving
  } = useJangadaWizardStore();

  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>('');
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/tecnicos?includeInactive=false')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTecnicos(data);
          if (inspectionData.responsavel) {
            const match = data.find(t => t.nome.toLowerCase() === inspectionData.responsavel.toLowerCase());
            if (match) {
              setSelectedTecnicoId(String(match.id));
            }
          }
        }
      })
      .catch(err => console.error('Erro ao carregar técnicos:', err));
  }, [inspectionData.responsavel]);

  useEffect(() => {
    if (selectedTecnicoId) {
      fetch(`/api/tecnicos/certificacoes?tecnicoId=${selectedTecnicoId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setCerts(data);
          }
        })
        .catch(err => console.error('Erro ao carregar certificações:', err));
    } else {
      setCerts([]);
    }
  }, [selectedTecnicoId]);

  const checkTechnicianCertification = () => {
    if (!selectedTecnicoId) return null;
    const brand = (inspectionData.brand || '').trim().toUpperCase();
    if (!brand) return null;

    const hasCert = certs.find(c => {
      const matchBrand = c.fabricante.trim().toUpperCase() === brand;
      const valid = new Date(c.dataValidade) >= (inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date());
      return matchBrand && valid && c.ativo;
    });

    if (!hasCert) {
      const tecnico = tecnicos.find(t => String(t.id) === String(selectedTecnicoId));
      return `O técnico ${tecnico?.nome || ''} não tem certificação válida do fabricante ${brand} para esta balsa.`;
    }
    return null;
  };

  // Validate the data to generate warnings
  const warnings = useMemo(() => {
    const list: { text: string; step: number; isCritical: boolean }[] = [];
    const today = new Date();
    const insDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : today;

    // Step 1 Validations
    if (!inspectionData.serial) list.push({ text: 'Nº de Série da jangada não definido.', step: 1, isCritical: true });
    if (!inspectionData.brand || !inspectionData.model) list.push({ text: 'Marca ou Modelo da jangada não definidos.', step: 1, isCritical: true });
    if (!inspectionData.packType) list.push({ text: 'Tipo de Pack não selecionado.', step: 1, isCritical: true });
    if (!inspectionData.dataProxInspecao) list.push({ text: 'Data da Próxima Inspeção não definida.', step: 1, isCritical: true });
    
    // Step 2 Validations
    const checklistItems = Object.values(inspectionData.checklist || {});
    const reprovados = checklistItems.filter((item: any) => item.status === 'REPROVADO');
    if (reprovados.length > 0) {
      list.push({ text: `Existem ${reprovados.length} itens do checklist exterior/interior marcados como Reprovado.`, step: 2, isCritical: true });
    }

    // Step 3 Validations
    const componentes = inspectionData.componentes || [];
    const missingValidades = componentes.filter((c: any) => !c.validade);
    if (missingValidades.length > 0) {
      list.push({ text: `Falta definir a validade em ${missingValidades.length} componente(s) crítico(s).`, step: 3, isCritical: true });
    }

    // Step 4 Validations - Pack consumíveis
    const packItems = Object.values(inspectionData.packItems || {});
    const mandatoryPackItems = packItems.filter((item: any) => item.quantidade >= 0); // todos os itens do pack
    const consumiveisSemValidade = mandatoryPackItems.filter((item: any) => !item.validade || item.validade.trim() === '');
    if (consumiveisSemValidade.length > 0) {
      list.push({ text: `${consumiveisSemValidade.length} itens obrigatórios do pack sem validade registada.`, step: 4, isCritical: true });
    }
    const consumiveisSubstituidosSemValidade = packItems.filter((item: any) => item.quantidade > 0 && (!item.validade || item.validade.trim() === ''));
    if (consumiveisSubstituidosSemValidade.length > 0) {
      list.push({ text: `Foram substituídos ${consumiveisSubstituidosSemValidade.length} consumíveis sem registo de nova validade.`, step: 4, isCritical: true });
    }
    
    // Validades a expirar (dias restantes)
    packItems.forEach((item: any) => {
      if (item.validade) {
        const [vYear, vMonth] = String(item.validade ?? "").split('-').map(Number);
        const expDate = new Date(vYear, (vMonth || 1) - 1, 1);
        const diffTime = expDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ text: `${item.name}: validade expirada há ${Math.abs(diffDays)} dias (${formatMonthYearDisplay(item.validade)})`, step: 4, isCritical: true });
        } else if (diffDays <= 30) {
          list.push({ text: `${item.name}: validade expira em ${diffDays} dias (${formatMonthYearDisplay(item.validade)})`, step: 4, isCritical: diffDays <= 0 });
        } else if (diffDays <= 90) {
          list.push({ text: `${item.name}: validade em ${diffDays} dias (${formatMonthYearDisplay(item.validade)})`, step: 4, isCritical: false });
        }
      }
    });

    // Step 5 Validations - Cilindro
    if (!inspectionData.cylinder?.serial) list.push({ text: 'Nº de Série do cilindro não definido.', step: 5, isCritical: false });
    if (!inspectionData.cylinder?.pesoBruto) list.push({ text: 'Peso Bruto do cilindro não verificado.', step: 5, isCritical: false });
    
    const rawProxTeste = inspectionData.cylinder?.dataProxTeste || inspectionData.cylinder?.nextTestDate;
    if (rawProxTeste) {
      const expDate = new Date(rawProxTeste);
      if (!isNaN(expDate.getTime())) {
        const diffTime = expDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({
            text: `Teste hidrostático cilindro (${inspectionData.cylinder?.serial || 'S/N'}) expirado desde ${expDate.toLocaleDateString('pt-PT')} (${Math.abs(diffDays)} dias)`,
            step: 5,
            isCritical: true,
          });
        } else if (diffDays <= 90) {
          list.push({
            text: `Teste hidrostático cilindro (${inspectionData.cylinder?.serial || 'S/N'}) expira em ${diffDays} dias (${expDate.toLocaleDateString('pt-PT')})`,
            step: 5,
            isCritical: diffDays <= 30,
          });
        }
      }
    }

    // HRU Validade
    if (inspectionData.hruValidade || inspectionData.hruExpiry) {
      const hruDate = new Date(inspectionData.hruValidade || inspectionData.hruExpiry);
      if (!isNaN(hruDate.getTime())) {
        const diffTime = hruDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ text: `HRU (${inspectionData.hruReference || 'S/R'}) expirado há ${Math.abs(diffDays)} dias`, step: 5, isCritical: true });
        } else if (diffDays <= 90) {
          list.push({ text: `HRU (${inspectionData.hruReference || 'S/R'}) expira em ${diffDays} dias`, step: 5, isCritical: diffDays <= 30 });
        }
      }
    } else {
      list.push({ text: 'HRU: referência ou validade não definidas', step: 5, isCritical: true });
    }

    // Step 6 Validations
    const testes = Object.values(inspectionData.testes || {});
    if (testes.includes('REPROVOU')) {
      list.push({ text: 'Existem testes operacionais/pressão que reprovararam.', step: 6, isCritical: true });
    }

    // Step 7 Validations - Reconciliação substituições vs orçamento
    const orcamentoLinhas = inspectionData.orcamento?.linhas || [];
    if (orcamentoLinhas.length > 0) {
      const substituidos = [
        ...Object.values(inspectionData.packItems || {}).filter((item: any) => Number(item.quantidade) > 0),
        ...(inspectionData.componentes || []).filter((comp: any) => comp.reference || comp.stockId),
      ];
      substituidos.forEach((sub: any) => {
        const ref = sub.referencia || sub.reference || sub.name;
        if (!ref) return;
        const qty = Number(sub.quantidade) || (sub.checklistName ? 1 : 1);
        const linha = orcamentoLinhas.find(
          (l: any) => l.referencia === ref || (l.stockId && String(l.stockId) === String(sub.stockId))
        );
        if (!linha) {
          list.push({ text: `${ref}: substituído no passo 4 mas sem linha correspondente no orçamento (passo 7).`, step: 7, isCritical: false });
        } else if (Number(linha.quantidade) !== qty) {
          list.push({ text: `${ref}: quantidade divergente entre substituições (${qty}) e orçamento (${Number(linha.quantidade)}).`, step: 7, isCritical: false });
        }
      });
    }

    return list;
  }, [inspectionData]);

  function formatMonthYearDisplay(val: string) {
    if (!val) return '—';
    const [y, m] = String(val ?? "").split('-').map(Number);
    return `${String(m).padStart(2, '0')}-${y}`;
  }

  const criticalCount = warnings.filter(w => w.isCritical).length;

  const buildSavePayload = (isFinal = false) => {
    const packSubstitutions = Object.values(inspectionData.packItems || {})
      .filter((item: any) => item.quantidade > 0)
      .map((item: any) => ({
        stockId: item.stockId || null,
        referencia: item.referencia,
        descricao: item.descricao || item.name,
        quantidade: item.quantidade,
        motivo: "Substituição Inspeção",
        validade: item.validade || null,
        codigoFabricante: item.codigoFabricante || null,
      }));

    const compSubstitutions = (inspectionData.componentes || [])
      .filter((comp: any) => comp.stockId || comp.reference) // Apenas os que têm referência preenchida
      .map((comp: any) => ({
        stockId: comp.stockId || null,
        referencia: comp.reference,
        descricao: comp.name || "Componente",
        quantidade: 1, // Componentes normais são 1 por 1
        motivo: "Substituição Inspeção",
        validade: comp.validade || null,
        codigoFabricante: null,
      }));

    const closureSubstitutions = (inspectionData.containerClosureItems || [])
      .filter((item: any) => Number(item.quantidade) > 0)
      .map((item: any) => ({
        stockId: item.stockId || null,
        referencia: item.referencia,
        name: item.descricao || "Equipamento de fecho do contentor",
        descricao: item.descricao || "Equipamento de fecho do contentor",
        quantidade: item.quantidade,
        precoUnitario: Number(item.unitPrice) || 0,
        motivo: "Fecho do Contentor",
        validade: null,
        codigoFabricante: item.partNumber || null,
        kind: item.kind || "autocolante",
      }));

    const artigosSubstituidos = [...packSubstitutions, ...compSubstitutions, ...closureSubstitutions];

    const testes = inspectionData.testes || {};
    const unit = testes.wpUnidadePressao === 'mbar' ? 'hpa' : (testes.wpUnidadePressao || 'hpa');

    const tIn = parseFloat(testes.wpTempInicio || '0');
    const tOut = parseFloat(testes.wpTempFim || '0');
    const pAtmIn = parseFloat(testes.wpPressaoAtmInicio || '0');
    const pAtmOut = parseFloat(testes.wpPressaoAtmFim || '0');
    
    const supIn = parseFloat(testes.wpCamaraSupInicio || '0');
    const supOut = parseFloat(testes.wpCamaraSupFim || '0');
    const infIn = parseFloat(testes.wpCamaraInfInicio || '0');
    const infOut = parseFloat(testes.wpCamaraInfFim || '0');

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

    let supDropStr = "";
    let infDropStr = "";

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
        supDropStr = isNaN(dropMb) ? "" : `${fromMbar(dropMb).toFixed(2)} ${unit} (${percent.toFixed(1)}%)`;
      }

      if (!isNaN(infIn) && !isNaN(infOut)) {
        const startMb = toMbar(infIn);
        const endMb = toMbar(infOut);
        const correctedEndMb = endMb + totalCorrectionMb;
        const dropMb = Math.max(0, startMb - correctedEndMb);
        const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
        infDropStr = isNaN(dropMb) ? "" : `${fromMbar(dropMb).toFixed(2)} ${unit} (${percent.toFixed(1)}%)`;
      }
    }

    const ordemId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ordemId') : null;

    return {
      // Identificação e Jangada Fields
      ...inspectionData,
      id: inspecaoId || undefined,
      shipId: shipId,
      raftId: jangadaId,
      navioNome: inspectionData.shipName || inspectionData.shipNameManual || null,
      shipNameManual: inspectionData.shipName || inspectionData.shipNameManual || null,
      jangadaSerial: inspectionData.serial || null,
      date: inspectionData.dataInspecao || new Date().toISOString().slice(0, 10),
      dataProxInspecao: inspectionData.dataProxInspecao || null,
      
      owner: inspectionData.owner || null,
      launchType: inspectionData.launchType || null,
      painterLength: inspectionData.painterLength || null,
      maxStowageHeight: inspectionData.maxStowageHeight || null,
      fabricType: inspectionData.fabricType || null,

      // Cilindros Fields
      cylinderSerial: inspectionData.cylinder?.serial || null,
      cylinderPesoBruto: inspectionData.cylinder?.pesoBruto || null,
      cylinderTara: inspectionData.cylinder?.tara || null,
      cylinderCo2: inspectionData.cylinder?.co2 || null,
      cylinderN2: inspectionData.cylinder?.n2 || null,
      cylinderDataTeste: inspectionData.cylinder?.dataTeste || null,
      cylinderDataProxTeste: inspectionData.cylinder?.dataProxTeste || null,
      
      // Testes
      testeWP: testes.testeWP || null,
      testeNAP: testes.testeNAP || null,
      testeFS: testes.testeFS || null,
      testeGI: testes.testeGI || null,
      testeDL: testes.testeDL || null,

      testeWPUnidadePressao: testes.wpUnidadePressao || null,
      testeWPHoraInicio: testes.wpHoraInicio || null,
      testeWPHoraFim: testes.wpHoraFim || null,
      testeWPTemperaturaInicial: testes.wpTempInicio || null,
      testeWPTemperaturaFinal: testes.wpTempFim || null,
      testeWPPressaoAtmosfericaInicial: testes.wpPressaoAtmInicio || null,
      testeWPPressaoAtmosfericaFinal: testes.wpPressaoAtmFim || null,
      testeWPCamaraSuperiorInicio: testes.wpCamaraSupInicio || null,
      testeWPCamaraSuperiorFim: testes.wpCamaraSupFim || null,
      testeWPCamaraSuperiorQueda: supDropStr || null,
      testeWPCamaraInferiorInicio: testes.wpCamaraInfInicio || null,
      testeWPCamaraInferiorFim: testes.wpCamaraInfFim || null,
      testeWPCamaraInferiorQueda: infDropStr || null,

      // Inspeção Fields
      status: isFinal ? (criticalCount > 0 ? "Condenada" : "Concluída") : "Draft",
      responsavel: inspectionData.responsavel || "Operador",
       applyStockMovements: isFinal,
       signatureBase64: inspectionData.signatureBase64 || null,
       clienteAssinaturaBase64: inspectionData.clienteAssinaturaBase64 || null,
       clienteNomeAssinatura: inspectionData.clienteNomeAssinatura || null,
       guiaTransporteUrl: inspectionData.guiaTransporteUrl || null,
       checklistSnapshot: inspectionData.checklist || {},
      artigosSubstituidos,
      orcamento: {
        linhas: (inspectionData.orcamento?.linhas || []).map((linha) => ({
          stockId: linha.stockId ?? null,
          referencia: linha.referencia || "",
          descricao: linha.descricao || "",
          quantidade: Number(linha.quantidade) || 0,
          precoUnitario: Number(linha.unitPrice) || 0,
          total: Math.round((Number(linha.quantidade) || 0) * (Number(linha.unitPrice) || 0) * 100) / 100,
          source: linha.source || "manual",
        })),
        valorMaoObra: 0,
        valorDesconto: Number(inspectionData.orcamento?.valorDesconto || 0),
        isIsentoIva: Boolean(inspectionData.orcamento?.isIsentoIva),
        usarOrcamento: Boolean(inspectionData.orcamento?.usarOrcamento),
        removedIds: inspectionData.orcamento?.removedIds || [],
        aprovacaoWhatsApp: inspectionData.orcamento?.aprovacaoWhatsApp || null,
      },
      ordemId: ordemId ? parseInt(ordemId, 10) : null,
    };
  };

  const saveToBackend = async (isFinal: boolean) => {
    try {
      setIsSaving(true);
      const payload = buildSavePayload(isFinal);

      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        try {
          const method = inspecaoId ? 'PUT' : 'POST';
          const path = inspecaoId ? `/api/inspecoes?id=${inspecaoId}` : '/api/inspecoes';
          const queued = enqueueOfflineSyncOperation({
            path,
            method: method as 'PUT' | 'POST',
            body: payload,
            entityType: 'jangada-inspection',
            entityId: String(inspecaoId || jangadaId),
            summary: `Inspeção offline: ${inspectionData.serial || jangadaId}`,
          });

          if (queued) {
            appToast.warning("Sem ligação à internet. A inspeção foi enfileirada para sincronização automática.");
            if (isFinal) {
              setStepByKey('certificados');
            }
          } else {
            appToast.error("Fila offline cheia. Não foi possível guardar a inspeção.");
          }
        } catch (err) {
          console.error("Erro ao enfileirar offline:", err);
          appToast.error("Ocorreu um erro ao guardar a inspeção localmente.");
        } finally {
          setIsSaving(false);
        }
        return;
      }

      // 1. Atualiza Jangada (testes, etc)
      if (jangadaId) {
        const jangadaPayload: Record<string, any> = {
          brand: inspectionData.brand,
          model: inspectionData.model,
          serial: inspectionData.serial,
          packType: inspectionData.packType,
          capacity: inspectionData.capacity,
          dataFabrico: inspectionData.dataFabrico,
          dataInspecao: inspectionData.dataInspecao,
          dataProxInspecao: inspectionData.dataProxInspecao,
          launchType: inspectionData.launchType,
          fabricType: inspectionData.fabricType,
          painterLength: inspectionData.painterLength,
          maxStowageHeight: inspectionData.maxStowageHeight,
          hruReferencia: inspectionData.hruReference,
          hruValidade: inspectionData.hruExpiry,
          radarReflector: inspectionData.radarReflector,
          radarReflectorValidade: inspectionData.radarReflectorExpiry,
          owner: inspectionData.owner,
          numeroObra: inspectionData.numeroObra,
          certificadoExternoNumero: (inspectionData.certificadoExternoNumero || '').trim() || null,
          certificadoExternoUrl: (inspectionData.certificadoExternoUrl || '').trim() || null,
          // Cylinder data
          cylinderSerial: inspectionData.cylinder?.serial,
          cylinderPesoBruto: inspectionData.cylinder?.pesoBruto,
          cylinderTara: inspectionData.cylinder?.tara,
          cylinderCo2: inspectionData.cylinder?.co2,
          cylinderN2: inspectionData.cylinder?.n2,
          cylinderDataTeste: inspectionData.cylinder?.dataTeste,
          cylinderDataProxTeste: inspectionData.cylinder?.dataProxTeste,
          // Test results
          testeWP: inspectionData.testes?.testeWP,
          testeNAP: inspectionData.testes?.testeNAP,
          testeGI: inspectionData.testes?.testeGI,
          testeFS: inspectionData.testes?.testeFS,
          testeDL: inspectionData.testes?.testeDL,
          // WP test details
          testeWPUnidadePressao: inspectionData.testes?.wpUnidadePressao,
          testeWPHoraInicio: inspectionData.testes?.wpHoraInicio,
          testeWPHoraFim: inspectionData.testes?.wpHoraFim,
          testeWPTemperaturaInicial: inspectionData.testes?.wpTempInicio,
          testeWPTemperaturaFinal: inspectionData.testes?.wpTempFim,
          testeWPPressaoAtmosfericaInicial: inspectionData.testes?.wpPressaoAtmInicio,
          testeWPPressaoAtmosfericaFinal: inspectionData.testes?.wpPressaoAtmFim,
          testeWPCamaraSuperiorInicio: inspectionData.testes?.wpCamaraSupInicio,
          testeWPCamaraSuperiorFim: inspectionData.testes?.wpCamaraSupFim,
          testeWPCamaraInferiorInicio: inspectionData.testes?.wpCamaraInfInicio,
          testeWPCamaraInferiorFim: inspectionData.testes?.wpCamaraInfFim,
          testeWPInstrumento: inspectionData.testes?.wpManometroId,
          testeWPBarometro: inspectionData.testes?.wpBarometroId,
          // NAP test details
          testeNAPUnidadePressao: inspectionData.testes?.napUnidadePressao,
          testeNAPHoraInicio: inspectionData.testes?.napHoraInicio,
          testeNAPHoraFim: inspectionData.testes?.napHoraFim,
          testeNAPTemperaturaInicial: inspectionData.testes?.napTempInicio,
          testeNAPTemperaturaFinal: inspectionData.testes?.napTempFim,
          testeNAPPressaoAtmosfericaInicial: inspectionData.testes?.napPressaoAtmInicio,
          testeNAPPressaoAtmosfericaFinal: inspectionData.testes?.napPressaoAtmFim,
          testeNAPCamaraSuperiorInicio: inspectionData.testes?.napCamaraSupInicio,
          testeNAPCamaraSuperiorFim: inspectionData.testes?.napCamaraSupFim,
          testeNAPCamaraInferiorInicio: inspectionData.testes?.napCamaraInfInicio,
          testeNAPCamaraInferiorFim: inspectionData.testes?.napCamaraInfFim,
          testeNAPInstrumento: inspectionData.testes?.napManometroId,
        };

        const jangadaRes = await fetch(`/api/jangadas/${jangadaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jangadaPayload),
        });
        if (!jangadaRes.ok) {
          const errorJson = await jangadaRes.json().catch(() => ({}));
          throw new Error(errorJson.error || errorJson.message || `Erro ao atualizar dados da jangada (Código ${jangadaRes.status})`);
        }
      }

      // 2. Atualiza Navio se associado
      if (shipId) {
        try {
          const shipRes = await fetch(`/api/navios/${shipId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proprietario: inspectionData.owner,
              bandeira: inspectionData.shipFlag,
              imo: inspectionData.shipImo,
              callSignal: inspectionData.shipCallSign,
            }),
          });
          if (!shipRes.ok) {
            console.warn("Erro ao atualizar dados do navio:", shipRes.status);
          }
        } catch (shipErr) {
          console.error("Erro ao atualizar dados do navio:", shipErr);
        }
      }

      // 3. Guarda / Finaliza Inspecao
      const method = inspecaoId ? "PUT" : "POST";
      const url = inspecaoId ? `/api/inspecoes?id=${inspecaoId}` : '/api/inspecoes';
      
      const inspRes = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!inspRes.ok) throw new Error("Falha ao gravar inspeção");

      const savedInsp = await inspRes.json();
      if (savedInsp?.id) {
        setInspecaoId(savedInsp.id);
      }

      if (isFinal) {
        setStepByKey('certificados');
      } else {
        appToast.success("Rascunho guardado com sucesso!");
      }
    } catch (error) {
      console.error(error);
      appToast.error("Ocorreu um erro ao gravar. Verifica a tua ligação.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => {
    saveToBackend(false);
  };

  // Support Ctrl+S / "wizard-save-draft" event to save draft from anywhere in the wizard
  useEffect(() => {
    const onSave = () => handleSaveDraft();
    window.addEventListener('wizard-save-draft', onSave);
    return () => window.removeEventListener('wizard-save-draft', onSave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSaveDraft]);

  const handleFinish = () => {
    const criticalWarnings = warnings.filter(w => w.isCritical);
    if (criticalWarnings.length > 0) {
      const msg = `Atenção: Existem ${criticalWarnings.length} validações críticas:\n\n${criticalWarnings.map(w => `• ${w.text}`).join('\n')}\n\nA inspeção NÃO pode ser finalizada até corrigir estes itens.`;
      alert(msg);
      return;
    }
    saveToBackend(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">8. Fecho & Resumo</h2>
        <p className="text-slate-600 mt-1">Valide os alertas automáticos antes de fechar e emitir o certificado.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Painel Central de Alertas */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <ShieldAlert className="text-slate-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Validação do Sistema</h3>
            </div>
            
            <div className="p-6">
              {warnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">Tudo Perfeito!</h4>
                  <p className="text-slate-500 mt-1 max-w-sm">
                    A inteligência do sistema não detetou falhas, validades em atraso ou itens reprovados. A jangada está pronta para ser certificada.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {warnings.map((warning, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-start justify-between gap-4 p-4 rounded-xl border ${
                        warning.isCritical 
                          ? 'bg-red-50 border-red-200 text-red-900' 
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`shrink-0 mt-0.5 ${warning.isCritical ? 'text-red-500' : 'text-amber-500'}`} size={18} />
                        <div>
                          <p className="font-semibold text-sm">{warning.text}</p>
                          <p className={`text-xs mt-0.5 ${warning.isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                            {warning.isCritical ? 'Ação Crítica Obrigatória' : 'Aviso Informativo'}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setStep(warning.step)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                          warning.isCritical 
                            ? 'bg-red-100 hover:bg-red-200 text-red-800' 
                            : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                        }`}
                      >
                        Corrigir Passo {warning.step}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Secção de Assinatura Digital */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <FileText className="text-slate-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Assinatura Digital do Técnico</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5 max-w-md">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold">Técnico Responsável pela Inspeção</label>
                <select
                  value={selectedTecnicoId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTecnicoId(id);
                    const tecnico = tecnicos.find(t => String(t.id) === String(id));
                    setInspectionData({ responsavel: tecnico?.nome || 'Operador' });
                  }}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                >
                  <option value="">-- Selecione o Técnico --</option>
                  {tecnicos.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
                {(() => {
                  const warning = checkTechnicianCertification();
                  if (warning) {
                    return (
                      <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-2 bg-amber-50 p-2 rounded-xl border border-amber-200">
                        <AlertTriangle size={16} className="shrink-0" />
                        <span>{warning}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <p className="text-sm text-slate-600">
                Por favor, assine digitalmente no quadro abaixo para validar esta inspeção e incluir a assinatura no dossier e certificados.
              </p>
              <SignatureCanvas 
                onChange={(base64) => setInspectionData({ signatureBase64: base64 ?? '' })} 
                initialValue={inspectionData.signatureBase64}
              />
            </div>
          </div>

          {/* Secǜo de Termo de Aceitao, Recibo de Entrega e Assinatura do Cliente / Comandante */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <CheckCircle className="text-emerald-600" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Termo de Aceitaǜo & Recibo de Entrega (Cliente / Comandante)</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5 max-w-md">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nome / Cargo do Comandante ou Representante</label>
                <input
                  type="text"
                  value={String((inspectionData as any).clienteNomeAssinatura || "")}
                  onChange={(e) => setInspectionData({ clienteNomeAssinatura: e.target.value })}
                  placeholder="Ex: Comandante João Silva / Agente Marítimo"
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Guia de Transporte / Conhecimento de Embarque do Transitrio (Opcional)</label>
                <div className="flex items-center gap-3 max-w-md">
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition-all text-xs font-bold text-slate-600">
                    <FileText size={16} className="text-indigo-600" />
                    <span>{inspectionData.guiaTransporteUrl ? "Substituir Guia / PDF" : "Carregar Guia de Transporte (PDF/Foto)"}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("categoria", "documentos");
                          const res = await fetch("/api/upload-documento", {
                            method: "POST",
                            body: fd,
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.error || "Erro no upload");
                          const fileUrl = json.url || json.path || json.fileUrl;
                          if (fileUrl) {
                            setInspectionData({ guiaTransporteUrl: fileUrl });
                            appToast.success("Guia de transporte carregada com sucesso!");
                          }
                        } catch (err: unknown) {
                          appToast.error(err instanceof Error ? err.message : "Erro ao carregar guia");
                        }
                      }}
                    />
                  </label>
                </div>
                {Boolean((inspectionData as any).guiaTransporteUrl) && (
                  <div className="mt-2 flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl max-w-md">
                    <a href={String((inspectionData as any).guiaTransporteUrl || "")} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 truncate">
                      <CheckCircle size={14} className="shrink-0 text-emerald-600" />
                      <span className="truncate">Ver Guia de Transporte Carregada</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setInspectionData({ guiaTransporteUrl: "" })}
                      className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-600 pt-2">
                Assinatura do cliente ou representante a confirmar a aceitação da revisão e recibo de entrega da jangada:
              </p>
              <SignatureCanvas 
                onChange={(base64) => setInspectionData({ clienteAssinaturaBase64: base64 ?? '' })} 
                initialValue={String((inspectionData as any).clienteAssinaturaBase64 || "")}
              />
            </div>
          </div>
        </div>

        {/* Barra Lateral de Resumo Rápido */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-300 mb-6">Raio-X da Jangada</h3>
            
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2.5 rounded-xl text-white">
                  <Anchor size={20} />
                </div>
                <div>
                  <p className="text-xs text-indigo-200 font-medium uppercase tracking-wider mb-0.5">Identificação</p>
                  <p className="font-semibold">{inspectionData.serial || 'Sem Série'}</p>
                  <p className="text-xs text-indigo-100">{inspectionData.brand || 'Sem Marca'} - {inspectionData.model || 'Sem Modelo'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2.5 rounded-xl text-white">
                  <FileText size={20} />
                </div>
                <div>
                  <p className="text-xs text-indigo-200 font-medium uppercase tracking-wider mb-0.5">Configuração</p>
                  <p className="font-semibold">{inspectionData.packType || 'Sem Pack'}</p>
                  <p className="text-xs text-indigo-100">{inspectionData.capacity ? `${inspectionData.capacity} Pessoas` : 'S/ Capacidade'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2.5 rounded-xl text-white">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <p className="text-xs text-indigo-200 font-medium uppercase tracking-wider mb-0.5">Estado</p>
                  <p className="font-semibold text-emerald-300">Em Rascunho</p>
                  <p className="text-xs text-indigo-100">Próx. Insp: {formatDateDisplay(inspectionData.dataProxInspecao, '?')}</p>
                </div>
              </div>

              {(() => {
                const orcLinhas = inspectionData.orcamento?.linhas || [];
                if (orcLinhas.length === 0 && !inspectionData.orcamento?.usarOrcamento) return null;
                const orcSubtotal = orcLinhas.reduce((s: number, l: any) => s + (Number(l.quantidade) || 0) * (Number(l.unitPrice) || 0), 0);
                const orcDesconto = Number(inspectionData.orcamento?.valorDesconto || 0);
                const orcBase = Math.max(0, orcSubtotal - orcDesconto);
                const orcIsento = Boolean(inspectionData.orcamento?.isIsentoIva);
                const orcIva = calcIva(orcBase, orcIsento);
                const orcTotal = round2(orcBase + orcIva);
                return (
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-2.5 rounded-xl text-white">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-indigo-200 font-medium uppercase tracking-wider mb-0.5">Orçamento (Passo 7)</p>
                      <p className="font-semibold">{orcLinhas.length} linha(s) · {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcTotal)}</p>
                      <p className="text-xs text-indigo-100">
                        Subtotal: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcBase)}
                        {!orcIsento && ` · IVA (${(getIvaRate() * 100).toFixed(0)}%): ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcIva)}`}
                        {orcIsento && ' · Isento de IVA'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <hr className="border-indigo-800 my-6" />

            <div className="flex gap-3">
              <button 
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="w-1/3 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-white/10 hover:bg-white/20 text-white"
              >
                {isSaving ? "A Gravar..." : "Guardar Rascunho"}
              </button>

              <button 
                onClick={handleFinish}
                disabled={isSaving}
                className={`w-2/3 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  criticalCount === 0 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                }`}
              >
                <Save size={20} />
                {isSaving ? "A Processar..." : (criticalCount === 0 ? 'Fechar Inspeção e Gravar' : 'Finalizar com Falhas (Condenada)')}
              </button>
            </div>
            {criticalCount > 0 && (
              <p className="text-center text-xs mt-3 text-amber-200">Existem falhas que reprovam a jangada</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
