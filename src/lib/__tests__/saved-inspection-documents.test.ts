import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { getInspectionSnapshot } from '@/lib/inspection-snapshots';
import { resolveSavedInspectionDocument, buildSavedInspectionPayload } from '@/lib/saved-inspection-documents';
import { POST as quadroExcel } from '@/app/api/exportar-raft/route';
import { POST as quadroPdf } from '@/app/api/exportar-raft-pdf/route';
import { POST as certificatePdf } from '@/app/api/certificados/pdf/route';
import { POST as carimbado } from '@/app/api/jangadas/[id]/certificado-carimbado/route';
import { POST as certificateExcel } from '@/app/api/certificados/orey/route';
import { buildQuadroInspectionArtifacts } from '@/lib/quadro-template';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { buildOreyCertificatePdfBuffer } from '@/lib/orey-certificate-pdf';
import { buildOreyCertificateArtifacts } from '@/lib/orey-certificate-template';
import { buildCertificatePdfBuffer } from '@/lib/certificate-pdf';
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import type { InspectionData } from '@/modules/JangadaWizard/types';
import { getAuthSession } from '@/auth';
import { GET as portalDownload } from '@/app/api/portal/documentos/route';
import { withCertificateVerification } from '@/lib/certificate-verification';
import { syncEmittedDocumentToOneDrive } from '@/lib/onedrive-sync';
import { POST as batchCertificates } from '@/app/api/navios/[id]/certificados-carimbados/route';
import { POST as survitec } from '@/app/api/certificados/survitec-moderno/route';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  jangada: { findUnique: jest.fn(), findMany: jest.fn() }, inspecao: { findUnique: jest.fn(), findFirst: jest.fn() },
  navio: { findUnique: jest.fn() }, serviceStation: { findUnique: jest.fn() },
} }));
jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/inspection-snapshots', () => ({ getInspectionSnapshot: jest.fn() }));
jest.mock('@/lib/auditoria', () => ({ logAuditoria: jest.fn(async () => {}) }));
jest.mock('@/lib/auditorias-storage', () => ({ readAuditoriaJson: jest.fn(async () => ({})) }));
jest.mock('@/lib/certificate-stamp', () => ({ getStampDataUrl: () => 'official-stamp' }));
jest.mock('@/lib/certificate-verification', () => ({ withCertificateVerification: jest.fn(async (input: unknown) => input) }));
jest.mock('@/lib/certificate-pdf-token', () => ({ verifyCertificatePdfToken: jest.fn() }));
jest.mock('@/lib/onedrive-sync', () => ({ syncEmittedDocumentToOneDrive: jest.fn(async () => ({})) }));
jest.mock('@/lib/certificados-organizados', () => ({ saveExternalCertificadoToNavioFolder: jest.fn(async () => ({})) }));
jest.mock('@/lib/certificate-pdf', () => ({
  buildCertificatePdfBuffer: jest.fn(), certificatePdfFileName: () => 'certificate.pdf',
}));
jest.mock('@/lib/orey-certificate-pdf', () => ({ buildOreyCertificatePdfBuffer: jest.fn(async () => Buffer.from('OREY')) }));
jest.mock('@/lib/orey-certificate-template', () => ({
  buildOreyCertificateArtifacts: jest.fn(async () => ({ buffer: Buffer.from('xlsx'), fileName: 'certificate.xlsx' })),
}));
jest.mock('@/lib/quadro-template', () => ({
  buildQuadroInspectionArtifacts: jest.fn(async () => ({ buffer: Buffer.from('xlsx'), fileName: 'quadro.xlsx' })),
}));
jest.mock('@/lib/quadro-pdf-template', () => ({
  buildQuadroPDFArtifacts: jest.fn(async () => ({ buffer: Buffer.from('pdf'), fileName: 'quadro.pdf' })),
}));

const station = { codigo: 'AZ', nome: 'Azores' };
const inspection = { id: 101, jangadaId: 10, certificadoNumero: 'AZ26-101', dataInspecao: '2026-10-01',
  dataProxInspecao: '2027-10-01', responsavel: 'Tecnico', numeroObra: 'OT-101', artigos: [
    { name: 'Farmacia', referencia: 'NEW', quantidade: 2, validade: '2028-01-01' },
  ] };
