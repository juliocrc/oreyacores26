import type { InspectionData } from './types';
import { getWizardSteps } from './steps';
import { ALL_CHECKLIST_IDS, getChecklistCompletionErrors } from './checklistValidation';
import { getMandatoryPackItemsForRaft } from '../rafts/mandatoryPack';

export type StepProgress = {
  step: string;
  complete: boolean;
  percent: number;
  missing: string[];
};

const has = (v: unknown) => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== '0';
};

export function getStepProgress(data: InspectionData, opts?: { hideOrcamento?: boolean }): StepProgress[] {
  const steps = getWizardSteps(data, opts);
  const results: Record<string, { percent: number; missing: string[] }> = {
    dados: step1Percent(data),
    checklist: step2Percent(data),
    componentes: step3Percent(data),
    pack: step4Percent(data),
    cilindros: step5Percent(data),
    testes: step6Percent(data),
    boletins: step6CPercent(data),
    reparacoes: stepReparacoesPercent(data),
    contentor: stepContentorPercent(data),
    orcamento: step7Percent(data),
    artigos: stepArtigosSubstituidosPercent(data),
    resumo: step8Percent(data),
    certificados: step9Percent(data),
  };
  return steps.map((s) => makeStep(s.key, results[s.key] || { percent: 0, missing: [] }));
}

function makeStep(step: string, result: { percent: number; missing: string[] }): StepProgress {
  return {
    step,
    complete: result.percent >= 100 && result.missing.length === 0,
    percent: result.percent,
    missing: result.missing,
  };
}

function step1Percent(d: InspectionData) {
  const missing: string[] = [];
  if (!has(d.serial)) missing.push('Série');
  if (!has(d.brand)) missing.push('Marca');
  if (!has(d.model)) missing.push('Modelo');
  if (!has(d.packType)) missing.push('Tipo de pack');
  if (!has(d.capacity)) missing.push('Capacidade');
  if (!has(d.dataInspecao)) missing.push('Data da inspeção');
  if (!has(d.dataProxInspecao)) missing.push('Próxima inspeção');
  const fields = 7;
  const filled = fields - missing.length;
  return { percent: Math.round((filled / fields) * 100), missing };
}

function step2Percent(d: InspectionData) {
  const checklist = d.checklist || {};
  const total = ALL_CHECKLIST_IDS.length;
  const answered = ALL_CHECKLIST_IDS.filter((id) => ['OK', 'NA', 'SUBSTITUIDO'].includes(checklist[id]?.status || '') ||
    (checklist[id]?.status === 'REPROVADO' && checklist[id].justificacaoNaoSubstituicao?.trim())).length;
  const missing = getChecklistCompletionErrors(d);
  return { percent: Math.round((answered / total) * 100), missing };
}

function step3Percent(d: InspectionData) {
  const comps = d.componentes || [];
  if (comps.length === 0) return { percent: 100, missing: [] };
  const semValidade = comps.filter((c: any) => !has(c.validade)).length;
  const semRef = comps.filter((c: any) => !has(c.reference) && !has(c.stockId)).length;
  const missing: string[] = [];
  if (semValidade > 0) missing.push(`${semValidade} componente(s) sem validade`);
  if (semRef > 0) missing.push(`${semRef} componente(s) sem referência`);
  const answered = comps.length - (semValidade + semRef);
  return {
    percent: comps.length ? Math.round((answered / comps.length) * 100) : 100,
    missing,
  };
}

function step4Percent(d: InspectionData) {
  const definitions = getMandatoryPackItemsForRaft({ brand: d.brand, model: d.model, packType: d.packType, capacity: d.capacity as number });
  if (!definitions.length) return { percent: 0, missing: ['Lista de equipamento por confirmar'] };
  const items = definitions.map(definition => [definition.checklistName, (d.packItems || {})[definition.checklistName]] as const);
  const byKey = new Map(definitions.map(item => [item.checklistName, item]));
  const missing: string[] = [];
  const answered = items.filter(([key, item]) => {
    const definition = byKey.get(key)!;
    const label = item?.name || definition.label || key;
    const quantity = item?.quantidadeVerificada;
    const absent = quantity == null || String(quantity).trim() === '' || !Number.isFinite(Number(quantity));
    const insufficient = !absent && Number(quantity) < Number(definition.quantity);
    const missingValidity = definition.validityFieldName && Number(item?.quantidade) > 0 && !has(item?.validade);
    if (absent) missing.push(`${label}: quantidade verificada em falta`);
    else if (insufficient) missing.push(`${label}: quantidade verificada ${quantity}; necessária ${definition.quantity}`);
    if (missingValidity) missing.push(`${label}: validade da substituição em falta`);
    return !absent && !insufficient && !missingValidity;
  }).length;
  return {
    percent: items.length ? Math.round((answered / items.length) * 100) : 100,
    missing,
  };
}

