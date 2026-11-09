import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { saveLocalWizardDraft } from './useAutoSave';
import { appToast } from '@/lib/app-toast';
import { enqueueOfflineSyncOperation } from '@/lib/offline-sync/client';
import { isArticleNonExpiring, isArticleValidityRequired } from '@/modules/rafts/mandatoryPack';
import { MIN_REABERTURA_JUSTIFICACAO } from '@/lib/inspecao-lock';
import { getChecklistCompletionErrors, getChecklistExceptionWarnings } from './checklistValidation';
import { buildArticleExpirySnapshot, getArticleExpiryWarnings, isComponentExpiryControlled } from './articleExpiry';
import { isServiceResourceReference } from '@/lib/stock-reference-rules';
import { savedEditVersion } from '@/lib/edit-conflict';
import { withoutSosEquipment } from './sosRules';
import { getWizardSteps } from './steps';

export type FinishWarning = { text: string; stepKey: string; isCritical: boolean; blocksCompletion?: boolean; articleKey?: string };

export function validateChecklistCompletion(): boolean {
  const store = useJangadaWizardStore.getState();
  const errors = computeFinishWarnings(store.inspectionData, store.globalStock.length ? store.globalStock : undefined).filter(w => w.blocksCompletion);
  if (!errors.length) return true;
  if (store.currentStepKey() !== 'resumo') store.setStepByKey('resumo');
  else appToast.error('Existem pendências que impedem a conclusão. Consulte a lista consolidada no resumo.', 9000);
  return false;
}

/**
 * Avisos de validação do fecho da inspeção. Lógica partilhada entre o Step8
 * (Resumo) e a finalização direta a partir de qualquer passo (WizardLayout).
 */
