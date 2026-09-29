import type { InspectionData } from "./types";
import { getMandatoryPackItemsForRaft } from "../rafts/mandatoryPack";

/**
 * Construção do payload partilhado de emissão do certificado e do quadro de
 * inspeção. Fonte única para o Step9 (emissão manual) e para o auto-save no
 * Step8 (gravação automática na pasta do navio na finalização).
 */
export function buildCertificatePayload(
  inspectionData: InspectionData,
  jangadaId?: string | number | null,
  inspecaoId?: string | number | null,
) {
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

    const mapItem = (tokens: string[], refKey?: string, valKey?: string, qtyKey?: string, statusKey?: string, explicitReplacementKey?: string) => {
      const packItem = findPackItem(tokens);
      const mandItem = findMandatoryItem(tokens);

      // Só conta como substituído um artigo com substituição registada (quantidade > 0).
      // Sem registo, o artigo é considerado verificado — nunca se recorre à quantidade
      // obrigatória do template para marcar substituição no checklist.
      const quantidade = packItem && Number(packItem.quantidade) > 0 ? Number(packItem.quantidade) : 0;
      const referencia = packItem?.referencia || mandItem?.stockReferences?.[0] || '';
      const validade = packItem?.validade || '';

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
      if (explicitReplacementKey && quantidade > 0) {
        checklist[explicitReplacementKey] = quantidade;
      }
    };

    mapItem(['farmacia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapItem(['ambulancia'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapItem(['first', 'aid'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');
    if (!checklist.ref_farmacia) mapItem(['socorros'], 'ref_farmacia', 'validade_farmacia', 'qtd_farmacia', 'ambulancia', 'substituicao_explicita__farmacia');

    mapItem(['comprimido'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapItem(['pastilha'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapItem(['enjoo'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapItem(['seasick'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');
    if (!checklist.ref_comprimidos) mapItem(['tables'], 'ref_comprimidos', 'validade_comprimidos', 'qtd_comprimidos', 'comprimidos_enjoo', 'substituicao_explicita__comprimidos_p_enjoo');

    mapItem(['paraquedas'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
    if (!checklist.ref_paraquedas) mapItem(['parachute'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');
    if (!checklist.ref_paraquedas) mapItem(['rocket'], 'ref_paraquedas', 'validade_paraquedas', 'qtd_paraquedas', 'foguetoes_paraquedas', 'substituicao_explicita__foguetes_paraquedas');

    mapItem(['facho'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');
    if (!checklist.ref_fachos) mapItem(['handflare'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');
    if (!checklist.ref_fachos) mapItem(['handflares'], 'ref_fachos', 'validade_fachos_mao', 'qtd_fachos', 'fachos_mao', 'substituicao_explicita__fachos_de_mao');

    mapItem(['fumo'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapItem(['smoke'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapItem(['fumigeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');
    if (!checklist.ref_potes) mapItem(['fumígeno'], 'ref_potes', 'validade_potes_fumo', 'qtd_potes', 'potes_fumo', 'substituicao_explicita__potes_de_fumo');

    mapItem(['lanterna'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna');
    if (!checklist.ref_lanterna) mapItem(['torch'], 'ref_lanterna', 'validade_lanterna', 'qtd_lanterna', 'lanterna');

    mapItem(['pilha'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'substituicao_explicita__pilhas_para_lanterna');
    if (!checklist.ref_bateria) mapItem(['torch', 'batter'], 'ref_bateria', 'validade_pilhas_lanterna', 'qtd_pilhas_lanterna', 'pilhas_lanterna', 'substituicao_explicita__pilhas_para_lanterna');

    mapItem(['bateria', 'litio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');
    if (!checklist.ref_bateria_litio) mapItem(['bateria', 'lítio'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');
    if (!checklist.ref_bateria_litio) mapItem(['bateria', 'lithium'], 'ref_bateria_litio', 'validade_bateria', 'qtd_bateria_litio', 'bateria_litio');

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

    if (inspectionData.hruSerial) checklist.hru_serial = String(inspectionData.hruSerial);

    return checklist;
  };

  const rawUnit = testes.wpUnidadePressao || testes.testeWPUnidadePressao || 'hpa';
  const unit = rawUnit;

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
    hruSerial: inspectionData.hruSerial || '',
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
}