const raft = { id: 10, serial: 'RAFT', shipId: 20, serviceStationId: 1, serviceStation: station,
  ultimoCertificadoNumero: inspection.certificadoNumero, dataInspecao: inspection.dataInspecao,
  dataProxInspecao: inspection.dataProxInspecao, cylinderSerial: 'CYL', cylinderPesoBruto: '10', cylinderTara: '5',
  testeWPUnidadePressao: 'hpa', testeWPHoraInicio: '23:30', testeWPTemperaturaInicial: '20,5',
  testeWPTemperaturaFinal: '20,5', testeWPPressaoAtmosfericaInicial: '1010', testeWPPressaoAtmosfericaFinal: '1010',
  testeWPCamaraSuperiorInicio: '100', testeWPCamaraSuperiorFim: '100', testeDL: 'APROVADO', artigos: inspection.artigos };
const selector = { jangadaId: 10, inspecaoId: 101 };
const request = (body: unknown) => new Request('http://localhost/api/document', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue(null);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [1] } as never);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue(inspection as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue(inspection as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue(raft as never);
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ nome: 'SHIP', serviceStationId: 1, cliente: { nome: 'OWNER' } } as never);
  jest.mocked(prisma.serviceStation.findUnique).mockResolvedValue(station as never);
  jest.mocked(getInspectionSnapshot).mockResolvedValue(null);
});

