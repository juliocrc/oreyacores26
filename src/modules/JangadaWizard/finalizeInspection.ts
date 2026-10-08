import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { appToast } from '@/lib/app-toast';
import { enqueueOfflineSyncOperation } from '@/lib/offline-sync/client';
import { parseMonthYearValue } from '@/lib/date-utils';
import { isArticleNonExpiring, isArticleValidityRequired } from '@/modules/rafts/mandatoryPack';

export type FinishWarning = { text: string; stepKey: string; isCritical: boolean };

function formatMonthYearDisplay(val: string) {
  if (!val) return '—';
  const [y, m] = String(val ?? "").split('-').map(Number);
  return `${String(m).padStart(2, '0')}-${y}`;
}

/**
 * Avisos de validação do fecho da inspeção. Lógica partilhada entre o Step8
 * (Resumo) e a finalização direta a partir de qualquer passo (WizardLayout).
 */
export function computeFinishWarnings(inspectionData: any): FinishWarning[] {
  const list: FinishWarning[] = [];
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
  const hruNaoAplicavel = String(inspectionData.hruAplicavel || '').toUpperCase() === 'NAO';
  if (!hruNaoAplicavel && (inspectionData.hruValidade || inspectionData.hruExpiry)) {
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
  } else if (!hruNaoAplicavel) {
    list.push({ text: 'HRU: referência ou validade não definidas', stepKey: 'componentes', isCritical: true });
  }

  // Step 6 Validations
  const testes = Object.values(inspectionData.testes || {});
  if (testes.includes('REPROVOU')) {
    list.push({ text: 'Existem testes operacionais/pressão que reprovaram.', stepKey: 'testes', isCritical: true });
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
      const qty = Number(sub.quantidade) || 1;
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
}

function buildSavePayload(inspectionData: any, inspecaoId: number | null, isFinal: boolean) {
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
    .filter((comp: any) => comp.stockId || comp.reference)
    .map((comp: any) => ({
      stockId: comp.stockId || null,
      referencia: comp.reference,
      descricao: comp.name || "Componente",
      quantidade: 1,
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
  const raftId = useJangadaWizardStore.getState().jangadaId;
  const shipId = useJangadaWizardStore.getState().shipId;

  return {
    ...inspectionData,
    id: inspecaoId || undefined,
    shipId: shipId,
    raftId: raftId,
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

    cylinderSerial: inspectionData.cylinder?.serial || null,
    cylinderPesoBruto: inspectionData.cylinder?.pesoBruto || null,
    cylinderTara: inspectionData.cylinder?.tara || null,
    cylinderCo2: inspectionData.cylinder?.co2 || null,
    cylinderN2: inspectionData.cylinder?.n2 || null,
    cylinderDataTeste: inspectionData.cylinder?.dataTeste || null,
    cylinderDataProxTeste: inspectionData.cylinder?.dataProxTeste || null,

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

    status: isFinal ? (inspectionData.abate?.ativo ? "Condenada" : "Concluída") : "Draft",
    responsavel: inspectionData.responsavel || "Operador",
    applyStockMovements: isFinal,
    signatureBase64: inspectionData.signatureBase64 || null,
    clienteAssinaturaBase64: inspectionData.clienteAssinaturaBase64 || null,
    clienteNomeAssinatura: inspectionData.clienteNomeAssinatura || null,
    guiaTransporteUrl: inspectionData.guiaTransporteUrl || null,
    checklistSnapshot: {
      ...(inspectionData.checklist || {}),
      _dataUltimoGi: inspectionData.dataUltimoGi || '',
    },
    artigosSubstituidos,
    orcamento: {
      linhas: (inspectionData.orcamento?.linhas || []).map((linha: any) => ({
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
}

/**
 * Grava/finaliza a inspeção no backend usando o estado atual do store.
 * Funciona a partir de qualquer passo (não depende do Step8 estar montado).
 */
export async function persistInspection({ isFinal }: { isFinal: boolean }): Promise<void> {
  const store = useJangadaWizardStore.getState();
  const inspectionData = store.inspectionData;
  const jangadaId = store.jangadaId;
  const shipId = store.shipId;
  const inspecaoId = store.inspecaoId;

  store.setIsSaving(true);
  try {
    const payload = buildSavePayload(inspectionData, inspecaoId, isFinal);

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
            store.setStepByKey('certificados');
          }
        } else {
          appToast.error("Fila offline cheia. Não foi possível guardar a inspeção.");
        }
      } catch (err) {
        console.error("Erro ao enfileirar offline:", err);
        appToast.error("Ocorreu um erro ao guardar a inspeção localmente.");
      }
      return;
    }

    // 1. Guarda / Finaliza Inspecao.
    //    Vai primeiro de propósito: se a inspeção estiver finalizada e o
    //    servidor recusar (409), a jangada e o navio ficam intactos. Se fosse
    //    ao contrário, um bloqueio deixaria a jangada alterada sem a
    //    inspeção que a justifica.
    const method = inspecaoId ? "PUT" : "POST";
    const url = inspecaoId ? `/api/inspecoes?id=${inspecaoId}` : '/api/inspecoes';

    const inspRes = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!inspRes.ok) {
      const errorJson = await inspRes.json().catch(() => ({}));
      const detalhe = errorJson.error || errorJson.message || `Erro ao gravar a inspeção (Código ${inspRes.status})`;
      if (inspRes.status === 409) {
        store.setIsSaving(false);
        appToast.error(detalhe, 9000);
        return;
      }
      throw new Error(detalhe);
    }

    const savedInsp = await inspRes.json().catch(() => ({}));
    if (savedInsp?.id) {
      store.setInspecaoId(savedInsp.id);
    }

    const stockWarnings: string[] = Array.isArray(savedInsp?.stockWarnings)
      ? savedInsp.stockWarnings.filter((w: unknown): w is string => typeof w === 'string' && Boolean(w.trim()))
      : [];
    stockWarnings.forEach((warning) => appToast.warning(`Stock: ${warning}`));

    // 2. Atualiza Jangada (testes, etc).
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
        radarReflector: inspectionData.radarReflector,
        radarReflectorValidade: inspectionData.radarReflectorExpiry,
        owner: inspectionData.owner,
        certificadoExternoNumero: (inspectionData.certificadoExternoNumero || '').trim() || null,
        certificadoExternoUrl: (inspectionData.certificadoExternoUrl || '').trim() || null,
        cylinderPesoBruto: inspectionData.cylinder?.pesoBruto,
        cylinderTara: inspectionData.cylinder?.tara,
        cylinderCo2: inspectionData.cylinder?.co2,
        cylinderN2: inspectionData.cylinder?.n2,
        cylinderDataProxTeste: inspectionData.cylinder?.dataProxTeste,
        testeWP: inspectionData.testes?.testeWP,
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
        serviceBulletinsApplied: inspectionData.serviceBulletinsApplied || {},
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

    // 3. Atualiza Navio se associado
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

    if (isFinal) {
      if (jangadaId) {
        localStorage.removeItem(`jangada-wizard-draft-${jangadaId}`);
        fetch(`/api/inspecoes?jangadaId=${jangadaId}`)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then(data => store.setInspecoes(Array.isArray(data) ? data : []))
          .catch(err => console.error('Erro ao atualizar histórico de inspeções:', err));
      }
      appToast.success("Inspeção finalizada, dados da jangada atualizados, sincronizada com todos os módulos e rascunho removido com sucesso!");
      store.setStepByKey('certificados');
    } else {
      appToast.success("Rascunho guardado com sucesso!");
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message
      ? error.message
      : "Ocorreu um erro ao gravar. Verifica a tua ligação.";
    appToast.error(message);
  } finally {
    store.setIsSaving(false);
  }
}

/**
 * Finaliza a inspeção a partir de qualquer passo. Não bloqueia por passos por
 * concluir nem por certificação do técnico — apenas confirma junto do utilizador.
 */
export function finalizeInspectionStandalone(): void {
  const inspectionData = useJangadaWizardStore.getState().inspectionData;
  const criticalWarnings = computeFinishWarnings(inspectionData).filter(w => w.isCritical);

  if (criticalWarnings.length > 0) {
    const msg = `Existem ${criticalWarnings.length} avisos ou validações pendentes:\n\n${criticalWarnings.map(w => `• ${w.text}`).join('\n')}\n\nDeseja finalizar mesmo assim? A inspeção será gravada (apenas o Abate marca como Condenada).`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
  }
  // Cria sempre (não é preciso ter abortado), mas reutiliza lógica única.
  void persistInspection({ isFinal: true });
}