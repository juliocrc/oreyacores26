import type { InspectionData } from './types';
import { getWizardSteps } from './steps';

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

export function getStepProgress(data: InspectionData): StepProgress[] {
  const steps = getWizardSteps(data);
  const results: Record<string, { percent: number; missing: string[] }> = {
    dados: step1Percent(data),
    checklist: step2Percent(data),
    componentes: step3Percent(data),
    pack: step4Percent(data),
    cilindros: step5Percent(data),
    testes: step6Percent(data),
    reparacoes: stepReparacoesPercent(data),
    orcamento: step7Percent(data),
    resumo: step8Percent(data),
    certificados: step9Percent(data),
    historico: step10Percent(data),
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
  const ids = Object.keys(checklist);
  if (ids.length === 0) return { percent: 0, missing: ['Checklist por preencher'] };
  const answered = ids.filter((id) => has(checklist[id]?.status)).length;
  const reprovados = ids.filter((id) => checklist[id]?.status === 'REPROVADO');
  const missing: string[] = [];
  if (answered < ids.length) missing.push(`${ids.length - answered} item(s) sem estado`);
  if (reprovados.length > 0) missing.push(`${reprovados.length} reprovado(s) — usar Passo Resumo`);
  return { percent: Math.round((answered / ids.length) * 100), missing };
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
  const items = Object.values(d.packItems || {});
  if (items.length === 0) return { percent: 0, missing: ['Pack por preencher'] };
  const substituidos = items.filter((i: any) => Number(i.quantidade) > 0);
  let answered = items.length;
  const missing: string[] = [];
  const susSemValidade = substituidos.filter((i: any) => !has(i.validade)).length;
  if (susSemValidade > 0) {
    answered -= susSemValidade;
    missing.push(`${susSemValidade} substituído(s) sem nova validade`);
  }
  for (const item of items) {
    if (!has(item.quantidadeVerificada) && !has(item.quantidade)) {
      answered -= 1;
      missing.push('Verificar quantidades do pack');
      break;
    }
  }
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

function stepReparacoesPercent(d: InspectionData) {
  const repairs = (d.reparacoes || []).filter((r: any) => r.tipo || r.descricao);
  if (repairs.length === 0) return { percent: 0, missing: ['Indicar colagem/reparações'] };
  return { percent: 100, missing: [] };
}

function step7Percent(d: InspectionData) {
  const orc = d.orcamento;
  const linhas = (orc?.linhas || []).filter((l: any) => Number(l.quantidade) > 0 || Number(l.unitPrice) > 0);
  if (linhas.length === 0) return { percent: 0, missing: ['Orçamento por gerar (ou avançar sem faturação)'] };
  const aprovacao = orc?.aprovacaoWhatsApp;
  if (aprovacao?.status === 'aprovado') return { percent: 100, missing: [] };
  if (aprovacao?.status === 'enviado') return { percent: 70, missing: ['Aguardar resposta do cliente'] };
  if (aprovacao?.status === 'rejeitado') return { percent: 50, missing: ['Cliente rejeitou — ajustar e reenviar'] };
  return { percent: 40, missing: ['Orçamento por aprovar (enviar via WhatsApp)'] };
}

function step8Percent(d: InspectionData) {
  let filled = 0;
  const missing: string[] = [];
  if (has(d.responsavel)) filled++;
  else missing.push('Técnico responsável');
  if (has(d.signatureBase64)) filled++;
  else missing.push('Assinatura do técnico');
  return { percent: Math.round((filled / 2) * 100), missing };
}

function step9Percent(d: InspectionData) {
  return { percent: has(d.certificadoNumero) || d._certGenerated ? 100 : 0, missing: [] };
}

function step10Percent(_d: InspectionData) {
  return { percent: 100, missing: [] };
}
