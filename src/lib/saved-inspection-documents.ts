import prisma from '@/lib/prisma';
import { getAuthSession } from '@/auth';
import { isPortalInspectionCertified } from '@/lib/portal-inspection-documents';
import { getAccessContext } from '@/lib/access-control';
import { getInspectionSnapshot } from '@/lib/inspection-snapshots';
import { normalizeInspectionChecklistValues, readInspectionChecklistValues } from '@/lib/inspection-checklist-store';
import { toDateKey } from '@/lib/date-utils';
import { buildInspectionCertificateInput, resolveInspectionTechnician } from '@/lib/certificate-input-from-jangada';
import { buildOreyCertificateTemplateInput } from '@/lib/orey-certificate-input';
import { buildWpDerivedValues } from '@/lib/quadro-payload';
import type { buildCarimbadoCertificatePdf } from '@/lib/certificate-carimbado-pdf';
import type { QuadroTemplateInput } from '@/lib/quadro-template';
import { isSosDocumentRaft } from '@/lib/raft-document-rules';

export class InspectionDocumentError extends Error {
  constructor(message: string, public status: number, public missingMetadata?: string[]) { super(message); }
}

// Compare instants identically before and after JSON serialization. Date-only
// values remain civil dates; never accept a different day as an alias match.
function documentDate(value: unknown) {
  const key = toDateKey(value);
  const parsed = new Date(`${key}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return toDateKey(new Date(value));
  return key;
}

export async function requirePortalClienteId(previewClienteId?: string | null) {
  const session = await getAuthSession();
  if (!session?.user?.id) throw new InspectionDocumentError('Sessao obrigatoria.', 401);
  if (previewClienteId != null) {
    if (session.user.role !== 'ADMIN') throw new InspectionDocumentError('Preview reservado a administradores.', 403);
    const id = Number(previewClienteId);
    if (!/^[1-9]\d*$/.test(previewClienteId) || !Number.isSafeInteger(id)) {
      throw new InspectionDocumentError('Cliente de preview invalido.', 400);
    }
    return id;
  }
  const id = Number(session.user.clienteId);
  if (session.user.role !== 'CLIENTE' || !Number.isSafeInteger(id) || id <= 0) {
    throw new InspectionDocumentError('Sessao de cliente obrigatoria.', 403);
  }
  return id;
}

/** Emission is rebuilt from an explicitly selected saved inspection, never a draft. */
export async function resolveSavedInspectionDocument(selector: { jangadaId?: unknown; inspecaoId?: unknown } | null | undefined, options?: { audience: 'cliente'; previewClienteId?: string | null }) {
  const id = Number(selector?.inspecaoId);
  const jangadaId = Number(selector?.jangadaId);
  if (selector?.inspecaoId == null) {
    throw new InspectionDocumentError('Guarde a inspeção antes de emitir o certificado.', 400);
  }
  if (!['string', 'number'].includes(typeof selector.inspecaoId) || !['string', 'number'].includes(typeof selector.jangadaId)) {
    throw new InspectionDocumentError('Indique IDs válidos de jangada e inspeção guardada.', 400);
  }
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(jangadaId) || jangadaId <= 0) {
    throw new InspectionDocumentError('Indique IDs validos de jangada e inspecao guardada.', 400);
  }
  const clientMode = options?.audience === 'cliente';
  const session = await getAuthSession();
  if (!clientMode && session?.user?.role === 'CLIENTE') throw new InspectionDocumentError('Apenas utilizadores internos.', 403);
  const clienteId = clientMode ? await requirePortalClienteId(options?.previewClienteId) : null;
  const access = clientMode ? null : await getAccessContext();
  if (!clientMode && !access) throw new InspectionDocumentError('Sessao obrigatoria.', 401);
  const inspection = await prisma.inspecao.findUnique({ where: { id }, include: {
    artigos: true, ordensServico: { select: { tecnicoResponsavel: true, tecnico: { select: { nome: true } } } },
  } });
  if (!inspection) throw new InspectionDocumentError('Inspecao nao encontrada.', 404);
  if (inspection.jangadaId !== jangadaId) throw new InspectionDocumentError('A inspecao nao pertence a jangada indicada.', 400);
  // Only orders linked to this exact inspection are evidence of its technician.
  const technicians = [...new Set((inspection.ordensServico || []).map(order =>
    order.tecnicoResponsavel?.trim() || order.tecnico?.nome?.trim() || '').filter(Boolean))];
  const savedInspection = { ...inspection, responsavel: resolveInspectionTechnician(inspection)
    || (technicians.length === 1 ? technicians[0] : '') };
  const raft = await prisma.jangada.findUnique({
    where: { id: jangadaId }, include: { artigos: true, serviceStation: { select: { codigo: true, nome: true } } },
  });
  if (!raft) throw new InspectionDocumentError('Jangada nao encontrada.', 404);
  const ship = raft.shipId ? await prisma.navio.findUnique({
    where: { id: raft.shipId },
    select: { id: true, clienteId: true, nome: true, bandeira: true, imo: true, callSignal: true, serviceStationId: true,
      cliente: { select: { nome: true } }, serviceStation: { select: { codigo: true, nome: true } } },
  }) : null;
  if (clientMode) {
    if (!ship || ship.clienteId !== clienteId) throw new InspectionDocumentError('Documento nao encontrado.', 404);
    if (!isPortalInspectionCertified(inspection) || (inspection.navioId != null && inspection.navioId !== raft.shipId) ||
        (inspection.jangadaSerial && inspection.jangadaSerial !== raft.serial)) {
      throw new InspectionDocumentError('Inspecao nao certificada ou inconsistente.', 409);
    }
  }
  const checkStation = (stationId: unknown) => {
    if (access && !access.isAdmin && !access.allowedStationIds.includes(Number(stationId || 0))) {
      throw new InspectionDocumentError('Sem acesso a estacao desta inspecao.', 403);
    }
  };
  checkStation(raft.serviceStationId ?? ship?.serviceStationId);
  const latest = await prisma.inspecao.findFirst({ where: { jangadaId }, orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }], select: { id: true } });
  let snapshot;
  try {
    snapshot = await getInspectionSnapshot(inspection.certificadoNumero, { strict: true });
  } catch {
    throw new InspectionDocumentError('Nao e possivel gerar esta inspecao: arquivo historico ilegivel. Solicite a estacao a recuperacao do snapshot do certificado.', 409, ['snapshot (leitura/JSON)']);
  }
  let source: Parameters<typeof buildCarimbadoCertificatePdf>[0];
  if (!snapshot && latest?.id === id && raft.ultimoCertificadoNumero === inspection.certificadoNumero &&
      documentDate(inspection.dataInspecao) &&
      documentDate(raft.dataInspecao) === documentDate(inspection.dataInspecao) &&
      documentDate(raft.dataProxInspecao) === documentDate(inspection.dataProxInspecao)) {
    source = { jangada: { ...raft,
      inspectionChecklistValues: { ...normalizeInspectionChecklistValues(inspection.checklistSnapshot), ...await readInspectionChecklistValues(jangadaId) },
      artigos: raft.artigos.filter(art => art.inspecaoId == null || art.inspecaoId === id),
    }, lastInspecao: savedInspection, ship,
      shipName: raft.shipNameManual || ship?.nome || '', ownerName: ship?.cliente?.nome || raft.owner || '',
      station: raft.serviceStation || ship?.serviceStation };
  } else {
    if (!snapshot) {
      // _articleExpiry proves saved equipment, not raft/ship identity. Rebuild
      // only when those identities and technical fields were also recorded.
      let saved: Record<string, any> = {};
      try {
        const raw = typeof inspection.checklistSnapshot === 'string' ? JSON.parse(inspection.checklistSnapshot) : inspection.checklistSnapshot;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw as Record<string, any>;
      } catch { /* Missing evidence is reported below, never replaced by live data. */ }
       const sos = isSosDocumentRaft(saved);
       const required = ['brand', 'model', 'capacity', 'dataFabrico', 'packType', 'serviceStationId',
        'owner', 'launchType', 'fabricType', 'painterLength', 'maxStowageHeight',
        'cylinderSerial', 'cylinderCo2', 'cylinderN2', 'cylinderDataTeste', 'cylinderPesoBruto', 'cylinderTara',
        'cylinderCabecaDisparoRef', 'cylinderCabecaDisparoDescricao', 'cylinderSistema',
         'hruReferencia', 'hruSerial', 'hruValidade', 'radarReflector', 'radarReflectorValidade'].filter(key =>
           !sos || (!key.startsWith('hru') && key !== 'cylinderDataTeste'));
      const missing = required.filter(key => !Object.hasOwn(saved, key) ||
        (saved[key] != null && !['string', 'number', 'boolean'].includes(typeof saved[key]))).map(key => `checklistSnapshot.${key}`);
      for (const key of ['brand', 'model', 'packType', 'cylinderSerial']) {
        if (!String(saved[key] || '').trim() && !missing.includes(`checklistSnapshot.${key}`)) missing.push(`checklistSnapshot.${key}`);
      }
      if (!(Number(saved.capacity) > 0)) missing.push('checklistSnapshot.capacity (positiva)');
      if (!Number.isSafeInteger(saved.serviceStationId) || saved.serviceStationId <= 0) missing.push('checklistSnapshot.serviceStationId (valida)');
      if (!inspection.jangadaSerial || inspection.jangadaSerial !== raft.serial) missing.push('inspecao.jangadaSerial (identidade confirmada)');
      if (!inspection.navioId || !inspection.navioNome) missing.push('inspecao.navioId/navioNome');
      const tests: Record<string, unknown> = {};
       for (const key of sos ? [] : ['testeWP', 'testeNAP', 'testeFS', 'testeGI', 'testeDL']) {
        const recorded = (inspection as unknown as Record<string, unknown>)[key] ?? saved[key];
        if (typeof recorded !== 'string' || !recorded.trim()) missing.push(`inspecao.${key}/checklistSnapshot.${key}`);
        else tests[key] = recorded;
      }
      const wpRequired = typeof tests.testeWP === 'string' && !['N/A', 'NA', 'NAO APLICAVEL'].includes(tests.testeWP.trim().toUpperCase());
      for (const key of ['testeWPUnidadePressao', 'testeWPHoraInicio', 'testeWPTemperaturaInicial', 'testeWPTemperaturaFinal',
        'testeWPPressaoAtmosfericaInicial', 'testeWPPressaoAtmosfericaFinal', 'testeWPCamaraSuperiorInicio',
        'testeWPCamaraSuperiorFim', 'testeWPCamaraInferiorInicio', 'testeWPCamaraInferiorFim']) {
        const recorded = (inspection as unknown as Record<string, unknown>)[key] ?? saved[key];
        if (recorded != null && recorded !== '' && ['string', 'number'].includes(typeof recorded)) tests[key] = recorded;
        else if (wpRequired) missing.push(`inspecao.${key}/checklistSnapshot.${key}`);
      }
      const shipEvidence = saved.shipDetails;
      if (!shipEvidence || shipEvidence.id !== inspection.navioId || !Number.isSafeInteger(shipEvidence.clienteId) ||
          !['bandeira', 'imo', 'callSignal'].every(key => Object.hasOwn(shipEvidence, key))) missing.push('checklistSnapshot.shipDetails (id, clienteId, bandeira, imo, callSignal)');
      const pack = saved._articleExpiry?.packItems;
      if (!pack || typeof pack !== 'object' || Array.isArray(pack) || Object.values(pack).some((item: any) =>
        !item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string' ||
        !Number.isFinite(Number(item.quantidade)) || Number(item.quantidade) < 0 || (item.validade != null && typeof item.validade !== 'string'))) {
        missing.push('checklistSnapshot._articleExpiry.packItems (artigos validos)');
      }
      const components = saved._articleExpiry?.componentes;
      if (!Array.isArray(components) || components.some((item: any) => !item || typeof item !== 'object' ||
        typeof item.type !== 'string' || (item.validade != null && typeof item.validade !== 'string'))) {
        missing.push('checklistSnapshot._articleExpiry.componentes (componentes validos)');
      }
      if (missing.length) throw new InspectionDocumentError(
        `Nao e possivel gerar esta inspecao sem o snapshot historico. Solicite a estacao a recuperacao do arquivo do certificado ${inspection.certificadoNumero}. Metadados em falta: ${missing.join(', ')}.`, 409, missing);
      snapshot = { ...Object.fromEntries(required.map(key => [key, saved[key]])), ...tests,
        id: jangadaId, serial: inspection.jangadaSerial, shipId: inspection.navioId, shipDetails: shipEvidence,
        ultimoCertificadoNumero: inspection.certificadoNumero, dataInspecao: inspection.dataInspecao,
        certificadoExternoNumero: typeof saved.certificadoExternoNumero === 'string' ? saved.certificadoExternoNumero : null,
        dataProxInspecao: inspection.dataProxInspecao, inspectionChecklistValues: saved,
        artigos: [...Object.values(pack).map((item: any) => ({ ...item, inspecaoId: id })),
          ...components.map((item: any) => ({ name: item.type, referencia: item.reference, validade: item.validade, quantidade: 1, inspecaoId: id }))],
      };
    }
    const inconsistent = [
      snapshot.id !== jangadaId && 'snapshot.id',
      (snapshot.serial !== raft.serial || (inspection.jangadaSerial && snapshot.serial !== inspection.jangadaSerial)) && 'snapshot.serial',
      snapshot.ultimoCertificadoNumero !== inspection.certificadoNumero && 'snapshot.ultimoCertificadoNumero',
      (!documentDate(inspection.dataInspecao) || !documentDate(snapshot.dataInspecao) || documentDate(snapshot.dataInspecao) !== documentDate(inspection.dataInspecao)) && 'snapshot.dataInspecao',
      (inspection.navioId != null && snapshot.shipId !== inspection.navioId) && 'snapshot.shipId',
      (snapshot.shipDetails?.id != null && snapshot.shipDetails.id !== snapshot.shipId) && 'snapshot.shipDetails.id',
      (!Array.isArray(snapshot.artigos) || snapshot.artigos.some((art: unknown) => !art || typeof art !== 'object' || Array.isArray(art))) && 'snapshot.artigos',
    ].filter((key): key is string => typeof key === 'string');
    if (inconsistent.length) {
      throw new InspectionDocumentError(`Nao e possivel gerar esta inspecao. Solicite a estacao a verificacao do arquivo historico. Metadados inconsistentes: ${inconsistent.join(', ')}.`, 409, inconsistent);
    }
    // A former ship's dossier must not cross the current client's ownership boundary.
    if (clientMode && (snapshot.shipId !== raft.shipId ||
        documentDate(snapshot.dataProxInspecao) !== documentDate(inspection.dataProxInspecao) ||
        (snapshot.shipDetails?.clienteId != null && snapshot.shipDetails.clienteId !== clienteId))) {
      throw new InspectionDocumentError('Nao e possivel gerar: propriedade ou validade historica inconsistente. Solicite a estacao a verificacao de snapshot.shipId, snapshot.shipDetails.clienteId e snapshot.dataProxInspecao.', 409,
        ['snapshot.shipId/snapshot.shipDetails.clienteId/snapshot.dataProxInspecao']);
    }
    const stationId = snapshot.serviceStationId ?? snapshot.shipDetails?.serviceStationId;
    if (!Number.isSafeInteger(stationId) || stationId <= 0) throw new InspectionDocumentError('Estacao historica indisponivel. Solicite a estacao a recuperacao de snapshot.serviceStationId ou snapshot.shipDetails.serviceStationId.', 409, ['snapshot.serviceStationId/snapshot.shipDetails.serviceStationId']);
    checkStation(stationId);
    const station = await prisma.serviceStation.findUnique({ where: { id: stationId }, select: { codigo: true, nome: true } });
    if (!station) throw new InspectionDocumentError('Estacao historica indisponivel.', 409);
    source = { jangada: { ...snapshot,
      artigos: snapshot.artigos.filter((art: { inspecaoId?: number | null }) => art.inspecaoId == null || art.inspecaoId === id),
      dataInspecao: inspection.dataInspecao,
      dataProxInspecao: inspection.dataProxInspecao ?? snapshot.dataProxInspecao ?? '',
      inspectionChecklistValues: { ...normalizeInspectionChecklistValues(snapshot.inspectionChecklistValues),
        ...normalizeInspectionChecklistValues(inspection.checklistSnapshot) },
    }, lastInspecao: savedInspection, ship: snapshot.shipDetails ?? null,
    shipName: inspection.navioNome || snapshot.shipNameManual || snapshot.shipDetails?.nome || '', station, preserveSavedChecklist: true };
  }
  return source;
}

export function buildSavedInspectionPayload(source: Parameters<typeof buildCarimbadoCertificatePdf>[0]) {
  const certificate = buildInspectionCertificateInput({ ...source, stamp: false });
  const template = buildOreyCertificateTemplateInput({ raft: source.jangada, ship: source.ship, inspection: certificate });
  const raft = source.jangada as typeof source.jangada & { numeroObra?: string; cylinderPesoBruto?: string; cylinderTara?: string; certificadoExternoNumero?: string | null };
  const inspection = source.lastInspecao as typeof source.lastInspecao & { numeroObra?: string };
  const value = (key: keyof typeof raft) => {
    const saved = inspection?.[key as keyof typeof inspection];
    return saved != null && saved !== '' ? saved : raft[key] ?? '';
  };
  const wp = {
    pressureUnit: value('testeWPUnidadePressao'), startTime: value('testeWPHoraInicio'),
    tempInitial: value('testeWPTemperaturaInicial'), tempFinal: value('testeWPTemperaturaFinal'),
    baroInitial: value('testeWPPressaoAtmosfericaInicial'), baroFinal: value('testeWPPressaoAtmosfericaFinal'),
    upperStart: value('testeWPCamaraSuperiorInicio'), upperEnd: value('testeWPCamaraSuperiorFim'),
    lowerStart: value('testeWPCamaraInferiorInicio'), lowerEnd: value('testeWPCamaraInferiorFim'),
  };
  const derived = buildWpDerivedValues(wp);
  const quadro: QuadroTemplateInput = { ...template,
    serviceStationCode: source.station?.codigo || '',
    serviceStationName: source.station?.nome || '',
    technician: resolveInspectionTechnician(inspection),
    certNumber: raft.certificadoExternoNumero || template.certNumber,
    numeroObra: inspection?.numeroObra || raft.numeroObra || '',
    cylinderGrossWeight: raft.cylinderPesoBruto || '', cylinderTare: raft.cylinderTara || '',
    pressureUnit: String(wp.pressureUnit || ''), wpStartTime: String(wp.startTime), wpEndTime: derived.endTime,
    tempInitial: String(wp.tempInitial), tempFinal: String(wp.tempFinal),
    baroInitial: String(wp.baroInitial), baroFinal: String(wp.baroFinal),
    wpUpperStart: String(wp.upperStart), wpUpperEnd: String(wp.upperEnd),
    wpLowerStart: String(wp.lowerStart), wpLowerEnd: String(wp.lowerEnd),
    wpUpperCorrected: derived.upper.correctedEndDisplay, wpUpperDrop: derived.upper.dropDisplay,
    wpUpperDropPercent: derived.upper.dropPercentDisplay,
    wpLowerCorrected: derived.lower.correctedEndDisplay, wpLowerDrop: derived.lower.dropDisplay,
    wpLowerDropPercent: derived.lower.dropPercentDisplay,
    napTestDone: value('testeNAP'), fsTestDone: value('testeFS'), giTestDone: value('testeGI'), dlTestDone: value('testeDL'),
    checklist: certificate.checklist as QuadroTemplateInput['checklist'],
    substituicoes: (inspection?.artigos || []).map(art => ({ ...art, validade: art.validade ? toDateKey(art.validade) : null })),
  };
  return { certificate, template, quadro };
}
