import { parseMonthYearValue, toDateKey } from '@/lib/date-utils';
import { getValidityCoverageStatus } from '@/lib/stock-validity';
import { isArticleValidityRequired } from '../rafts/mandatoryPack';
import type { InspectionData } from './types';
import type { ChecklistSection } from '../inspectionChecklist';
import { getInspectionIntervalYears } from '../rafts/inspectionInterval';
import { isServiceResourceReference } from '@/lib/stock-reference-rules';
import { withoutSosEquipment } from './sosRules';
import { installedHruDue, isHammarH20RReference, validateHammarH20R } from '@/lib/hammar-h20';

export function resolveArticleNextInspection(data: { dataProxInspecao?: string; dataInspecao?: string; brand?: string; model?: string; shipDetails?: unknown }) {
  if (data.dataProxInspecao) return data.dataProxInspecao;
  const date = parseMonthYearValue(data.dataInspecao);
  if (!date) return '';
  const years = getInspectionIntervalYears(data.brand || '', data.model || '', data.shipDetails);
  const day = toDateKey(data.dataInspecao).slice(8, 10) || '01';
  return `${date.year + years}-${String(date.month).padStart(2, '0')}-${day}`;
}

export function getBooleanArticleExpiryErrors(sections: ChecklistSection[], values: Record<string, unknown>, nextInspection: string) {
  return sections.flatMap(s => s.fields).filter(f => f.name.startsWith('validade_')).flatMap(field => {
    const status = getArticleExpiryStatus(String(values[field.name] || ''), nextInspection);
    if (status === 'ok' || (status === 'replace' && String(values[`${field.name}_justificacaoNaoSubstituicao`] || '').trim())) return [];
    return [`${field.label}: ${getArticleExpiryReason(String(values[field.name] || ''), nextInspection)}`];
  });
}

export function getArticleExpiryStatus(validade: string | undefined, nextInspection: string | undefined) {
  return getValidityCoverageStatus(validade, nextInspection);
}

export function isComponentExpiryControlled(item: { expiryControlled?: boolean; validade?: string }) {
  return item.expiryControlled ?? Boolean(item.validade);
}

export const ARTICLE_EXPIRY_REASON = 'Substituição obrigatória: a validade deve cobrir até à próxima inspeção, inclusive. Sem substituição, é obrigatória uma justificação por artigo; a exceção não declara conformidade.';

export function getArticleExpiryReason(validade: string | undefined, nextInspection: string | undefined) {
  const status = getArticleExpiryStatus(validade, nextInspection);
  if (status === 'pending') return 'Validade ou próxima inspeção em falta/inválida. Confirme a data.';
  if (status === 'ok') return '';
  return `O artigo expira antes da próxima inspeção. ${ARTICLE_EXPIRY_REASON}`;
}

export function isHandFlareArticle(name?: string) {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /facho|fogos?demao|handflares?/.test(normalized);
}

// A dated installed article or a matching saved inspection entry is evidence;
// a bare legacy auto-filled checklist date is not.
export function hasHandFlareValiditySource(articles: { name?: string; validade?: string | null }[] | undefined, values: Record<string, unknown>, snapshot?: Record<string, unknown> | null) {
  if ((articles || []).some(item => isHandFlareArticle(item.name) && parseMonthYearValue(item.validade))) return true;
  const saved = values.validade_fachos_mao;
  if (typeof saved !== 'string' || !parseMonthYearValue(saved)) return false;
  const savedMonth = parseMonthYearValue(saved)!;
  const sameMonth = (value: unknown) => {
    const parsed = typeof value === 'string' ? parseMonthYearValue(value) : null;
    return parsed?.year === savedMonth.year && parsed?.month === savedMonth.month;
  };
  const rich = snapshot?.fachos_mao as { validade?: string } | undefined;
  if (rich?.validade && sameMonth(rich.validade)) return true;
  const expiry = snapshot?._articleExpiry as { packItems?: Record<string, { name?: string; validade?: string }> } | undefined;
  return Object.values(expiry?.packItems || {}).some(item => isHandFlareArticle(item.name) && sameMonth(item.validade));
}

