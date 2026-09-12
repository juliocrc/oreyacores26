import { findRaftTechnicalModel } from '@/modules/rafts/raftModelData';

type TestResult = 'YES' | 'NO' | 'N/A';

export type AutomaticRaftTests = {
  testeWP: TestResult;
  testeNAP: TestResult;
  testeFS: TestResult;
  testeGI: TestResult;
  testeDL: TestResult;
  isDlOverloadDue: boolean;
  ageYears: number | null;
  source: 'manufacturer' | 'age' | 'unknown-age';
  technicalModelName: string | null;
};

export type TestRecommendationStatus = 'required' | 'optional' | 'not-required' | 'overdue' | 'unknown';

export type TestRecommendation = {
  testId: string;
  label: string;
  shortLabel: string;
  status: TestRecommendationStatus;
  reason: string;
  detail: string;
  requiredByDefault: boolean;
  isGiDueThisYear: boolean;
  nextGiYear: number | null;
  isFirstYear: boolean;
  ageYears: number | null;
};

type ManufacturerRuleContext = {
  brand?: string | null;
  model?: string | null;
  launchType?: string | null;
  dataFabrico?: string | null;
  inspectionDate?: string | null;
  ageYears: number | null;
  technicalModelName: string | null;
};

type ManufacturerRule = {
  technicalModels: string[];
  resolve: (context: ManufacturerRuleContext) => Partial<AutomaticRaftTests> | null;
};

const MANUFACTURER_RULES: ManufacturerRule[] = [];

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildSafeDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseFlexibleDate(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const monthYearMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYearMatch) {
    const month = Number(monthYearMatch[1]);
    const year = Number(monthYearMatch[2]);
    return buildSafeDate(year, month, 1);
  }

  const isoMonthMatch = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMonthMatch) {
    const year = Number(isoMonthMatch[1]);
    const month = Number(isoMonthMatch[2]);
    return buildSafeDate(year, month, 1);
  }

  const isoLikeMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoLikeMatch) {
    const year = Number(isoLikeMatch[1]);
    const second = Number(isoLikeMatch[2]);
    const third = Number(isoLikeMatch[3]);
    return buildSafeDate(year, second, third) || (second > 12 ? buildSafeDate(year, third, second) : null);
  }

  const dmyMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[T\s].*)?$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    return buildSafeDate(year, month, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateFullYears(manufactureDate: Date | null, referenceDate: Date | null) {
  if (!manufactureDate || !referenceDate) return null;
  if (referenceDate.getTime() < manufactureDate.getTime()) return 0;

  let years = referenceDate.getFullYear() - manufactureDate.getFullYear();
  const monthDelta = referenceDate.getMonth() - manufactureDate.getMonth();
  const dayDelta = referenceDate.getDate() - manufactureDate.getDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    years -= 1;
  }

  return Math.max(0, years);
}

function normalizeLaunchType(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.includes('davit') || normalized === 'dl') return 'DL';
  if (normalized.includes('throw') || normalized.includes('over') || normalized === 'to') return 'TO';
  return String(value || '').trim().toUpperCase();
}

function getFallbackTests(ageYears: number | null, launchType?: string | null): AutomaticRaftTests {
  const normalizedLaunchType = normalizeLaunchType(launchType);
  const hasKnownAge = ageYears !== null;
  const isDavit = normalizedLaunchType === 'DL';
  const giDue = hasKnownAge && ageYears >= 5 && ageYears % 5 === 0;
  const fsDue = hasKnownAge && ageYears >= 10;
  const napDue = fsDue;
  const dlOverloadDue = isDavit && (ageYears === null || (ageYears > 0 && ageYears % 2 === 0));

  return {
    testeWP: 'YES',
    testeNAP: napDue ? 'YES' : 'NO',
    testeFS: fsDue ? 'YES' : 'NO',
    testeGI: giDue ? 'YES' : 'NO',
    testeDL: isDavit ? (dlOverloadDue ? 'YES' : 'NO') : 'N/A',
    isDlOverloadDue: dlOverloadDue,
    ageYears,
    source: hasKnownAge ? 'age' : 'unknown-age',
    technicalModelName: null,
  };
}

function resolveManufacturerRule(context: ManufacturerRuleContext) {
  const normalizedTechnicalModel = normalizeText(context.technicalModelName);
  if (!normalizedTechnicalModel) return null;

  const rule = MANUFACTURER_RULES.find((candidate) =>
    candidate.technicalModels.some((model) => normalizeText(model) === normalizedTechnicalModel)
  );

  if (!rule) return null;
  return rule.resolve(context);
}

export function getAutomaticRaftTests(args: {
  brand?: string | null;
  model?: string | null;
  launchType?: string | null;
  dataFabrico?: string | null;
  inspectionDate?: string | null;
}): AutomaticRaftTests {
  const technicalModel = findRaftTechnicalModel(args.brand, args.model);
  const technicalModelName = String(technicalModel?.name || '').trim() || null;
  const manufactureDate = parseFlexibleDate(args.dataFabrico);
  const referenceDate = parseFlexibleDate(args.inspectionDate) || new Date();
  const ageYears = calculateFullYears(manufactureDate, referenceDate);

  const fallback = getFallbackTests(ageYears, args.launchType);
  const manufacturerOverride = resolveManufacturerRule({
    ...args,
    ageYears,
    technicalModelName,
  });

  if (!manufacturerOverride) {
    return {
      ...fallback,
      technicalModelName,
    };
  }

  return {
    ...fallback,
    ...manufacturerOverride,
    source: 'manufacturer',
    ageYears,
    technicalModelName,
  };
}