export function computeFinishWarnings(inspectionData: any, stock: any[] = inspectionData.globalStock || []): FinishWarning[] {
  inspectionData = withoutSosEquipment(inspectionData);
  const list: FinishWarning[] = getArticleExpiryWarnings(inspectionData).map(w => ({ ...w, blocksCompletion: w.isCritical }));
  const today = new Date();
  const insDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : today;

  // Step 1 Validations
  if (!String(inspectionData.serial || '').trim()) list.push({ text: 'Nº de Série da jangada não definido.', stepKey: 'dados', isCritical: true });
  if (!String(inspectionData.brand || '').trim()) list.push({ text: 'Marca da jangada não definida.', stepKey: 'dados', isCritical: true });
  if (!String(inspectionData.model || '').trim()) list.push({ text: 'Modelo da jangada não definido.', stepKey: 'dados', isCritical: true });
  if (!inspectionData.packType) list.push({ text: 'Tipo de Pack não selecionado.', stepKey: 'dados', isCritical: true });
  if (!inspectionData.dataProxInspecao) list.push({ text: 'Data da Próxima Inspeção não definida.', stepKey: 'dados', isCritical: true, blocksCompletion: true });
  if (!inspectionData.responsavel?.trim() || inspectionData.responsavel === 'Operador') list.push({ text: 'Técnico responsável não selecionado.', stepKey: 'resumo', isCritical: true });
  if (!inspectionData.abate?.ativo && !Array.isArray(inspectionData.applicableServiceBulletins)) {
    list.push({ text: 'Aplicabilidade dos boletins de serviço por confirmar.', stepKey: 'boletins', isCritical: true });
  }

  // Step 2 Validations
  list.push(...getChecklistCompletionErrors(inspectionData).map(text => ({ text, stepKey: 'checklist', isCritical: true, blocksCompletion: true })));
  list.push(...getChecklistExceptionWarnings(inspectionData).map(text => ({ text, stepKey: 'checklist', isCritical: false })));
  if (inspectionData.abate?.ativo) {
    const motivoAbate = String(inspectionData.abate.motivo || '').trim();
    list.push({
      text: motivoAbate
        ? `Jangada assinalada para ABATE — motivo ${motivoAbate} registado. Será emitida a Ficha de Abate (IM.049/00).`
        : 'Jangada assinalada para ABATE, mas sem motivo selecionado no passo 2.',
      stepKey: 'checklist',
      isCritical: !motivoAbate,
      blocksCompletion: !motivoAbate,
    });
  }

  // A concrete stock row identifies the lot; a lot label alone is not a selection.
  const checkStock = (item: any, name: string, stepKey: string, dated: boolean, articleKey: string) => {
    if (item.stockId && String(item.stockId).trim() !== '') return;
    const reference = String(item.referencia || item.reference || '').trim();
    if (isServiceResourceReference(reference)) return;
    const candidates = stock.filter((row: any) => reference && row.referencia === reference);
    if (!dated && candidates.length <= 1 && !candidates.some((row: any) => row.validade || row.lote)) return;
    list.push({ text: `${name}: substituído sem seleção concreta de lote/linha de stock (stockId em falta).`, stepKey, articleKey, isCritical: true, blocksCompletion: true });
  };
  for (const [id, item] of Object.entries(inspectionData.packItems || {}) as [string, any][]) {
    if (Number(item.quantidade) > 0) checkStock(item, item.name || item.descricao || id, 'pack', isArticleValidityRequired(item), `pack:${id}`);
    if (item.estado === 'REPROVADO') list.push({ text: `${item.name || item.descricao || id}: REPROVADO.${item.justificacaoNaoSubstituicao?.trim() ? ` Justificação: ${item.justificacaoNaoSubstituicao.trim()}. A exceção não declara conformidade.` : ' Sem justificação de não substituição.'}`, stepKey: 'pack', articleKey: `pack:${id}`, isCritical: !item.justificacaoNaoSubstituicao?.trim(), blocksCompletion: !item.justificacaoNaoSubstituicao?.trim() });
  }
  for (const [index, item] of (inspectionData.componentes || []).entries()) {
    const articleKey = `componentes:${item.id || index}`;
    if (item.estado === 'SUBSTITUIDO') checkStock(item, item.type || item.reference || 'Componente', 'componentes', isComponentExpiryControlled(item), articleKey);
    if (item.estado === 'REPROVADO') list.push({ text: `${item.type || item.reference || 'Componente'}: REPROVADO.${item.justificacaoNaoSubstituicao?.trim() ? ` Justificação: ${item.justificacaoNaoSubstituicao.trim()}. A exceção não declara conformidade.` : ' Sem justificação de não substituição.'}`, stepKey: 'componentes', articleKey, isCritical: !item.justificacaoNaoSubstituicao?.trim(), blocksCompletion: !item.justificacaoNaoSubstituicao?.trim() });
  }
  for (const [id, item] of Object.entries(inspectionData.checklist || {}) as [string, any][]) {
    if (item?.status === 'SUBSTITUIDO') checkStock(item, id.replace(/_/g, ' '), 'checklist', item.validade !== undefined || ['luz_exterior_bateria', 'luz_interior_bateria'].includes(id), `checklist:${id}`);
  }
  if (inspectionData.hruAplicavel === 'SIM' && inspectionData.hruSubstituido) {
    checkStock({ stockId: inspectionData.hruStockId, reference: inspectionData.hruReference }, 'HRU', 'componentes', true, 'hru');
  }
  for (const [index, item] of (inspectionData.containerClosureItems || []).entries()) {
    if (Number(item.quantidade) > 0) checkStock(item, item.descricao || item.referencia || 'Fecho do contentor', 'contentor', false, `contentor:${item.id || index}`);
  }

  // Step 5 Validations - Cilindro
  const firstCylinder: any = (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0)
    ? (inspectionData as any).cylinders[0]
    : (inspectionData as any).cylinder;
  if (!firstCylinder?.serial) list.push({ text: 'Nº de Série do cilindro não definido.', stepKey: 'cilindros', isCritical: false });
  if (!firstCylinder?.pesoBruto) list.push({ text: 'Peso Bruto do cilindro não verificado.', stepKey: 'cilindros', isCritical: false });

  const rawProxTeste = firstCylinder?.dataProxTeste || firstCylinder?.nextTestDate;
  if (rawProxTeste) {
    const expDate = new Date(rawProxTeste);
    if (!isNaN(expDate.getTime())) {
      const diffTime = expDate.getTime() - insDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        list.push({
          text: `Teste hidráulico cilindro (${firstCylinder?.serial || 'S/N'}) expirado desde ${expDate.toLocaleDateString('pt-PT')} (${Math.abs(diffDays)} dias)`,
          stepKey: 'cilindros',
          isCritical: true,
        });
      } else if (diffDays <= 90) {
        list.push({
          text: `Teste hidráulico cilindro (${firstCylinder?.serial || 'S/N'}) expira em ${diffDays} dias (${expDate.toLocaleDateString('pt-PT')})`,
          stepKey: 'cilindros',
          isCritical: diffDays <= 30,
        });
      }
    }
  }

  // Step 6 Validations
  for (const [key, result] of Object.entries(inspectionData.testes || {})) {
    if (result === 'REPROVOU') list.push({ text: `${key.replace(/^teste/, 'Teste ')}: REPROVOU.`, stepKey: 'testes', isCritical: true });
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
        (l: any) => sub.stockId != null && sub.stockId !== ''
          ? String(l.stockId) === String(sub.stockId)
          : !l.stockId && l.referencia === ref
      );
      if (!linha) {
        list.push({ text: `${ref}: substituído mas sem linha correspondente no orçamento.`, stepKey: 'orcamento', isCritical: false });
      } else if (Number(linha.quantidade) !== qty) {
        list.push({ text: `${ref}: quantidade divergente entre substituições (${qty}) e orçamento (${Number(linha.quantidade)}).`, stepKey: 'orcamento', isCritical: false });
      }
    });
  }

  if (inspectionData.abate?.ativo) {
    list.forEach((w) => {
      if (!w.text.startsWith('Jangada assinalada para ABATE')) {
        w.isCritical = false;
        w.blocksCompletion = false;
      }
    });
  }

  // Merge problems by article identity, never by a shared stock reference/name.
  const consolidated: FinishWarning[] = [];
  for (const warning of list) {
    const article = warning.text.includes(':') ? warning.text.split(':')[0] : '';
    const existing = consolidated.find(w => (warning.articleKey && w.articleKey === warning.articleKey) ||
      (article && warning.stepKey === 'checklist' && w.stepKey === warning.stepKey && w.text.startsWith(`${article}:`)));
    if (!existing) consolidated.push(warning);
    else {
      const additionalText = existing.text.includes('Justificação:') && warning.text.includes('Justificação:')
        ? warning.text.slice(0, warning.text.indexOf('Justificação:')) : warning.text;
      existing.text += ` ${additionalText.slice(article.length + 1).trim()}`;
      existing.isCritical ||= warning.isCritical;
      existing.blocksCompletion ||= warning.blocksCompletion;
    }
  }
  return consolidated;
}