describe('client document downloads', () => {
  const download = (query = '') => portalDownload(new Request(`http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=certificado&format=pdf${query}`));
  beforeEach(() => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'CLIENTE', clienteId: 7 } } as never);
    jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, status: 'Concluída', navioId: 20 } as never);
    jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 20, clienteId: 7, nome: 'SHIP', serviceStationId: 1, cliente: { nome: 'OWNER' } } as never);
  });

  it.each([
    [null, 401],
    [{ user: { id: '1', role: 'ADMIN', clienteId: 7 } }, 403],
    [{ user: { id: '1', role: 'CLIENTE', clienteId: null } }, 403],
    [{ user: { id: '1', role: 'CLIENTE', clienteId: 'oops' } }, 403],
  ])('requires a real client session (%j)', async (session, status) => {
    jest.mocked(getAuthSession).mockResolvedValue(session as never);
    expect((await download()).status).toBe(status);
    expect(prisma.jangada.findUnique).not.toHaveBeenCalled();
    expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  });

  it.each(['&clienteId=8', '&serial=OTHER', '&shipId=99', '&stationId=1', '&payload=x', '&source=draft', '&inspecaoId=102', '&format=xlsx'])('rejects overrides and ambiguous selectors %s', async query => {
    expect((await download(query)).status).toBe(400);
    expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  });

  it('checks current ship ownership, never owner name or historical ship as an override', async () => {
    jest.mocked(prisma.navio.findUnique).mockResolvedValueOnce({ id: 20, clienteId: 8, cliente: { nome: 'OWNER' } } as never);
    expect((await download()).status).toBe(404);
    jest.mocked(prisma.jangada.findUnique).mockResolvedValueOnce({ ...raft, shipId: null, owner: 'OWNER' } as never);
    expect((await download()).status).toBe(404);
    jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection, status: 'Concluída', navioId: 99 } as never);
    expect((await download()).status).toBe(409);
    expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  });

  it('rejects foreign inspections, drafts and invalid dates', async () => {
    jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection, jangadaId: 11 } as never);
    expect((await download()).status).toBe(400);
    for (const patch of [{ status: 'Rascunho' }, { certificadoNumero: '' }, { dataInspecao: 'invalid' }, { dataProxInspecao: null }, { dataProxInspecao: '2020-01-01' }]) {
      jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection, status: 'Concluída', ...patch } as never);
      expect((await download()).status).toBe(409);
    }
    expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  });

  it('re-renders the certified PDF with the station stamp, without staff access or emission side effects', async () => {
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="certificado-inspecao-101.pdf"');
    expect(await response.text()).toBe('OREY');
    expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({ certNumber: 'AZ26-101', raftSerial: 'RAFT' }), { stamp: { imageDataUrl: 'official-stamp', stationName: 'Azores' } });
    expect(getAccessContext).not.toHaveBeenCalled();
    expect(withCertificateVerification).not.toHaveBeenCalled();
    expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
  });

  it('feeds the same saved quadro to PDF and XLSX and returns the right attachments', async () => {
    for (const format of ['pdf', 'xlsx']) {
      const response = await portalDownload(new Request(`http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=${format}`));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="quadro-inspecao-101.${format}"`);
      expect(response.headers.get('content-type')).toContain(format === 'pdf' ? 'application/pdf' : 'spreadsheetml.sheet');
    }
    expect(jest.mocked(buildQuadroPDFArtifacts).mock.calls[0][0]).toEqual(jest.mocked(buildQuadroInspectionArtifacts).mock.calls[0][0]);
  });

  it('renders the identical saved quadro for the owner and explicit ADMIN preview, without emission', async () => {
    const url = 'http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=pdf';
    expect((await portalDownload(new Request(url))).status).toBe(200);
    const ownerPayload = jest.mocked(buildQuadroPDFArtifacts).mock.calls[0][0];
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } } as never);
    jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 20, clienteId: 558, nome: 'SHIP', serviceStationId: 1, cliente: { nome: 'OWNER' } } as never);
    const response = await portalDownload(new Request(`${url}&previewClienteId=558`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-inspection-id')).toBe('101');
    expect(await response.text()).toBe('pdf');
    expect(jest.mocked(buildQuadroPDFArtifacts).mock.calls[1][0]).toEqual(ownerPayload);
    expect(getAccessContext).not.toHaveBeenCalled();
    expect(withCertificateVerification).not.toHaveBeenCalled();
    expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
    jest.mocked(buildQuadroPDFArtifacts).mockClear();
    expect((await portalDownload(new Request(`${url}&previewClienteId=559`))).status).toBe(404);
    expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  });

  it.each(['CLIENTE', 'TECNICO'])('rejects preview for %s even when the selected client is the owner', async role => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role, clienteId: 7 } } as never);
    const response = await portalDownload(new Request('http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=pdf&previewClienteId=7'));
    expect(response.status).toBe(403);
    expect(prisma.inspecao.findUnique).not.toHaveBeenCalled();
    expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '1.5', '', '9007199254740992', '558&previewClienteId=559'])('rejects invalid ADMIN preview selector %s', async id => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } } as never);
    const response = await portalDownload(new Request(`http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=pdf&previewClienteId=${id}`));
    expect(response.status).toBe(400);
    expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  });

  it('reconstructs an exact older inspection and refuses unavailable or cross-ship snapshots', async () => {
    jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 102 } as never);
    expect((await download()).status).toBe(409);
    const snapshot = { ...raft, cylinderSerial: 'OLD-CYL', shipDetails: { id: 20, clienteId: 7, nome: 'OLD-SHIP' } };
    jest.mocked(getInspectionSnapshot).mockResolvedValue(snapshot);
    expect((await download()).status).toBe(200);
    expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({ cylinderSerial: 'OLD-CYL', shipName: 'OLD-SHIP' }), expect.anything());
    jest.mocked(buildOreyCertificatePdfBuffer).mockClear();
    for (const patch of [{ shipId: 99 }, { serial: 'FOREIGN' }, { dataInspecao: '2020-01-01' }, { dataProxInspecao: '2040-01-01' }, { shipDetails: { id: 20, clienteId: 8 } }]) {
      jest.mocked(getInspectionSnapshot).mockResolvedValueOnce({ ...snapshot, ...patch });
      expect((await download()).status).toBe(409);
    }
    expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  });

  it('returns actionable missing metadata for an alias mismatch in ADMIN preview without bypassing ownership', async () => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } } as never);
    jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, ultimoCertificadoNumero: 'OS/FO-101', certificadoExternoNumero: 'OS/FO-101' } as never);
    const url = 'http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=pdf&previewClienteId=7';
    const response = await portalDownload(new Request(url));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Solicite a estacao'),
      missingMetadata: expect.arrayContaining(['checklistSnapshot.cylinderSerial']) });
    expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
    expect((await portalDownload(new Request(url.replace('previewClienteId=7', 'previewClienteId=8')))).status).toBe(404);
    expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  });

  it('does not allow client sessions into the default staff resolver', async () => {
    await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 403 });
    expect(getAccessContext).not.toHaveBeenCalled();
  });
});

it('uses the same OREY stamped renderer and data for wizard PDF and explicit ficha emission', async () => {
  const wizard = await certificatePdf(request({ ...selector, raftSerial: 'STALE', checklist: { wrong: true } }));
  expect(wizard.status).toBe(200);
  const wizardInput = jest.mocked(buildOreyCertificatePdfBuffer).mock.calls[0];
  const ficha = await carimbado(request(selector), { params: Promise.resolve({ id: '10' }) });
  expect(ficha.status).toBe(200);
  expect(jest.mocked(buildOreyCertificatePdfBuffer).mock.calls[1]).toEqual(wizardInput);
  const currentFicha = await carimbado(request({}), { params: Promise.resolve({ id: '10' }) });
  expect(currentFicha.status).toBe(400);
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledTimes(2);
  expect(wizardInput[0]).toMatchObject({ raftSerial: 'RAFT', certNumber: inspection.certificadoNumero, owner: 'OWNER' });
  expect(wizardInput[1]).toMatchObject({ stamp: { imageDataUrl: 'official-stamp', stationName: 'Azores' } });
  expect(buildCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each([{}, { jangadaId: 10 }, { jangadaId: 10, inspecaoId: null }, null])('refuses certificate emission without a saved inspection: %j', async body => {
  expect((await certificateExcel(request(body))).status).toBe(400);
  expect((await certificatePdf(request(body))).status).toBe(400);
  expect((await survitec(request(body))).status).toBe(400);
  expect((await carimbado(request(body), { params: Promise.resolve({ id: '10' }) })).status).toBe(400);
  expect(buildOreyCertificateArtifacts).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  expect(buildCertificatePdfBuffer).not.toHaveBeenCalled();
  expect(withCertificateVerification).not.toHaveBeenCalled();
  expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
});

it('does not emit or sync a batch containing a raft without a saved inspection', async () => {
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([raft] as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValueOnce(null);
  const response = await batchCertificates(request({}), { params: Promise.resolve({ id: '20' }) });
  expect(response.status).toBe(409);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
  expect(withCertificateVerification).not.toHaveBeenCalled();
  expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
});

it('loads saved light data and preserves the station recorded at inspection instead of the current raft station', async () => {
  const { readAuditoriaJson } = await import('@/lib/auditorias-storage');
  jest.mocked(readAuditoriaJson).mockResolvedValue({ '10': { validade_luzes_exteriores: '2040-09' } });
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce({ ...raft, serviceStationId: 2,
    inspectionChecklistValues: { validade_luzes_exteriores: '2030-09', luz_exterior_bateria: 'SUBSTITUIDO', ref_luz_exterior: '30202048' } } as never);
  jest.mocked(prisma.serviceStation.findUnique).mockResolvedValueOnce({ codigo: 'LIS', nome: 'Lisboa' } as never);
  jest.mocked(getAccessContext).mockResolvedValueOnce({ isAdmin: true, allowedStationIds: [] } as never);
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector)).quadro;
  expect(payload.serviceStationCode).toBe('LIS');
  expect(payload.technician).toBe('Tecnico');
  expect(payload.checklist).toMatchObject({ validade_luzes_exteriores: '2030-09', ref_luz_exterior: '30202048', luz_exterior_bateria: 'SUBSTITUIDO' });
  expect(readAuditoriaJson).not.toHaveBeenCalled();
  jest.mocked(readAuditoriaJson).mockResolvedValue({});
});

it('uses a valid archive even for the latest certificate with an external alias and changed current equipment', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, ultimoCertificadoNumero: 'OS/FO-ALIAS', certificadoExternoNumero: 'OS/FO-ALIAS', cylinderSerial: 'CURRENT' } as never);
  jest.mocked(getInspectionSnapshot).mockResolvedValue({ ...raft, cylinderSerial: 'SAVED' });
  expect(buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector)).template.cylinderSerial).toBe('SAVED');
});

it('never treats an external alias or the same date as proof that current data belongs to the inspection', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, ultimoCertificadoNumero: 'OS/FO-ALIAS', certificadoExternoNumero: 'OS/FO-ALIAS' } as never);
  await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 409,
    missingMetadata: expect.arrayContaining(['inspecao.jangadaSerial (identidade confirmada)', 'checklistSnapshot._articleExpiry.packItems (artigos validos)']) });
});

it('normalizes a serialized timestamp exactly like the original Date without accepting another civil day', async () => {
  const date = new Date('2026-01-10T00:00:00Z');
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, dataInspecao: date } as never);
  jest.mocked(getInspectionSnapshot).mockResolvedValue({ ...raft, dataInspecao: date.toISOString() });
  await expect(resolveSavedInspectionDocument(selector)).resolves.toBeDefined();
  jest.mocked(getInspectionSnapshot).mockResolvedValue({ ...raft, dataInspecao: '2026-01-11T00:00:00Z' });
  await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 409, missingMetadata: ['snapshot.dataInspecao'] });
});

it.each([{ serial: 'OTHER' }, { ultimoCertificadoNumero: 'OTHER' }, { dataInspecao: '2026-99-99' }, { artigos: [null] }])('rejects corrupt latest archives instead of using matching live markers: %j', async patch => {
  jest.mocked(getInspectionSnapshot).mockResolvedValue({ ...raft, ...patch });
  await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 409 });
});

it('rejects unreadable archive JSON instead of falling back to matching current data', async () => {
  jest.mocked(getInspectionSnapshot).mockRejectedValueOnce(new SyntaxError('Invalid JSON'));
  await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 409, missingMetadata: ['snapshot (leitura/JSON)'] });
  expect(getInspectionSnapshot).toHaveBeenCalledWith(inspection.certificadoNumero, { strict: true });
});

it('reconstructs only from complete saved identity and article evidence, even with different current data', async () => {
  const checklistSnapshot = { brand: 'SAVED-BRAND', model: 'MODEL', capacity: 6, dataFabrico: '2010-01-01', packType: 'SOLAS A',
    serviceStationId: 1, owner: 'SAVED-OWNER', launchType: '', fabricType: '', painterLength: '', maxStowageHeight: '',
    cylinderSerial: 'SAVED-CYL', cylinderCo2: '', cylinderN2: '', cylinderDataTeste: '', cylinderPesoBruto: '9', cylinderTara: '4',
    cylinderCabecaDisparoRef: '', cylinderCabecaDisparoDescricao: '', cylinderSistema: '', certificadoExternoNumero: 'OS/FO-SAVED',
    hruReferencia: '', hruSerial: '', hruValidade: '', radarReflector: '', radarReflectorValidade: '',
    testeWP: 'N/A', testeNAP: 'N/A', testeFS: 'N/A', testeGI: 'N/A', testeDL: 'APROVADO',
    shipDetails: { id: 20, clienteId: 7, nome: 'SAVED-SHIP', bandeira: '', imo: '', callSignal: '' },
    _articleExpiry: { packItems: { pharmacy: inspection.artigos[0] }, componentes: [] } };
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, jangadaSerial: 'RAFT', navioId: 20, navioNome: 'SAVED-SHIP', checklistSnapshot: JSON.stringify(checklistSnapshot) } as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 102 } as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, cylinderSerial: 'CURRENT', brand: 'CURRENT' } as never);
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector));
  expect(payload.template).toMatchObject({ brand: 'SAVED-BRAND', cylinderSerial: 'SAVED-CYL', shipName: 'SAVED-SHIP', owner: 'SAVED-OWNER' });
  expect(payload.quadro).toMatchObject({ cylinderGrossWeight: '9', cylinderTare: '4' });
  expect(payload.quadro.certNumber).toBe('OS/FO-SAVED');
  delete (checklistSnapshot as Partial<typeof checklistSnapshot>).cylinderSerial;
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, jangadaSerial: 'RAFT', navioId: 20, navioNome: 'SAVED-SHIP', checklistSnapshot } as never);
  await expect(resolveSavedInspectionDocument(selector)).rejects.toMatchObject({ status: 409, missingMetadata: expect.arrayContaining(['checklistSnapshot.cylinderSerial']) });
});

it('feeds identical canonical quadro data to XLSX and PDF, including zero pressure loss and substituted articles', async () => {
  expect((await quadroExcel(request({ ...selector, checklist: { wrong: true } }))).status).toBe(200);
  expect((await quadroPdf(request({ ...selector, substituicoes: [] }))).status).toBe(200);
  const payload = jest.mocked(buildQuadroInspectionArtifacts).mock.calls[0][0];
  expect(buildQuadroPDFArtifacts).toHaveBeenCalledWith(payload);
  expect(payload).toMatchObject({ numeroObra: 'OT-101', cylinderGrossWeight: '10', cylinderTare: '5',
    wpEndTime: '00:30', wpUpperDrop: '0', dlTestDone: 'APROVADO', substituicoes: inspection.artigos,
    checklist: { ref_farmacia: 'NEW', substituicao_explicita__farmacia: 2 } });
});

it('uses the same certificate fields for saved Excel and PDF', async () => {
  expect((await certificateExcel(request(selector))).status).toBe(200);
  expect((await certificatePdf(request(selector))).status).toBe(200);
  expect(jest.mocked(buildOreyCertificateArtifacts).mock.calls[0][0]).toMatchObject(
    jest.mocked(buildOreyCertificatePdfBuffer).mock.calls[0][0],
  );
});

it('uses the canonical WP fallback for empty saved fields while preserving explicit zero measurements', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection,
    testeWPUnidadePressao: '', testeWPHoraInicio: '', testeWPTemperaturaInicial: '',
    testeWPCamaraSuperiorInicio: '', testeWPCamaraSuperiorFim: 0,
  } as never);
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector));
  expect(payload.quadro).toMatchObject({ pressureUnit: 'hpa', wpStartTime: '23:30', tempInitial: '20,5',
    wpUpperStart: '100', wpUpperEnd: '0', wpUpperCorrected: '0', wpUpperDropPercent: '100' });
  expect(payload.quadro.wpUpperCorrected).toBe(payload.certificate.checklist?.p1_corrigida_superior);
  expect(payload.quadro.wpUpperDropPercent).toBe(payload.certificate.checklist?.queda_real_superior);
});

it('preserves mbar from the saved inspection instead of relabelling it as hPa', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection, testeWPUnidadePressao: 'mbar' } as never);
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector));
  expect(payload.quadro.pressureUnit).toBe('mbar');
});

it('excludes articles from another inspection even when generating the latest saved inspection', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValueOnce({ ...raft, artigos: [
    { name: 'Farmacia', referencia: 'OTHER-INSPECTION', quantidade: 9, validade: '2040-01-01', inspecaoId: 99 },
    ...raft.artigos,
  ] } as never);
  const source = await resolveSavedInspectionDocument(selector);
  expect(source.jangada.artigos).toEqual(raft.artigos);
  expect(buildSavedInspectionPayload(source).quadro.checklist).toMatchObject({ ref_farmacia: 'NEW', validade_farmacia: '2028-01-01' });
});

it('retains the ficha external certificate number on quadros without relabeling the internal OREY certificate', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValueOnce({ ...raft, certificadoExternoNumero: 'HB-101' } as never);
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector));
  expect(payload.quadro.certNumber).toBe('HB-101');
  expect(payload.template.certNumber).toBe('AZ26-101');
});

it.each([quadroExcel, quadroPdf])('preserves local quadro data without issuing a certificate or looking up another inspection', async (route) => {
  const draft = { raftSerial: 'RAFT', certNumber: 'DRAFT', checklist: { validade_racoes: '', local: true }, substituicoes: [] };
  expect((await route(request(draft))).status).toBe(200);
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
  expect(prisma.jangada.findUnique).not.toHaveBeenCalled();
  const renderer = route === quadroExcel ? buildQuadroInspectionArtifacts : route === quadroPdf ? buildQuadroPDFArtifacts : buildOreyCertificateArtifacts;
  expect(renderer).toHaveBeenCalledWith(draft);
});

it('does not emit saved selectors for a local wizard draft, even with a raft ID', () => {
  const draft = { testes: {}, checklist: {}, packItems: {} } as InspectionData;
  expect(buildCertificatePayload(draft, 10)).not.toHaveProperty('jangadaId');
  expect(buildCertificatePayload(draft, 10, 101)).toMatchObject(selector);
});

it.each([0, '', -1, 'oops', 1.5])('rejects invalid explicit selectors (%j)', async (id) => {
  expect((await quadroPdf(request({ ...selector, inspecaoId: id }))).status).toBe(400);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});

it('rejects a missing inspection or one belonging to another raft without falling back', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce(null);
  expect((await certificatePdf(request(selector))).status).toBe(404);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspection, jangadaId: 99 } as never);
  expect((await quadroExcel(request(selector))).status).toBe(400);
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
});

it('reconstructs an older inspection only from its own snapshot, never from live ship or cylinder data', async () => {
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValueOnce({ id: 102 } as never);
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce({ id: 10, serial: 'RAFT', serviceStationId: 1,
    ultimoCertificadoNumero: inspection.certificadoNumero, dataInspecao: inspection.dataInspecao,
    cylinderSerial: 'OLD-CYL', artigos: [], shipDetails: { nome: 'OLD-SHIP' },
    inspectionChecklistValues: { validade_farmacia: '2027-01-01' } });
  const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(selector));
  expect(payload.template.cylinderSerial).toBe('OLD-CYL');
  expect(payload.template.shipName).not.toBe('SHIP');
  expect(payload.quadro.checklist?.validade_farmacia).toBe('2027-01-01');
});

it('refuses an unavailable historical snapshot rather than rendering the latest inspection', async () => {
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValueOnce({ id: 102 } as never);
  expect((await quadroPdf(request(selector))).status).toBe(409);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});

it('enforces session and station access for saved documents', async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await quadroPdf(request(selector))).status).toBe(401);
  jest.mocked(getAccessContext).mockResolvedValueOnce({ isAdmin: false, allowedStationIds: [2] } as never);
  expect((await quadroPdf(request(selector))).status).toBe(403);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});

it.each([quadroExcel, quadroPdf])('rejects SOS quadros for saved and local requests without generating artifacts', async route => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, model: 'SOS' } as never);
  expect((await route(request(selector))).status).toBe(400);
  expect((await route(request({ raftModel: 'Plastimo SOS' })) ).status).toBe(400);
  expect(buildQuadroInspectionArtifacts).not.toHaveBeenCalled();
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
});

it('allows the SOS portal certificate but rejects quadro downloads in either format', async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'CLIENTE', clienteId: 7 } } as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, model: 'SOS' } as never);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, status: 'Concluida', navioId: 20 } as never);
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 20, clienteId: 7, nome: 'SHIP', serviceStationId: 1 } as never);
  const download = (document: string, format: string) => portalDownload(new Request(`http://localhost/api/portal/documentos?jangadaId=10&inspecaoId=101&document=${document}&format=${format}`));
  expect((await download('certificado', 'pdf')).status).toBe(200);
  expect((await download('quadro', 'pdf')).status).toBe(400);
  expect((await download('quadro', 'xlsx')).status).toBe(400);
  expect(buildQuadroInspectionArtifacts).not.toHaveBeenCalled();
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});

it('reconstructs a historical SOS certificate without Hammar or test metadata', async () => {
  const checklistSnapshot = { brand: 'PLASTIMO', model: 'SOS', capacity: 6, dataFabrico: '2010-01-01', packType: 'Sem pack',
    serviceStationId: 1, owner: 'OWNER', launchType: '', fabricType: '', painterLength: '', maxStowageHeight: '',
    cylinderSerial: 'CYL', cylinderCo2: '', cylinderN2: '', cylinderPesoBruto: '', cylinderTara: '',
    cylinderCabecaDisparoRef: '', cylinderCabecaDisparoDescricao: '', cylinderSistema: '', radarReflector: '', radarReflectorValidade: '',
    shipDetails: { id: 20, clienteId: 7, nome: 'SAVED-SHIP', bandeira: '', imo: '', callSignal: '' },
    _articleExpiry: { packItems: {}, componentes: [] } };
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, jangadaSerial: 'RAFT', navioId: 20, navioNome: 'SAVED-SHIP', checklistSnapshot } as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 102 } as never);
  const source = await resolveSavedInspectionDocument(selector);
  expect(source.jangada.model).toBe('SOS');
  expect(buildSavedInspectionPayload(source).template.raftModel).toBe('SOS');
  expect((await certificateExcel(request(selector))).status).toBe(200);
});
