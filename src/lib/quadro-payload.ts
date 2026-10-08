import { dedupeRaftArticles } from "@/modules/rafts/mandatoryPack";
import { toDateKey } from "@/lib/date-utils";

// =============================================================
// Helpers de cálculo do teste de WP (partilhados entre dossier
// e histórico para garantir resultados idênticos)
// =============================================================

export function normalizePressureUnit(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'inhg') return 'inhg' as const;
  if (raw === 'mbar' || raw === 'mb' || raw === 'hpa') return 'hpa' as const;
  return 'inh2o' as const;
}

export function parseDecimalValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function convertPressureToMbar(value: unknown, unit: 'inh2o' | 'inhg' | 'hpa') {
  const parsed = parseDecimalValue(value);
  if (parsed === null) return null;
  if (unit === 'hpa') return parsed;
  if (unit === 'inhg') return parsed * 33.8638866667;
  return parsed * 2.490889;
}

export function convertMbarToUnit(value: number | null, unit: 'inh2o' | 'inhg' | 'hpa') {
  if (value === null || !Number.isFinite(value)) return null;
  if (unit === 'hpa') return value;
  if (unit === 'inhg') return value / 33.8638866667;
  return value / 2.490889;
}

export function formatDecimal(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '';
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function addMinutesToClock(value: unknown, minutesToAdd: number) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '';
  }
  const total = ((hours * 60 + minutes + minutesToAdd) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function buildWpDerivedValues(source: {
  pressureUnit?: unknown;
  startTime?: unknown;
  tempInitial?: unknown;
  tempFinal?: unknown;
  baroInitial?: unknown;
  baroFinal?: unknown;
  upperStart?: unknown;
  upperEnd?: unknown;
  lowerStart?: unknown;
  lowerEnd?: unknown;
}) {
  const unit = normalizePressureUnit(source.pressureUnit);
  const tempInitial = parseDecimalValue(source.tempInitial);
  const tempFinal = parseDecimalValue(source.tempFinal);
  const baroInitial = parseDecimalValue(source.baroInitial);
  const baroFinal = parseDecimalValue(source.baroFinal);
  const tempDelta = tempInitial !== null && tempFinal !== null ? tempFinal - tempInitial : null;
  const baroDelta = baroInitial !== null && baroFinal !== null ? baroFinal - baroInitial : null;
  const correctionTempMb = tempDelta !== null ? -(tempDelta * 4) : null;
  const correctionBaroMb = baroDelta !== null ? baroDelta : null;
  const totalCorrectionMb = correctionTempMb !== null && correctionBaroMb !== null
    ? correctionTempMb + correctionBaroMb
    : correctionTempMb ?? correctionBaroMb;
  const temperatureWithinManual = tempDelta === null ? null : Math.abs(tempDelta) <= 3.5;
  const endTime = addMinutesToClock(source.startTime, 60);

  const analyzeChamber = (startRaw: unknown, endRaw: unknown) => {
    const startMb = convertPressureToMbar(startRaw, unit);
    const endMb = convertPressureToMbar(endRaw, unit);
    const correctedEndMb = endMb !== null && totalCorrectionMb !== null ? endMb + totalCorrectionMb : endMb;
    const dropMbRaw = startMb !== null && correctedEndMb !== null ? startMb - correctedEndMb : null;
    const dropMb = dropMbRaw !== null ? Math.max(0, dropMbRaw) : null;
    const dropPercent = startMb !== null && startMb > 0 && dropMb !== null ? (dropMb / startMb) * 100 : null;
    const passes = dropPercent === null
      ? null
      : dropPercent <= 5 && temperatureWithinManual !== false;

    return {
      correctedEndMb,
      dropMb,
      dropPercent,
      passes,
      correctedEndDisplay: formatDecimal(convertMbarToUnit(correctedEndMb, unit)),
      dropDisplay: formatDecimal(convertMbarToUnit(dropMb, unit)),
      dropPercentDisplay: dropPercent === null ? '' : formatDecimal(dropPercent, 2),
    };
  };

  return {
    unit,
    endTime,
    tempDelta,
    correctionTempMb,
    correctionBaroMb,
    totalCorrectionMb,
    temperatureWithinManual,
    upper: analyzeChamber(source.upperStart, source.upperEnd),
    lower: analyzeChamber(source.lowerStart, source.lowerEnd),
  };
}

// =============================================================
// Construção do checklist do quadro a partir dos artigos.
// Fonte de verdade única para dossier e histórico.
// =============================================================

export type QuadroChecklistSource = {
  inspectionChecklistValues?: Record<string, unknown> | null;
  artigos?: Array<{
    name?: string;
    descricao?: string;
    referencia?: string | null;
    validade?: string | null;
    quantidade?: number;
    codigoFabricante?: string | null;
  }> | null;
  prevArtigos?: Array<{
    name?: string;
    descricao?: string;
    referencia?: string | null;
    validade?: string | null;
    quantidade?: number;
    codigoFabricante?: string | null;
  }> | null;
  testeWP?: unknown;
  testeNAP?: unknown;
  testeFS?: unknown;
  testeGI?: unknown;
  testeDL?: unknown;
  hruValidade?: unknown;
  hruSerial?: unknown;
  dataInspecao?: unknown;
  cylinderDataTeste?: unknown;
};

export function buildQuadroChecklistPayload(source: QuadroChecklistSource): Record<string, unknown> {
  const checklist: Record<string, unknown> = {
    ...(source.inspectionChecklistValues || {})
  };
  const arts = source.artigos || [];

  const normalizeText = (text: string) => {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const findArticle = (tokens: string[]) => {
    const dedupedArticles = dedupeRaftArticles(arts as any);
    const matches = (art: any, test: (nameNorm: string) => boolean) => {
      const nameNorm = normalizeText(art.name || '');
      return nameNorm ? test(nameNorm) : false;
    };

    // Correspondencia exacta primeiro. Sem isto, mapArticle(['lanterna']) ia
    // buscar "Pilhas para Lanterna" (contem "lanterna") em vez de "Lanterna",
    // e a referencia e a validade da lanterna ficavam na linha das pilhas.
    const tokenNorms = tokens.map(normalizeText).filter(Boolean);
    const exact = dedupedArticles.find((art: any) => matches(art, (n) => n === tokenNorms.join(' ')));
    if (exact) return exact;

    return dedupedArticles.find((art: any) =>
      matches(art, (n) => tokenNorms.every((token) => n.includes(token)))
    );
  };

  const mapArticle = (tokens: string[], refKey?: string, valKey?: string, qtyKey?: string, statusKey?: string, explicitReplacementKey?: string) => {
    const art = findArticle(tokens);
    if (art) {
      if (refKey && art.referencia) checklist[refKey] = art.referencia;
      if (valKey && art.validade) {
        // art.validade e um DateTime do Prisma. String(date) produz
        // "Wed Sep 01 2027 00:00:00 GMT+0000 (...)", que nao contem 'T' e
        // passava inteiro para a celula — dai o "Wed Sep" no quadro.
        // toDateKey devolve sempre YYYY-MM-DD.
        const valIso = toDateKey(art.validade);
        if (valIso) checklist[valKey] = valIso;
      }
      if (qtyKey && art.quantidade !== undefined) checklist[qtyKey] = art.quantidade;
      if (statusKey) checklist[statusKey] = 'YES';
      if (explicitReplacementKey) {
        const replacedItem = (source.prevArtigos || []).find((r: any) =>
          (r.referencia && art.referencia && r.referencia === art.referencia) ||
          (r.name && art.name && normalizeText(r.name).includes(normalizeText(art.name)))
        );
        const replacedQty = replacedItem ? Number(replacedItem.quantidade || 0) : 0;
        if (replacedQty > 0) {
          checklist[explicitReplacementKey] = replacedQty;
        } else {
          delete checklist[explicitReplacementKey];
        }
      }
    } else if (statusKey) {
      checklist[statusKey] = 'NO';
    }
  };

  mapArticle(['farmacia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
  if (!checklist.ref_farmacia) mapArticle(['ambulancia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
  if (!checklist.ref_farmacia) mapArticle(['first', 'aid'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
  if (!checklist.ref_farmacia) mapArticle(['socorros'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');

  mapArticle(['comprimido'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
  if (!checklist.ref_comprimidos) mapArticle(['pastilha'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
  if (!checklist.ref_comprimidos) mapArticle(['enjoo'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
  if (!checklist.ref_comprimidos) mapArticle(['seasick'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
  if (!checklist.ref_comprimidos) mapArticle(['tables'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');

  mapArticle(['paraquedas'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
  if (!checklist.ref_paraquedas) mapArticle(['parachute'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
  if (!checklist.ref_paraquedas) mapArticle(['rocket'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');

  mapArticle(['facho'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');
  if (!checklist.ref_fachos) mapArticle(['handflare'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');
  if (!checklist.ref_fachos) mapArticle(['handflares'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');

  mapArticle(['fumo'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
  if (!checklist.ref_potes) mapArticle(['smoke'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
  if (!checklist.ref_potes) mapArticle(['fumigeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
  if (!checklist.ref_potes) mapArticle(['fumígeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');

  mapArticle(['lanterna'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna');
  if (!checklist.ref_lanterna) mapArticle(['torch'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna');

  // Pilhas (lanterna) e bateria de lítio são artigos independentes: só as pilhas
  // preenchem a linha "Pilhas para Lanterna" e só a bateria de lítio a sua linha própria.
  mapArticle(['pilha'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'substituicao_explicita__pilhas_para_lanterna');
  if (!checklist.ref_bateria) mapArticle(['torch', 'batter'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'substituicao_explicita__pilhas_para_lanterna');

  mapArticle(['bateria', 'litio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');
  if (!checklist.ref_bateria_litio) mapArticle(['bateria', 'lítio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');
  if (!checklist.ref_bateria_litio) mapArticle(['bateria', 'lithium'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');

  mapArticle(['cinta', 'fecho'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
  if (!checklist.ref_cinta_fecho) mapArticle(['bursting', 'band'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');
  if (!checklist.ref_cinta_fecho) mapArticle(['bursting', 'tape'], 'ref_cinta_fecho', undefined, 'qtd_cinta_fecho', 'cinta_fecho');

  mapArticle(['jogo', 'repara'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');
  if (!checklist.ref_jogo_reparacao) mapArticle(['repair', 'kit'], 'ref_jogo_reparacao', undefined, 'qtd_jogo_reparacao', 'jogo_reparacao');

  mapArticle(['luz', 'ext'], undefined, 'validade_luzes_exteriores', undefined, 'luz_exterior_bateria');
  mapArticle(['luz', 'int'], undefined, 'validade_bateria', undefined, 'luz_interior_bateria');

  mapArticle(['agua'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
  if (!checklist.ref_agua) mapArticle(['água'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');
  if (!checklist.ref_agua) mapArticle(['water'], 'ref_agua', 'validade_agua', undefined, 'saco_agua');

  mapArticle(['racao'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
  if (!checklist.ref_racoes) mapArticle(['ração'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
  if (!checklist.ref_racoes) mapArticle(['racoes'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
  if (!checklist.ref_racoes) mapArticle(['rações'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
  if (!checklist.ref_racoes) mapArticle(['ration'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');
  if (!checklist.ref_racoes) mapArticle(['food'], 'ref_racoes', 'validade_racoes', undefined, 'racoes_alimentares');

  checklist.teste_wp = source.testeWP || 'N/A';
  checklist.teste_nap = source.testeNAP || 'N/A';
  checklist.teste_fs = source.testeFS || 'N/A';
  checklist.teste_gi = source.testeGI || 'N/A';
  checklist.teste_dl = source.testeDL || 'N/A';

  // HRU validade com dias restantes
  if (source.hruValidade) {
    const hruVal = String(source.hruValidade);
    checklist.hru_val = hruVal.includes('T') ? hruVal.slice(0, 7) : hruVal;
    const refDate = source.dataInspecao ? new Date(String(source.dataInspecao)) : new Date();
    const [vYear, vMonth] = String(checklist.hru_val).split('-').map(Number);
    const expDate = new Date(vYear, (vMonth || 1) - 1, 1);
    const diffDays = Math.ceil((expDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
    checklist.hru_days = diffDays;
  }
  if (source.hruSerial) {
    checklist.hru_serial = String(source.hruSerial);
  }

  // Cilindro teste hidrostático com dias restantes
  if (source.cylinderDataTeste) {
    const cylVal = String(source.cylinderDataTeste);
    checklist.cyl_test_val = cylVal.includes('T') ? cylVal.slice(0, 7) : cylVal;
    const refDate = source.dataInspecao ? new Date(String(source.dataInspecao)) : new Date();
    // Próximo teste = 5 anos após último
    const [tYear, tMonth] = String(checklist.cyl_test_val).split('-').map(Number);
    const nextTestDate = new Date((tYear || 0) + 5, (tMonth || 1) - 1, 1);
    const diffDays = Math.ceil((nextTestDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
    checklist.cyl_test_days = diffDays;
  }

  return checklist;
}
