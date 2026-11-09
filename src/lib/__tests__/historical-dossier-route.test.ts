import { GET } from '@/app/api/certificados/pdf/route';
import prisma from '@/lib/prisma';
import { getAuthSession } from '@/auth';
import { getAccessContext } from '@/lib/access-control';
import { getInspectionSnapshot } from '@/lib/inspection-snapshots';
import { buildOreyCertificatePdfBuffer } from '@/lib/orey-certificate-pdf';
import { verifyCertificatePdfToken } from '@/lib/certificate-pdf-token';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  jangada: { findFirst: jest.fn() },
  inspecao: { findUnique: jest.fn(), findFirst: jest.fn() },
  navio: { findUnique: jest.fn(), findFirst: jest.fn() },
  cliente: { findUnique: jest.fn() },
  serviceStation: { findUnique: jest.fn() },
} }));
jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/inspection-snapshots', () => ({ getInspectionSnapshot: jest.fn() }));
jest.mock('@/lib/inspection-checklist-store', () => ({
  normalizeInspectionChecklistValues: jest.requireActual('@/lib/inspection-checklist-store').normalizeInspectionChecklistValues,
}));
jest.mock('@/lib/auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('@/lib/auditorias-storage', () => ({}));
jest.mock('@/lib/certificate-pdf', () => ({
  buildCertificatePdfBuffer: jest.fn(),
  certificatePdfFileName: (input: { certNumber: string }) => `${input.certNumber}.pdf`,
}));
jest.mock('@/lib/certificate-stamp', () => ({ getStampDataUrl: () => null }));
jest.mock('@/lib/certificate-verification', () => ({ withCertificateVerification: async (input: unknown) => input }));
jest.mock('@/lib/orey-certificate-pdf', () => ({ buildOreyCertificatePdfBuffer: jest.fn(async () => Buffer.from('%PDF-test')) }));
jest.mock('@/lib/onedrive-sync', () => ({ syncEmittedDocumentToOneDrive: jest.fn() }));
jest.mock('@/lib/certificados-organizados', () => ({ saveExternalCertificadoToNavioFolder: jest.fn() }));
jest.mock('@/lib/certificate-pdf-token', () => ({ verifyCertificatePdfToken: jest.fn(() => false) }));

const station = { codigo: 'AZ', nome: 'Historical Station' };
const raft = {
  id: 10, serial: 'RAFT-10', shipId: 20, serviceStationId: 1, serviceStation: station,
  cylinderSerial: 'LIVE-CYLINDER', hruValidade: '2035-01-01', dataProxInspecao: '2035-01-01',
  inspectionChecklistValues: { cabeca_disparo: 'LIVE', validade_farmacia: '2035-01-01' }, artigos: [],
};
const inspections = [
  { id: 101, jangadaId: 10, jangadaSerial: 'RAFT-10', navioId: 20, navioNome: 'Old Ship',
    certificadoNumero: 'AZ23-1', dataInspecao: '2023-03-10', dataProxInspecao: '2024-03-10',
    status: 'Concluida', artigos: [], checklistSnapshot: { cabeca_disparo: 'SAVED OLD HEAD', validade_farmacia: '2024-02-01', hru_days: 123 } },
  { id: 102, jangadaId: 10, jangadaSerial: 'RAFT-10', navioId: 20, navioNome: 'New Ship',
    certificadoNumero: 'AZ24-2', dataInspecao: '2024-04-20', dataProxInspecao: '2025-04-20',
    status: 'Concluida', artigos: [], checklistSnapshot: { cabeca_disparo: 'SAVED NEW HEAD', validade_farmacia: '2025-02-01', hru_days: 456 } },
];
const snapshots = inspections.map((inspection, index) => ({
  id: 10, serial: 'RAFT-10', shipId: 20, serviceStationId: 1,
  ultimoCertificadoNumero: inspection.certificadoNumero, dataInspecao: inspection.dataInspecao,
  dataProxInspecao: inspection.dataProxInspecao, cylinderSerial: `ARCHIVED-CYLINDER-${index}`,
  cylinderSistema: 'GIST', cylinderCabecaDisparoDescricao: 'DK99',
  hruValidade: `${2024 + index}-01-01`, cylinderDataTeste: '2020-01-01',
  inspectionChecklistValues: { cabeca_disparo: 'SNAPSHOT HEAD', validade_agua: `${2024 + index}-06-01` },
  artigos: [{ name: 'Farmacia', referencia: `OLD-${index}`, quantidade: 1, validade: '2040-01-01' }],
}));
const request = (query: string) => new Request(`http://localhost/api/certificados/pdf?${query}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'USER' } } as never);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [1] } as never);
  jest.mocked(verifyCertificatePdfToken).mockReturnValue(false);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValue(raft as never);
  jest.mocked(prisma.inspecao.findUnique).mockImplementation((async ({ where }: { where: { id: number } }) => inspections.find(i => i.id === where.id) ?? null) as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue(inspections[1] as never);
  jest.mocked(getInspectionSnapshot).mockImplementation(async (cert) => structuredClone(snapshots.find(s => s.ultimoCertificadoNumero === cert) ?? null));
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ nome: 'LIVE SHIP', bandeira: 'LIVE FLAG', serviceStationId: 1, serviceStation: station } as never);
  jest.mocked(prisma.navio.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.serviceStation.findUnique).mockResolvedValue(station as never);
});

it('renders each selected inspection from its own archive, retaining saved heads and expiries', async () => {
  for (const [index, inspection] of inspections.entries()) {
    const response = await GET(request(`inspecaoId=${inspection.id}&jangadaId=10`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(`${inspection.certificadoNumero}.pdf`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(buildOreyCertificatePdfBuffer).toHaveBeenLastCalledWith(expect.objectContaining({
      certNumber: inspection.certificadoNumero, inspectionDate: inspection.dataInspecao,
      nextInspectionDate: inspection.dataProxInspecao, shipName: inspection.navioNome,
      shipFlag: '', cylinderSerial: `ARCHIVED-CYLINDER-${index}`, hruExpiry: `${2024 + index}-01-01`,
      checklist: expect.objectContaining({
        ...inspection.checklistSnapshot, validade_agua: `${2024 + index}-06-01`,
      }),
    }), expect.anything());
  }
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
});

it('keeps latest-inspection behavior only when no inspection ID is supplied', async () => {
  expect((await GET(request('jangadaId=10'))).status).toBe(200);
  expect(prisma.inspecao.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { jangadaId: 10 } }));
  expect(getInspectionSnapshot).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({ cylinderSerial: 'LIVE-CYLINDER' }), expect.anything());
});

it.each(['', 'oops', '0', '-1', '1.5'])('rejects invalid explicit inspection ID %j instead of falling back', async (id) => {
  expect((await GET(request(`inspecaoId=${id}&jangadaId=10`))).status).toBe(400);
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('does not fall back for an unknown inspection ID', async () => {
  expect((await GET(request('inspecaoId=999&jangadaId=10'))).status).toBe(404);
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each(['jangadaId=99', 'serial=OTHER'])('rejects an inspection belonging to a different requested raft (%s)', async (selector) => {
  if (selector.startsWith('serial')) jest.mocked(prisma.jangada.findFirst).mockResolvedValueOnce({ ...raft, id: 99, serial: 'OTHER' } as never);
  expect((await GET(request(`inspecaoId=101&${selector}`))).status).toBe(400);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each([
  null, {}, { ...snapshots[0], id: 99 }, { ...snapshots[0], shipId: 99 },
  { ...snapshots[0], ultimoCertificadoNumero: 'OTHER' }, { ...snapshots[0], artigos: null },
  { ...snapshots[0], serviceStationId: null },
  { ...snapshots[0], dataInspecao: '2026-10-24' },
  { ...snapshots[0], shipDetails: { id: 99 } },
  { ...snapshots[0], artigos: [null] },
])('refuses unavailable or mismatched historical data without substituting live data', async (snapshot) => {
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce(snapshot);
  const response = await GET(request('inspecaoId=101'));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatch(/históric/);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('requires a recorded inspection date instead of using today', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspections[0], dataInspecao: '' } as never);
  expect((await GET(request('inspecaoId=101'))).status).toBe(409);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('excludes articles linked to other inspections in older full-raft archives', async () => {
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce({
    ...snapshots[0], artigos: [
      { name: 'Agua', validade: '2099-01-01', inspecaoId: 102 },
      { name: 'Agua', validade: '2024-06-01', inspecaoId: 101 },
    ],
  });
  expect((await GET(request('inspecaoId=101'))).status).toBe(200);
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({
    checklist: expect.objectContaining({ validade_agua: '2024-06-01' }),
  }), expect.anything());
});

it('rejects staff outside the raft station even with a valid public token', async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce({ isAdmin: false, allowedStationIds: [2] } as never);
  jest.mocked(verifyCertificatePdfToken).mockReturnValueOnce(true);
  expect((await GET(request('inspecaoId=101'))).status).toBe(403);
  expect(getInspectionSnapshot).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('also enforces the archived inspection station after a raft transfer', async () => {
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce({ ...snapshots[0], serviceStationId: 2 });
  expect((await GET(request('inspecaoId=101'))).status).toBe(403);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('rejects unauthenticated requests without a token or development bypass', async () => {
  jest.mocked(getAuthSession).mockResolvedValueOnce(null);
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await GET(request('inspecaoId=101'))).status).toBe(403);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('authorizes customers against the current ship, not the inspected ship or owner name', async () => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValueOnce({ id: 50, nome: 'Current Owner' } as never);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValueOnce({ ...raft, owner: 'Current Owner', shipId: 99 } as never);
  jest.mocked(prisma.navio.findFirst).mockResolvedValueOnce(null);
  expect((await GET(request('inspecaoId=101'))).status).toBe(403);
  expect(prisma.navio.findFirst).toHaveBeenCalledWith({ where: { id: 99, clienteId: 50 }, select: { id: true } });
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each([20, null])('denies a namesake client without an owned ship relation (shipId=%j)', async shipId => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValueOnce({ id: 50, nome: 'Same Owner' } as never);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValueOnce({ ...raft, owner: 'Same Owner', shipId } as never);
  expect((await GET(request('jangadaId=10'))).status).toBe(403);
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  expect(prisma.inspecao.findFirst).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each(['jangadaId=10', 'inspecaoId=101&jangadaId=10'])('allows the client owning the current ship (%s)', async query => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  jest.mocked(prisma.navio.findFirst).mockResolvedValueOnce({ id: 20 } as never);
  expect((await GET(request(query))).status).toBe(200);
  expect(prisma.navio.findFirst).toHaveBeenCalledWith({ where: { id: 20, clienteId: 50 }, select: { id: true } });
  expect(getAccessContext).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledTimes(1);
});

it.each([
  { role: 'CLIENTE', clienteId: 50 },
  { id: '5', role: 'CLIENTE', clienteId: null },
  { id: '5', role: 'CLIENTE', clienteId: -1 },
  { id: '5', role: 'CLIENTE', clienteId: 'invalid' },
])('denies invalid client sessions without falling back to staff access (%j)', async user => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user } as never);
  expect((await GET(request('jangadaId=10'))).status).toBe(403);
  expect(getAccessContext).not.toHaveBeenCalled();
  expect(prisma.navio.findFirst).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each(['jangadaId=10', 'inspecaoId=101'])('denies historical ship mismatch even when the client owns the current ship (%s)', async query => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValueOnce({ ...raft, shipId: 99 } as never);
  jest.mocked(prisma.navio.findFirst).mockResolvedValueOnce({ id: 99 } as never);
  expect((await GET(request(query))).status).toBe(403);
  expect(prisma.navio.findFirst).toHaveBeenCalledWith({ where: { id: 99, clienteId: 50 }, select: { id: true } });
  expect(getInspectionSnapshot).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each([
  { ...snapshots[0], shipId: 99 },
  { ...snapshots[0], shipDetails: { id: 20, clienteId: 99 } },
])('denies a client access to another ship or client in the historical snapshot', async snapshot => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  jest.mocked(prisma.navio.findFirst).mockResolvedValueOnce({ id: 20 } as never);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValueOnce({ ...inspections[0], navioId: null } as never);
  jest.mocked(getInspectionSnapshot).mockResolvedValueOnce(snapshot);
  expect((await GET(request('inspecaoId=101'))).status).toBe(403);
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it.each([null, { user: { id: '5', role: 'CLIENTE', clienteId: 50 } }])('preserves valid public tokens independently of client ownership (%j)', async session => {
  jest.mocked(getAuthSession).mockResolvedValueOnce(session as never);
  jest.mocked(getAccessContext).mockResolvedValue(null);
  jest.mocked(verifyCertificatePdfToken).mockReturnValueOnce(true);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValueOnce({ ...raft, shipId: 99 } as never);
  expect((await GET(request('inspecaoId=101&t=signed-token'))).status).toBe(200);
  expect(verifyCertificatePdfToken).toHaveBeenCalledWith('signed-token', 'RAFT-10');
  expect(prisma.navio.findFirst).not.toHaveBeenCalled();
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledTimes(1);
});

it('does not let an invalid public token bypass client ownership', async () => {
  jest.mocked(getAuthSession).mockResolvedValueOnce({ user: { id: '5', role: 'CLIENTE', clienteId: 50 } } as never);
  expect((await GET(request('jangadaId=10&t=invalid-token'))).status).toBe(403);
  expect(verifyCertificatePdfToken).toHaveBeenCalledWith('invalid-token', 'RAFT-10');
  expect(buildOreyCertificatePdfBuffer).not.toHaveBeenCalled();
});

it('keeps saved expiry calculations independent of the download date', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2045-01-01'));
  try {
    expect((await GET(request('inspecaoId=101'))).status).toBe(200);
    expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({
      inspectionDate: '2023-03-10', checklist: expect.objectContaining({ hru_days: 123, validade_farmacia: '2024-02-01' }),
    }), expect.anything());
  } finally {
    jest.useRealTimers();
  }
});