function buildSavePayload(inspectionData: any, inspecaoId: number | null, isFinal: boolean) {
  inspectionData = withoutSosEquipment(inspectionData);
  const firstCylinder: any = (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0)
    ? (inspectionData as any).cylinders[0]
    : (inspectionData as any).cylinder;

  const packSubstitutions = Object.values(inspectionData.packItems || {})
    .filter((item: any) => item.quantidade > 0)
    .map((item: any) => ({
      stockId: item.stockId || null,
      lote: item.lote || null,
      referencia: item.referencia,
      descricao: item.descricao || item.name,
      quantidade: item.quantidade,
      motivo: "Substituição Inspeção",
      validade: item.validade || null,
      codigoFabricante: item.codigoFabricante || null,
    }));

  const compSubstitutions = (inspectionData.componentes || [])
    .filter((comp: any) => comp.estado === 'SUBSTITUIDO' && (comp.stockId || comp.reference))
    .map((comp: any) => ({
      stockId: comp.stockId || null,
      lote: comp.lote || comp.serialLote || null,
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
    ...useJangadaWizardStore.getState().editVersions,
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

    cylinderSerial: firstCylinder?.serial || null,
    cylinderPesoBruto: firstCylinder?.pesoBruto || null,
    cylinderTara: firstCylinder?.tara || null,
    cylinderCo2: firstCylinder?.co2 || null,
    cylinderN2: firstCylinder?.n2 || null,
    cylinderDataTeste: firstCylinder?.dataTeste || null,
    cylinderDataProxTeste: firstCylinder?.dataProxTeste || null,
    cylinders: (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0) ? (inspectionData as any).cylinders : (firstCylinder ? [firstCylinder] : []),

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
      _articleExpiry: buildArticleExpirySnapshot(inspectionData),
    },
    artigosSubstituidos,
    orcamento: {
      linhas: (inspectionData.orcamento?.linhas || []).map((linha: any) => ({
        id: linha.id || undefined,
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
  if (store.isSaving) return;
  const inspectionData = store.inspectionData;
  const jangadaId = store.jangadaId;
  const shipId = store.shipId;
  const inspecaoId = store.inspecaoId;
  let saveOutcomeUncertain = false;

  store.setIsSaving(true);
  try {
    const payload = withoutSosEquipment(buildSavePayload(inspectionData, inspecaoId, isFinal));

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

    const sendSave = (body: unknown) => fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let saveBody: unknown = payload;
    saveOutcomeUncertain = true;
    let inspRes = await sendSave(saveBody);
    if (inspRes.status < 500) saveOutcomeUncertain = false;

    // Inspeção finalizada: o servidor recusa a gravação (409) e pede uma
    // reabertura explícita, com justificação, para que a correção fique
    // registada em auditoria. Nesse caso pedimos a justificação e repetimos a
    // gravação com o sinal de reabertura — o servidor volta a carimbar a
    // inspeção e actualiza o histórico e a ficha da jangada.
    if (inspRes.status === 409) {
      const lockJson = await inspRes.clone().json().catch(() => ({}));
      if (lockJson?.code !== 'EDIT_CONFLICT' && lockJson?.motivo === 'pedido-de-reabertura') {
        const certificado = String(inspectionData.certificadoNumero || '').trim();
        const justificacao = typeof window !== 'undefined'
          ? window.prompt(
              `A inspeção${certificado ? ` do certificado ${certificado}` : ''} está finalizada e não pode ser alterada.` +
              `\n\nPara a corrigir, escreva a justificação da reabertura (mínimo ${MIN_REABERTURA_JUSTIFICACAO} caracteres).` +
              "\nA alteração fica registada em auditoria.",
              "",
            )
          : null;

        if (justificacao === null) {
          store.setIsSaving(false);
          appToast.info("Reabertura cancelada. A inspeção permanece inalterada.");
          return;
        }

        const texto = justificacao.trim();
        if (texto.length < MIN_REABERTURA_JUSTIFICACAO) {
          store.setIsSaving(false);
          appToast.error(`A justificação da reabertura tem de ter pelo menos ${MIN_REABERTURA_JUSTIFICACAO} caracteres.`, 7000);
          return;
        }

        saveBody = { ...payload, reabrir: true, reaberturaJustificacao: texto };
        saveOutcomeUncertain = true;
        inspRes = await sendSave(saveBody);
        if (inspRes.status < 500) saveOutcomeUncertain = false;
      }
    }

    if (!inspRes.ok) {
      const errorJson = await inspRes.json().catch(() => ({}));
      const detalhe = errorJson.error || errorJson.message || `Erro ao gravar a inspeção (Código ${inspRes.status})`;
      if (inspRes.status === 409) {
        saveLocalWizardDraft();
        store.setIsSaving(false);
        appToast.error(detalhe, 9000);
        return;
      }
      throw new Error(detalhe);
    }

    saveOutcomeUncertain = true;
    const savedInsp = await inspRes.json().catch(() => ({}));
    if (!savedInsp?.id) throw new Error('O servidor não confirmou o identificador da inspeção.');
    saveOutcomeUncertain = false;
    const inspectionVersion = savedEditVersion(savedInsp.updatedAt);
    const raftVersion = jangadaId ? savedEditVersion(savedInsp.raftUpdatedAt) : undefined;
    if (savedInsp?.id) {
      store.setInspecaoId(savedInsp.id);
    }
    useJangadaWizardStore.setState({ editVersions: { expectedUpdatedAt: inspectionVersion, expectedRaftUpdatedAt: raftVersion } });
    saveLocalWizardDraft();

    const stockWarnings: string[] = Array.isArray(savedInsp?.stockWarnings)
      ? savedInsp.stockWarnings.filter((w: unknown): w is string => typeof w === 'string' && Boolean(w.trim()))
      : [];
    stockWarnings.forEach((warning) => appToast.warning(`Stock: ${warning}`));

    // 2. Atualiza Jangada (testes, etc).
    if (jangadaId) {
      const firstCylinder: any = (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0)
        ? (inspectionData as any).cylinders[0]
        : (inspectionData as any).cylinder;
      const cylindersArray: any[] = (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0)
        ? (inspectionData as any).cylinders
        : (firstCylinder ? [firstCylinder] : []);
      const testeCamaras: any = (inspectionData as any).testeCamaras;
      const jangadaPayload: Record<string, any> = {
        expectedUpdatedAt: raftVersion,
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
        hruDataInstalacao: inspectionData.hruDataInstalacao || '',
        hruValidade: inspectionData.hruExpiry,
        radarReflector: inspectionData.radarReflector,
        radarReflectorValidade: inspectionData.radarReflectorExpiry,
        owner: inspectionData.owner,
        certificadoExternoNumero: (inspectionData.certificadoExternoNumero || '').trim() || null,
        certificadoExternoUrl: (inspectionData.certificadoExternoUrl || '').trim() || null,
        cylinderPesoBruto: firstCylinder?.pesoBruto,
        cylinderTara: firstCylinder?.tara,
        cylinderCo2: firstCylinder?.co2,
        cylinderN2: firstCylinder?.n2,
        cylinderDataProxTeste: firstCylinder?.dataProxTeste,
        cylinders: (Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0) ? (inspectionData as any).cylinders : (firstCylinder ? [firstCylinder] : []),
        cylindersJson: cylindersArray.length ? JSON.stringify(withoutSosEquipment({ ...inspectionData, cylinders: cylindersArray }).cylinders) : null,
        testeCamarasJson: testeCamaras ? JSON.stringify(testeCamaras) : null,
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

      if (isFinal) {
        jangadaPayload.closureStrapsJson = JSON.stringify(
          (withoutSosEquipment(inspectionData).containerClosureItems || [])
            .filter((item: any) => item.kind !== "reparo")
            .map((item: any) => ({
              kind: item.kind || "autocolante",
              referencia: item.referencia || null,
              descricao: item.descricao || "",
              quantidade: Number(item.quantidade) || 0,
              stockId: item.stockId || null,
              partNumber: item.partNumber || null,
              unitPrice: Number(item.unitPrice) || 0,
            })),
        );
      }

      const jangadaRes = await fetch(`/api/jangadas/${jangadaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withoutSosEquipment(jangadaPayload)),
      });
      if (!jangadaRes.ok) {
        const errorJson = await jangadaRes.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Erro ao atualizar dados da jangada (Código ${jangadaRes.status})`);
      }
      const savedRaft = await jangadaRes.json();
      useJangadaWizardStore.setState({ editVersions: { expectedUpdatedAt: inspectionVersion, expectedRaftUpdatedAt: savedEditVersion(savedRaft.updatedAt) } });
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

    if (jangadaId && (savedInsp?.id || inspecaoId)) store.markServerPersisted(inspectionData, { jangadaId, inspecaoId: savedInsp.id || inspecaoId });
    saveLocalWizardDraft();
    if (isFinal) {
      if (useJangadaWizardStore.getState().hasServerChanges) {
        appToast.warning('A versao enviada foi guardada. Existem edicoes posteriores por gravar; o rascunho foi preservado.');
        return;
      }
      if (jangadaId) {
        if (!useJangadaWizardStore.getState().hasServerChanges) localStorage.removeItem(`jangada-wizard-draft-${jangadaId}`);
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
    saveLocalWizardDraft();
    console.error(error);
    const message = error instanceof Error && error.message
      ? error.message
      : "Ocorreu um erro ao gravar. Verifica a tua ligação.";
    appToast.error(saveOutcomeUncertain
      ? 'Não foi possível confirmar se a inspeção foi guardada. Consulte o histórico antes de tentar novamente para evitar duplicados. O rascunho foi preservado.'
      : message, saveOutcomeUncertain ? 12000 : undefined);
  } finally {
    store.setIsSaving(false);
  }
}

/**
 * Finaliza apenas no último passo, bloqueando checklist por resolver.
 * Os restantes avisos continuam sujeitos a confirmacao do utilizador.
 */
export function finalizeInspectionStandalone(): void {
  const store = useJangadaWizardStore.getState();
  if (store.isSaving) return;
  const lastStep = getWizardSteps(store.inspectionData, { hideOrcamento: store.hideOrcamento }).at(-1)?.key;
  if (store.currentStepKey() !== lastStep) {
    store.setStepByKey(lastStep || 'certificados');
    return;
  }
  const warnings = computeFinishWarnings(store.inspectionData, store.globalStock.length ? store.globalStock : undefined);
  const criticalWarnings = warnings.filter(w => w.isCritical);

  if (criticalWarnings.length > 0) {
    const msg = `Avisos antes de concluir:\n\n${warnings.map(w => `• ${w.text}`).join('\n')}\n\nDeseja finalizar mesmo assim? A gravação não significa que as pendências estejam resolvidas nem que o equipamento esteja conforme.`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
  }
  // Cria sempre (não é preciso ter abortado), mas reutiliza lógica única.
  void persistInspection({ isFinal: true });
}
