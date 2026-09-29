"use client";
import React, { useMemo, useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { AlertTriangle, CheckCircle, Save, FileText, Anchor, ShieldAlert, QrCode as QrCodeIcon, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { appToast } from '@/lib/app-toast';
import { enqueueOfflineSyncOperation } from '@/lib/offline-sync/client';
import { formatDateDisplay } from '@/lib/date-display';
import { parseMonthYearValue } from '@/lib/date-utils';
import { getIvaRate, calcIva, round2 } from '@/lib/iva';
import { getWizardSteps, getStepIndexByKey } from './steps';
import { setWizardFinisher } from './wizardFinisher';
import { isArticleNonExpiring, isArticleValidityRequired } from '@/modules/rafts/mandatoryPack';

export default function Step8_ResumoFinal() {
  const router = useRouter();
  const { 
    jangadaId,
    shipId,
    inspecaoId,
    setInspecaoId,
    inspectionData, 
    setInspectionData,
    setStepByKey,
    setIsSaving,
    isSaving,
    hideOrcamento,
    inspecoes,
    setInspecoes
  } = useJangadaWizardStore();

  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>('');
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);

  const previousInsp = inspecoes?.[0] || null;

  const handleDownloadDossierPdf = () => {
    if (inspecaoId) {
      window.open(`/api/certificados/pdf?inspecaoId=${inspecaoId}`, '_blank');
    } else {
      window.print();
    }
  };

  useEffect(() => {
    fetch('/api/tecnicos?includeInactive=false')
      .then(res => res.json())
      .then(data => {
        const list: any[] = [];
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          (data.stations || []).forEach((station: any) => {
            if (Array.isArray(station.tecnicos)) list.push(...station.tecnicos);
          });
          if (Array.isArray(data.unassigned)) list.push(...data.unassigned);
        } else if (Array.isArray(data)) {
          list.push(...data);
        }
        const uniqueMap = new Map<number | string, any>();
        list.forEach(t => {
          if (t && t.id != null) uniqueMap.set(t.id, t);
        });
        const unique = Array.from(uniqueMap.values());
        setTecnicos(unique);
        if (inspectionData.responsavel && inspectionData.responsavel !== 'Operador') {
          const match = unique.find(t => t.nome?.toLowerCase() === String(inspectionData.responsavel).toLowerCase());
          if (match) setSelectedTecnicoId(String(match.id));
        } else if (unique.length > 0) {
          setSelectedTecnicoId(String(unique[0].id));
          setInspectionData({ responsavel: unique[0].nome });
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
      Promise.resolve().then(() => setCerts([]));
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
    const list: { text: string; stepKey: string; isCritical: boolean }[] = [];
    const today = new Date();
    const insDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : today;

    // Step 1 Validations
    if (!inspectionData.serial) list.push({ text: 'Nº de Série da jangada não definido.', stepKey: 'dados', isCritical: true });
    if (!inspectionData.brand || !inspectionData.model) list.push({ text: 'Marca ou Modelo da jangada não definidos.', stepKey: 'dados', isCritical: true });
    if (!inspectionData.packType) list.push({ text: 'Tipo de Pack não selecionado.', stepKey: 'dados', isCritical: true });
    if (!inspectionData.dataProxInspecao) list.push({ text: 'Data da Próxima Inspeção não definida.', stepKey: 'dados', isCritical: true });
    
    // Step 2 Validations
    const checklistItems = Object.values(inspectionData.checklist || {});
    const reprovados = checklistItems.filter((item: any) => item.status === 'REPROVADO');
    if (reprovados.length > 0) {
      list.push({ text: `Existem ${reprovados.length} itens do checklist exterior/interior marcados como Reprovado.`, stepKey: 'checklist', isCritical: true });
    }
    if (inspectionData.abate?.ativo) {
      const motivoAbate = String(inspectionData.abate.motivo || '').trim();
      list.push({
        text: motivoAbate
          ? `Jangada assinalada para ABATE — motivo ${motivoAbate} registado. Será emitida a Ficha de Abate (IM.049/00).`
          : 'Jangada assinalada para ABATE, mas sem motivo selecionado no passo 2.',
        stepKey: 'checklist',
        isCritical: !motivoAbate,
      });
    }

    // Step 3 Validations
    const componentes = inspectionData.componentes || [];
    const missingValidades = componentes.filter((c: any) => !c.validade);
    if (missingValidades.length > 0) {
      list.push({ text: `Falta definir a validade em ${missingValidades.length} componente(s) crítico(s).`, stepKey: 'componentes', isCritical: true });
    }

    // Step 4 Validations - Pack consumíveis (apenas artigos com validade)
    const packItems = Object.values(inspectionData.packItems || {});
    const packItemsComValidade = packItems.filter(
      (item: any) => isArticleValidityRequired({ name: item.name, referencia: item.referencia })
    );
    const consumiveisSemValidade = packItemsComValidade.filter(
      (item: any) => !item.validade || String(item.validade).trim() === ''
    );
    if (consumiveisSemValidade.length > 0) {
      list.push({ text: `${consumiveisSemValidade.length} itens obrigatórios do pack sem validade registada.`, stepKey: 'pack', isCritical: true });
    }
    const consumiveisSubstituidosSemValidade = packItemsComValidade.filter(
      (item: any) => Number(item.quantidade) > 0 && (!item.validade || String(item.validade).trim() === '')
    );
    if (consumiveisSubstituidosSemValidade.length > 0) {
      list.push({ text: `Foram substituídos ${consumiveisSubstituidosSemValidade.length} consumíveis sem registo de nova validade.`, stepKey: 'pack', isCritical: true });
    }
    
    // Validades a expirar (dias restantes)
    packItems.forEach((item: any) => {
      if (item.validade) {
        const vParsed = parseMonthYearValue(item.validade);
        if (!vParsed) return;
        const expDate = new Date(vParsed.year, vParsed.month - 1, 1);
        const diffTime = expDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ text: `${item.name}: validade expirada há ${Math.abs(diffDays)} dias (${formatMonthYearDisplay(item.validade)})`, stepKey: 'pack', isCritical: true });
        } else if (diffDays <= 30) {
          list.push({ text: `${item.name}: validade expira em ${diffDays} dias (${formatMonthYearDisplay(item.validade)})`, stepKey: 'pack', isCritical: diffDays <= 0 });
        } else if (diffDays <= 90) {
          list.push({ text: `${item.name}: validade em ${diffDays} dias (${formatMonthYearDisplay(item.validade)})`, stepKey: 'pack', isCritical: false });
        }
      }
    });

    // Step 5 Validations - Cilindro
    if (!inspectionData.cylinder?.serial) list.push({ text: 'Nº de Série do cilindro não definido.', stepKey: 'cilindros', isCritical: false });
    if (!inspectionData.cylinder?.pesoBruto) list.push({ text: 'Peso Bruto do cilindro não verificado.', stepKey: 'cilindros', isCritical: false });
    
    const rawProxTeste = inspectionData.cylinder?.dataProxTeste || inspectionData.cylinder?.nextTestDate;
    if (rawProxTeste) {
      const expDate = new Date(rawProxTeste);
      if (!isNaN(expDate.getTime())) {
        const diffTime = expDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({
            text: `Teste hidráulico cilindro (${inspectionData.cylinder?.serial || 'S/N'}) expirado desde ${expDate.toLocaleDateString('pt-PT')} (${Math.abs(diffDays)} dias)`,
            stepKey: 'cilindros',
            isCritical: true,
          });
        } else if (diffDays <= 90) {
          list.push({
            text: `Teste hidráulico cilindro (${inspectionData.cylinder?.serial || 'S/N'}) expira em ${diffDays} dias (${expDate.toLocaleDateString('pt-PT')})`,
            stepKey: 'cilindros',
            isCritical: diffDays <= 30,
          });
        }
      }
    }

    // HRU Validade
    if (inspectionData.hruValidade || inspectionData.hruExpiry) {
      const hruParsed = parseMonthYearValue(inspectionData.hruValidade || inspectionData.hruExpiry);
      if (hruParsed) {
        const hruDate = new Date(hruParsed.year, hruParsed.month - 1, 1);
        const diffTime = hruDate.getTime() - insDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ text: `HRU (${inspectionData.hruReference || 'S/R'}) expirado há ${Math.abs(diffDays)} dias`, stepKey: 'componentes', isCritical: true });
        } else if (diffDays <= 90) {
          list.push({ text: `HRU (${inspectionData.hruReference || 'S/R'}) expira em ${diffDays} dias`, stepKey: 'componentes', isCritical: diffDays <= 30 });
        }
      }
    } else {
      list.push({ text: 'HRU: referência ou validade não definidas', stepKey: 'componentes', isCritical: true });
    }

    // Step 6 Validations
    const testes = Object.values(inspectionData.testes || {});
    if (testes.includes('REPROVOU')) {
      list.push({ text: 'Existem testes operacionais/pressão que reprovararam.', stepKey: 'testes', isCritical: true });
    }

    // Step 7 Validations - Reconciliação substituições vs orçamento
    const orcamentoLinhas = inspectionData.orcamento?.linhas || [];
    if (orcamentoLinhas.length > 0) {
      const substituidos = [
        ...Object.values(inspectionData.packItems || {}).filter(
          (item: any) =>
            Number(item.quantidade) > 0 &&
            !isArticleNonExpiring({ name: item.name, referencia: item.referencia })
        ),
        ...(inspectionData.componentes || []).filter(
          (comp: any) => (comp.reference || comp.stockId) && Boolean(comp.validade)
        ),
      ];
      substituidos.forEach((sub: any) => {
        const ref = sub.referencia || sub.reference || sub.name;
        if (!ref) return;
        const qty = Number(sub.quantidade) || (sub.checklistName ? 1 : 1);
        const linha = orcamentoLinhas.find(
          (l: any) => l.referencia === ref || (l.stockId && String(l.stockId) === String(sub.stockId))
        );
        if (!linha) {
          list.push({ text: `${ref}: substituído mas sem linha correspondente no orçamento.`, stepKey: 'orcamento', isCritical: false });
        } else if (Number(linha.quantidade) !== qty) {
          list.push({ text: `${ref}: quantidade divergente entre substituições (${qty}) e orçamento (${Number(linha.quantidade)}).`, stepKey: 'orcamento', isCritical: false });
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

  const wizardSteps = useMemo(
    () => getWizardSteps(inspectionData, { hideOrcamento }),
    [inspectionData, hideOrcamento],
  );

  const stepNumberOf = (stepKey: string) => {
    const idx = getStepIndexByKey(wizardSteps, stepKey);
    return idx > 0 ? idx : 1;
  };

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
    const defaultUnit = testes.wpUnidadePressao || 'hpa';
    const supUnit = testes.wpCamaraSupUnidade || defaultUnit;
    const infUnit = testes.wpCamaraInfUnidade || defaultUnit;

    const tIn = parseFloat(testes.wpTempInicio || '0');
    const tOut = parseFloat(testes.wpTempFim || '0');
    const pAtmIn = parseFloat(testes.wpPressaoAtmInicio || '0');
    const pAtmOut = parseFloat(testes.wpPressaoAtmFim || '0');
    
    const supIn = parseFloat(testes.wpCamaraSupInicio || '0');
    const supOut = parseFloat(testes.wpCamaraSupFim || '0');
    const infIn = parseFloat(testes.wpCamaraInfInicio || '0');
    const infOut = parseFloat(testes.wpCamaraInfFim || '0');

    const toMbar = (val: number, u: string) => {
      if (isNaN(val) || val <= 0) return NaN;
      if (u === 'inhg') return val * 33.8638866667;
      if (u === 'inh2o') return val * 2.490889;
      return val;
    };

    const fromMbar = (val: number, u: string) => {
      if (isNaN(val) || val <= 0) return NaN;
      if (u === 'inhg') return val / 33.8638866667;
      if (u === 'inh2o') return val / 2.490889;
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
        const startMb = toMbar(supIn, supUnit);
        const endMb = toMbar(supOut, supUnit);
        const correctedEndMb = endMb + totalCorrectionMb;
        const dropMb = Math.max(0, startMb - correctedEndMb);
        const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
        supDropStr = isNaN(dropMb) ? "" : `${fromMbar(dropMb, supUnit).toFixed(2)} ${supUnit} (${percent.toFixed(1)}%)`;
      }

      if (!isNaN(infIn) && !isNaN(infOut)) {
        const startMb = toMbar(infIn, infUnit);
        const endMb = toMbar(infOut, infUnit);
        const correctedEndMb = endMb + totalCorrectionMb;
        const dropMb = Math.max(0, startMb - correctedEndMb);
        const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
        infDropStr = isNaN(dropMb) ? "" : `${fromMbar(dropMb, infUnit).toFixed(2)} ${infUnit} (${percent.toFixed(1)}%)`;
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
      status: isFinal ? (inspectionData.abate?.ativo ? "Condenada" : "Concluída") : "Draft",
      responsavel: inspectionData.responsavel || "Operador",
       applyStockMovements: isFinal,
       signatureBase64: inspectionData.signatureBase64 || null,
       clienteAssinaturaBase64: inspectionData.clienteAssinaturaBase64 || null,
       clienteNomeAssinatura: inspectionData.clienteNomeAssinatura || null,
       guiaTransporteUrl: inspectionData.guiaTransporteUrl || null,
       checklistSnapshot: {
         ...(inspectionData.checklist || {}),
         _hruAplicavel: inspectionData.hruAplicavel || 'NAO',
       },
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
        certificadoRevisao: inspectionData.orcamento?.certificadoRevisao || null,
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

      // 1. Atualiza Jangada (testes, etc). Campos já garantidos pela gravação da
      // inspeção (saveInspection escreve sempre numeroObra, cylinderSerial,
      // cylinderDataTeste, testeFS/NAP/GI/DL e signatureBase64 na jangada) não são
      // repetidos aqui — evitam dupla escrita do mesmo valor.
      if (jangadaId) {
        const jangadaPayload: Record<string, any> = {
          brand: inspectionData.brand,
          model: inspectionData.model,
          serial: inspectionData.serial,
          packType: inspectionData.packType,
          capacity: inspectionData.capacity,
          dataFabrico: inspectionData.dataFabrico,
          launchType: inspectionData.launchType,
          fabricType: inspectionData.fabricType,
          painterLength: inspectionData.painterLength,
          maxStowageHeight: inspectionData.maxStowageHeight,
          hruReferencia: inspectionData.hruReference,
          hruSerial: inspectionData.hruSerial || null,
          hruValidade: inspectionData.hruExpiry,
          hruAplicavel: inspectionData.hruAplicavel || 'NAO',
          radarReflector: inspectionData.radarReflector,
          radarReflectorValidade: inspectionData.radarReflectorExpiry,
          owner: inspectionData.owner,
          certificadoExternoNumero: (inspectionData.certificadoExternoNumero || '').trim() || null,
          certificadoExternoUrl: (inspectionData.certificadoExternoUrl || '').trim() || null,
          // Cylinder data (pesos e próx. teste são complementares à jangada;
          // serial e dataTeste são gravados pela inspeção)
          cylinderPesoBruto: inspectionData.cylinder?.pesoBruto,
          cylinderTara: inspectionData.cylinder?.tara,
          cylinderCo2: inspectionData.cylinder?.co2,
          cylinderN2: inspectionData.cylinder?.n2,
          cylinderDataProxTeste: inspectionData.cylinder?.dataProxTeste,
          // Test results (testeWP e detalhes WP/NAP não são garantidos pela
          // gravação da inspeção — a snapshot da checklist não os contém)
          testeWP: inspectionData.testes?.testeWP,
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
          // Boletins de serviço aplicados
          serviceBulletinsApplied: inspectionData.serviceBulletinsApplied || {},
          // Abate da jangada (ficha IM.049/00)
          abate: inspectionData.abate || null,
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

      if (!inspRes.ok) {
        const errorJson = await inspRes.json().catch(() => ({}));
        throw new Error(
          errorJson.error
            || errorJson.message
            || `Erro ao gravar a inspeção (Código ${inspRes.status})`
        );
      }

      const savedInsp = await inspRes.json().catch(() => ({}));
      if (savedInsp?.id) {
        setInspecaoId(savedInsp.id);
      }

      // Avisa stockWarnings devolvidas pelo servidor (ex.: stock insuficiente
      // para artigos substituídos na validação) — nº visível ao técnico.
      const stockWarnings: string[] = Array.isArray(savedInsp?.stockWarnings)
        ? savedInsp.stockWarnings.filter((w: unknown): w is string => typeof w === 'string' && Boolean(w.trim()))
        : [];
      stockWarnings.forEach((warning) => appToast.warning(`Stock: ${warning}`));

      if (isFinal) {
        if (jangadaId) {
          localStorage.removeItem(`jangada-wizard-draft-${jangadaId}`);
          fetch(`/api/inspecoes?jangadaId=${jangadaId}`)
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then(data => setInspecoes(Array.isArray(data) ? data : []))
            .catch(err => console.error('Erro ao atualizar histórico de inspeções:', err));
        }
        appToast.success("Inspeção concluída com sucesso!");
        setTimeout(() => {
          if (shipId) {
            router.push(`/navios/${shipId}`);
          } else {
            router.push('/jangadas');
          }
        }, 1000);
      } else {
        appToast.success("Rascunho guardado com sucesso!");
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error && error.message
        ? error.message
        : "Ocorreu um erro ao gravar. Verifica a tua ligação.";
      appToast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => {
    saveToBackend(false);
  };

  const handleFinish = () => {
    const missing: string[] = [];
    if (!selectedTecnicoId) missing.push("Técnico responsável selecionado");
    if (missing.length > 0) {
      alert(
        `Não é possível fechar a inspeção. Faltam os seguintes itens obrigatórios:\n\n${missing
          .map((m) => `• ${m}`)
          .join("\n")}`,
      );
      return;
    }

    const criticalWarnings = warnings.filter(w => w.isCritical);

    if (criticalWarnings.length > 0) {
      const msg = `Existem ${criticalWarnings.length} avisos ou validações pendentes:\n\n${criticalWarnings.map(w => `• ${w.text}`).join('\n')}\n\nDeseja finalizar mesmo assim? A inspeção será gravada (apenas o Abate marca como Condenada).`;
      if (!window.confirm(msg)) return;
    }
    saveToBackend(true);
  };

  // Support Ctrl+S / "wizard-save-draft" and Ctrl+Enter / "wizard-finish-inspection"
  useEffect(() => {
    const onSave = () => handleSaveDraft();
    const onFinish = () => handleFinish();
    window.addEventListener('wizard-save-draft', onSave);
    window.addEventListener('wizard-finish-inspection', onFinish);
    return () => {
      window.removeEventListener('wizard-save-draft', onSave);
      window.removeEventListener('wizard-finish-inspection', onFinish);
    };
  }, [handleSaveDraft, handleFinish]);

  // Regista o handler de finalização para o WizardLayout conseguir fechar a
  // inspeção a partir de qualquer passo (ex: Histórico), mesmo com o Step8
  // desmontado. Re-regista em cada render para usar o handleFinish mais recente.
  useEffect(() => {
    setWizardFinisher(handleFinish);
    return () => setWizardFinisher(null);
  }, [handleFinish]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{stepNumberOf('resumo') > 0 ? `${stepNumberOf('resumo')}. ` : ''}Fecho & Resumo</h2>
          <p className="text-slate-600 mt-1">Valide os alertas automáticos antes de fechar e emitir o certificado.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/orcamentos')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm transition-all text-xs"
        >
          <ExternalLink size={16} />
          Módulo de Orçamentos
        </button>
        <button
          type="button"
          onClick={handleDownloadDossierPdf}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-sm transition-all text-xs"
        >
          <FileText size={16} />
          Descarregar Dossier Técnico PDF
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Painel Central de Alertas */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Comparativo Lado a Lado com a Vistoria Anterior */}
          {previousInsp && (
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-800/60">
                <div className="flex items-center gap-2.5">
                  <FileText className="text-indigo-400" size={20} />
                  <h3 className="text-base font-bold">Comparativo com Vistoria Anterior</h3>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 text-white border border-white/20">
                  {formatDateDisplay(previousInsp.dataInspecao)} · Cert: {previousInsp.certificadoNumero || 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Técnico Anterior</p>
                  <p className="font-bold text-sm truncate">{previousInsp.responsavel || 'N/D'}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Próx. Insp. Anterior</p>
                  <p className="font-bold text-sm">{formatDateDisplay(previousInsp.dataProxInspecao, 'N/A')}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Estado Anterior</p>
                  <p className="font-bold text-sm text-emerald-300">{previousInsp.status || 'Concluída'}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Cilindro S/N</p>
                  <p className="font-bold text-sm">{previousInsp.cylinderSerial || inspectionData.cylinder?.serial || 'N/D'}</p>
                </div>
              </div>
            </div>
          )}
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
                      className={`flex items-start justify-between gap-4 p-4 rounded-xl border-l-4 ${
                        warning.isCritical 
                          ? 'bg-red-50 border-red-300 border-l-red-500 text-red-900' 
                          : 'bg-amber-50 border-amber-300 border-l-amber-500 text-amber-900'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${warning.isCritical ? 'bg-red-100' : 'bg-amber-100'}`}>
                          <AlertTriangle className={`${warning.isCritical ? 'text-red-500' : 'text-amber-500'}`} size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-sm leading-snug">{warning.text}</p>
                          <span className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            warning.isCritical ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {warning.isCritical ? 'Ação Crítica Obrigatória' : 'Aviso Informativo'}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setStepByKey(warning.stepKey)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-lg whitespace-nowrap shadow-sm transition-colors ${
                          warning.isCritical 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        Corrigir Passo {stepNumberOf(warning.stepKey)}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Seleção do Técnico Responsável */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <FileText className="text-slate-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Técnico Responsável pela Inspeção</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5 max-w-md">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold">Técnico Responsável</label>
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
            </div>
          </div>
        </div>

        {/* Barra Lateral de Resumo Rápido */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-200 mb-6 border-b border-indigo-800/60 pb-3">Raio-X da Jangada</h3>
            
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <Anchor size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Identificação</p>
                  <p className="font-bold text-sm">{inspectionData.serial || 'Sem Série'}</p>
                  <p className="text-xs text-indigo-200">{inspectionData.brand || 'Sem Marca'} - {inspectionData.model || 'Sem Modelo'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Configuração</p>
                  <p className="font-bold text-sm">{inspectionData.packType || 'Sem Pack'}</p>
                  <p className="text-xs text-indigo-200">{inspectionData.capacity ? `${inspectionData.capacity} Pessoas` : 'S/ Capacidade'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <CheckCircle size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Estado</p>
                  {Boolean(inspectionData.abate?.ativo) ? (
                    <p className="font-bold text-sm text-red-300 flex items-center gap-1.5">
                      <ShieldAlert size={15} />
                      Condenada (Abate)
                    </p>
                  ) : criticalCount > 0 ? (
                    <p className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Com Avisos Pendentes
                    </p>
                  ) : (
                    <p className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle size={15} />
                      Pronto a Fechar
                    </p>
                  )}
                  <p className="text-xs text-indigo-200">Próx. Insp: {formatDateDisplay(inspectionData.dataProxInspecao, '?')}</p>
                </div>
              </div>

              {!hideOrcamento && (() => {
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
                    <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Orçamento{stepNumberOf('orcamento') > 0 ? ` (Passo ${stepNumberOf('orcamento')})` : ''}</p>
                      <p className="font-bold text-sm">{orcLinhas.length} linha(s) · {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcTotal)}</p>
                      <p className="text-xs text-indigo-200">
                        Subtotal: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcBase)}
                        {!orcIsento && ` · IVA (${(getIvaRate() * 100).toFixed(0)}%): ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcIva)}`}
                        {orcIsento && ' · Isento de IVA'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <hr className="border-indigo-700 my-6" />

            <div className="flex gap-3">
              <button 
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="w-1/3 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-slate-700 hover:bg-slate-600 text-white shadow-md"
              >
                {isSaving ? "A Gravar..." : "Guardar Rascunho"}
              </button>

              <button 
                onClick={handleFinish}
                disabled={isSaving}
                className={`w-2/3 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  Boolean(inspectionData.abate?.ativo)
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
                    : criticalCount === 0 
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                }`}
              >
                <Save size={20} />
                {isSaving
                  ? "A Processar..."
                  : Boolean(inspectionData.abate?.ativo)
                    ? 'Finalizar como Condenada (Abate)'
                    : (criticalCount === 0 ? 'Fechar Inspeção e Gravar' : 'Fechar Inspeção e Gravar (com avisos)')}
              </button>
            </div>
            {criticalCount > 0 && (
              <p className="text-center text-xs mt-3 text-amber-200">
                {Boolean(inspectionData.abate?.ativo)
                  ? 'Jangada será finalizada como Condenada (Abate)'
                  : 'A inspeção será gravada como Concluída com os avisos pendentes (apenas o Abate marca como Condenada). Podes corrigir depois.'}
              </p>
            )}
</div>
          </div>

          {/* QR Code de Identificação da Jangada */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <QrCodeIcon className="text-slate-400" size={16} />
              Etiqueta QR (imprimir e afixar)
            </h3>
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                <QRCode
                  value={`${typeof window !== 'undefined' && window.location.origin}/jangadas/${jangadaId || ''}`}
                  size={104}
                  level="M"
                />
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">
                  {inspectionData.serial || 'S/N'}
                </p>
                <p>{inspectionData.brand} · {inspectionData.model}</p>
                <p className="text-slate-400">Aponte para abrir a ficha da jangada no sistema.</p>
              </div>
            </div>
          </div>

          {/* Pré-requisitos de Fecho */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              Dossier de Fecho
            </h3>
            {(() => {
              const items = [
                {
                  label: 'Técnico responsável selecionado',
                  ok: Boolean(selectedTecnicoId),
                  hint: selectedTecnicoId ? 'Selecionado' : 'Pendente',
                },
                {
                  label: 'Certificação do fabricante',
                  ok: !checkTechnicianCertification(),
                  hint: checkTechnicianCertification() ? 'Em falta' : 'Válida',
                  skip: !selectedTecnicoId,
                },
              ];
              const done = items.filter(i => i.ok).length;
              const total = items.filter(i => !i.skip).length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-600">Preparação do dossier</span>
                      <span className={pct === 100 ? 'text-emerald-600' : 'text-indigo-600'}>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {items.filter(i => !i.skip).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-600">
                          {item.ok ? <CheckCircle size={14} className="text-emerald-500" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                          {item.label}
                        </span>
                        <span className={`font-bold ${item.ok ? 'text-emerald-600' : 'text-slate-400'}`}>{item.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
  );
}