function step5Percent(d: InspectionData) {
  const c = d.cylinder || {};
  const missing: string[] = [];
  const fields: [string, unknown][] = [
    ['Série cilindro', c.serial],
    ['Peso bruto', c.pesoBruto],
    ['Tara', c.tara],
    ['CO2', c.co2],
    ['N2', c.n2],
  ];
  let filled = 0;
  for (const [label, v] of fields) {
    if (has(v)) filled++;
    else missing.push(label);
  }
  return { percent: Math.round((filled / fields.length) * 100), missing };
}

function step6Percent(d: InspectionData) {
  const testes = d.testes || {};
  const results: [string, string][] = [
    ['testeWP', 'WP'],
    ['testeNAP', 'NAP'],
    ['testeFS', 'FS'],
    ['testeGI', 'GI'],
    ['testeDL', 'DL'],
  ];
  let filled = 0;
  const missing: string[] = [];
  for (const [k, label] of results) {
    if (has(testes[k])) filled++;
    else missing.push(label);
  }
  return { percent: Math.round((filled / results.length) * 100), missing };
}

function step6CPercent(_d: InspectionData) {
  // Os boletins de servico sao informativos. Nao contam para a percentagem do
  // passo nem bloqueiam a gravacao da inspecao.
  return { percent: 100, missing: [] };
}

function stepReparacoesPercent(d: InspectionData) {
  const repairs = (d.reparacoes || []).filter((r: any) => r.tipo || r.descricao);
  if (repairs.length === 0) return { percent: 0, missing: ['Indicar colagem/reparações'] };
  return { percent: 100, missing: [] };
}

function stepContentorPercent(_d: InspectionData) {
  // A seleção do equipamento de fecho do contentor é opcional: só se aplica
  // quando há substituição de cintas/autocolantes/HRU ou reparo. Não bloqueia.
  return { percent: 100, missing: [] };
}

function step7Percent(d: InspectionData) {
  const orc = d.orcamento;
  const linhas = (orc?.linhas || []).filter((l: any) => Number(l.quantidade) > 0 || Number(l.unitPrice) > 0);
  if (linhas.length === 0) return { percent: 0, missing: ['Orçamento por gerar (ou avançar sem faturação)'] };
  const aprovacao = orc?.aprovacaoWhatsApp;
  // A aprovação acontece no módulo de Orçamentos: no wizard basta submeter.
  if (aprovacao?.status === 'aprovado') return { percent: 100, missing: [] };
  if (aprovacao?.status === 'enviado') return { percent: 100, missing: [] };
  if (aprovacao?.status === 'rejeitado') return { percent: 60, missing: ['Rejeitado no módulo — ajustar e reenviar para análise'] };
  return { percent: 60, missing: ['Submeter o orçamento para análise'] };
}

function stepArtigosSubstituidosPercent(_d: InspectionData) {
  // Passo informativo (read-only) para técnicos: a lista de artigos substituídos
  // é derivada dos passos anteriores, pelo que nunca bloqueia o avanço.
  return { percent: 100, missing: [] };
}

function step8Percent(d: InspectionData) {
  // A assinatura do tecnico e opcional: quando nao existe (ou quando nao ha
  // como assinar no dispositivo) nao pode bloquear a gravacao da inspecao nem
  // a emissao do certificado. Fica apenas registada quando fornecida.
  if (!has(d.responsavel)) return { percent: 0, missing: ['Técnico responsável'] };
  return { percent: 100, missing: [] };
}

function step9Percent(d: InspectionData) {
  return { percent: has(d.certificadoNumero) || d._certGenerated ? 100 : 0, missing: [] };
}