export function getArticleExpiryWarnings(data: Partial<InspectionData>) {
  data = withoutSosEquipment(data);
  if (data.abate?.ativo) return [];
  const nextInspection = resolveArticleNextInspection(data);
  const warnings: { text: string; stepKey: string; isCritical: boolean; articleKey: string }[] = [];
  const check = (name: string, validade: string | undefined, replaced: boolean, reason: unknown, stepKey: string, articleKey: string) => {
    const status = getArticleExpiryStatus(validade, nextInspection);
    if (status === 'ok') return;
    if (status === 'pending') {
      warnings.push({ text: `${name}: validade ou próxima inspeção em falta/inválida. Confirme mês/ano.`, stepKey, articleKey, isCritical: true });
    } else {
      const justification = typeof reason === 'string' ? reason.trim() : '';
      warnings.push({ text: `${name}: ${getArticleExpiryReason(validade, nextInspection)} ${replaced ? 'A substituição registada continua com validade insuficiente. ' : ''}${justification ? `Justificação: ${justification}. Esta exceção não declara conformidade.` : 'Registe uma validade suficiente ou justificação por artigo.'}`, stepKey, articleKey, isCritical: !justification });
    }
  };
  for (const [id, item] of Object.entries(data.packItems || {})) {
    if (isServiceResourceReference(item.referencia)) continue;
    if (isArticleValidityRequired({ name: item.name, referencia: item.referencia })) {
      check(item.name, item.validade, Number(item.quantidade) > 0, item.justificacaoNaoSubstituicao, 'pack', `pack:${id}`);
    }
  }
  for (const [index, item] of (data.componentes || []).entries()) {
    if (isServiceResourceReference(item.reference)) continue;
    if (data.hruAplicavel === 'SIM' && /\b(?:HRU|HAMMAR|H20)\b/i.test(`${item.type || ''} ${item.reference || ''}`)) continue;
    if (!isComponentExpiryControlled(item)) continue;
    check(item.type || item.reference || 'Componente', item.validade, item.estado === 'SUBSTITUIDO', item.justificacaoNaoSubstituicao, 'componentes', `componentes:${item.id || index}`);
  }
  for (const [id, item] of Object.entries(data.checklist || {})) {
    if (id.startsWith('_') || !item || ['NA', 'N/A'].includes(item.status || '')) continue;
    if (item.validade !== undefined || ['luz_exterior_bateria', 'luz_interior_bateria'].includes(id)) {
      check(id.replace(/_/g, ' '), item.validade, item.status === 'SUBSTITUIDO', item.justificacaoNaoSubstituicao, 'checklist', `checklist:${id}`);
    }
  }
  if (data.hruAplicavel === 'SIM') {
    const due = installedHruDue(data.hruReference, data.hruDataInstalacao);
    if (data.hruSubstituido === true && isHammarH20RReference(data.hruReference)) {
      const issue = validateHammarH20R({ verified: data.hruHammarVerified, installation: data.hruDataInstalacao, expiry: due, inspectionDate: data.dataInspecao });
      if (issue) warnings.push({ text: `Hammar H20 R: ${issue}`, stepKey: 'componentes', articleKey: 'hru-hammar', isCritical: true });
    }
    if (due) check('HRU (prazo após instalação)', due, data.hruSubstituido === true, data.hruJustificacaoNaoSubstituicao, 'componentes', 'hru');
    else warnings.push({ text: 'HRU: confirme o modelo e a data real de instalação; o prazo não foi calculado.', stepKey: 'componentes', articleKey: 'hru-installation', isCritical: false });
  }
  return warnings;
}

// Persist corrections and exceptions independently of stock movements.
export function buildArticleExpirySnapshot(data: InspectionData) {
  data = withoutSosEquipment(data);
  return {
    packItems: data.packItems, componentes: data.componentes,
    hruAplicavel: data.hruAplicavel, hruExpiry: data.hruExpiry, hruValidade: data.hruValidade,
    hruSubstituido: data.hruSubstituido, hruJustificacaoNaoSubstituicao: data.hruJustificacaoNaoSubstituicao,
    hruDataInstalacao: data.hruDataInstalacao, hruHammarVerified: data.hruHammarVerified,
  };
}