function getNextGiYear(ageYears: number | null): number | null {
  if (ageYears === null) return null;
  if (ageYears < 5) return 5;
  const remainder = ageYears % 5;
  if (remainder === 0) return ageYears;
  return ageYears + (5 - remainder);
}

export function getTestRecommendations(args: {
  brand?: string | null;
  model?: string | null;
  launchType?: string | null;
  dataFabrico?: string | null;
  inspectionDate?: string | null;
}): TestRecommendation[] {
  const automatic = getAutomaticRaftTests(args);
  const age = automatic.ageYears;
  const normalizedLaunchType = normalizeLaunchType(args.launchType);
  const isDavit = normalizedLaunchType === 'DL';
  const hasNextGi = age !== null && age >= 5 && age % 5 === 0;
  const nextGiYear = getNextGiYear(age);

  const buildRec = (
    testId: string,
    label: string,
    shortLabel: string,
    testResult: TestResult,
    requiredByDefault: boolean,
    reason: string,
    detail: string,
  ): TestRecommendation => {
    let status: TestRecommendationStatus;
    if (testResult === 'N/A') {
      status = 'not-required';
    } else if (testResult === 'YES') {
      status = 'required';
    } else {
      status = requiredByDefault ? 'required' : 'optional';
    }

    if (age !== null && age >= 5 && testId === 'testeGI' && age % 5 !== 0) {
      status = 'overdue';
    }

    return {
      testId,
      label,
      shortLabel,
      status,
      reason,
      detail,
      requiredByDefault,
      isGiDueThisYear: hasNextGi,
      nextGiYear,
      isFirstYear: age === 0 || age === null,
      ageYears: age,
    };
  };

  const wpRec = buildRec(
    'testeWP',
    'Working Pressure',
    'WP',
    automatic.testeWP,
    true,
    'Sempre obrigatório em toda inspeção anual.',
    age !== null
      ? `Jangada com ${age} ano(s). Teste WP obrigatório para qualquer idade.`
      : 'Idade desconhecida — teste WP sempre obrigatório.',
  );

  const giRec = buildRec(
    'testeGI',
    'Gas Inflation',
    'GI',
    automatic.testeGI,
    hasNextGi,
    hasNextGi
      ? `Ano ${age} — GI obrigatório (de 5 em 5 anos desde fabrico).`
      : age !== null && age < 5
        ? `Jangada com ${age} ano(s). GI não necessário ainda (primeiro GI aos 5 anos).`
        : age !== null
          ? `Jangada com ${age} ano(s). GI não é obrigatório neste ano (próximo: ano ${nextGiYear}).`
          : 'Idade desconhecida — GI recomendado de 5 em 5 anos.',
    hasNextGi
      ? `GI obrigatório — ${age} anos desde fabrico (múltiplo de 5).`
      : age !== null && age < 5
        ? `Próximo GI previsto para daqui a ${5 - age} ano(s).`
        : nextGiYear !== null
          ? `Próximo GI previsto no ano ${nextGiYear} (daqui a ${nextGiYear - (age || 0)} ano(s)).`
          : 'Consultar fabricante para calendário de GI.',
  );

  const fsRequired = age !== null && age >= 10;
  const napRequired = fsRequired;

  const fsRec = buildRec(
    'testeFS',
    'Floor Seam',
    'FS',
    automatic.testeFS,
    fsRequired,
    fsRequired
      ? `Jangada com ${age} anos — FS obrigatório (a partir do 10º ano, anual).`
      : age !== null
        ? `Jangada com ${age} anos — teste FS inicia no 10º ano.`
        : 'Idade desconhecida — FS obrigatório a partir do 10º ano.',
    fsRequired
      ? `FS obrigatório — ${age} anos (a partir do 10º ano, anual).`
      : age !== null && age < 10
        ? `Próximo FS previsto no ano 10 (daqui a ${10 - age} ano(s)).`
        : 'Consultar fabricante.',
  );

  const napRec = buildRec(
    'testeNAP',
    'Necessary Additional Pressure',
    'NAP',
    automatic.testeNAP,
    napRequired,
    napRequired
      ? `Jangada com ${age} anos — NAP obrigatório (anual após o 10º ano, incluindo anos de GI).`
      : age !== null
        ? `Jangada com ${age} anos — teste NAP inicia no ano 10.`
        : 'Idade desconhecida — NAP obrigatório a partir do 10º ano.',
    napRequired
      ? `NAP obrigatório — ${age} anos (anual após o 10º ano; A.761(18) Anexo 2 e manual do fabricante).`
      : age !== null && age < 10
        ? `Próximo NAP previsto no ano 10 (daqui a ${10 - age} ano(s)).`
        : 'Consultar fabricante.',
  );

  const dlOverloadDue = Boolean(automatic.isDlOverloadDue);
  const dlRec = buildRec(
    'testeDL',
    'Davit Load',
    'DL',
    automatic.testeDL,
    isDavit && dlOverloadDue,
    isDavit
      ? dlOverloadDue
        ? `Teste DL obrigatório — suspensão/sobrecarga (10%) a cada 2º serviço.`
        : `Ano sem suspensão com sobrecarga — executar apenas o teste operacional de libertação do gancho.`
      : `Tipo de lançamento: ${args.launchType || 'Desconhecido'} — DL não aplicável (apenas Davit-Launch).`,
    isDavit
      ? dlOverloadDue
        ? 'Teste de suspensão com sobrecarga de 10% (A.761(18)/USCG) — a cada 2º serviço anual.'
        : 'Suspensão com sobrecarga de 10% apenas a cada 2º serviço; este ano basta a libertação operacional.'
      : 'DL apenas aplicável a jangadas com lançamento por davit/turco.',
  );

  return [wpRec, giRec, fsRec, napRec, dlRec];
}