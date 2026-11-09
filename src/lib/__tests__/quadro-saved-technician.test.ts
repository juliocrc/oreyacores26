import prisma from '@/lib/prisma';
import { resolveSavedInspectionDocument, buildSavedInspectionPayload } from '@/lib/saved-inspection-documents';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  inspecao: { findUnique: jest.fn(), findFirst: jest.fn(async () => ({ id: 10 })) },
  jangada: { findUnique: jest.fn(async () => ({ id: 1, serial: 'RAFT',
    ultimoCertificadoNumero: 'CERT', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01', artigos: [] })) },
} }));
jest.mock('@/auth', () => ({ getAuthSession: jest.fn(async () => ({ user: { name: 'Current User', role: 'ADMIN' } })) }));
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn(async () => ({ isAdmin: true })) }));
jest.mock('@/lib/inspection-snapshots', () => ({ getInspectionSnapshot: jest.fn(async () => null) }));
jest.mock('@/lib/inspection-checklist-store', () => ({
  normalizeInspectionChecklistValues: (v: unknown) => v || {}, readInspectionChecklistValues: jest.fn(async () => ({})),
}));
jest.mock('@/lib/certificate-stamp', () => ({ getStampDataUrl: () => null }));

it.each([
  [{ responsavel: 'Exact Responsible', ordensServico: [{ tecnico: { nome: 'Other' } }] }, 'Exact Responsible'],
  [{ checklistSnapshot: { responsavel: 'Snapshot Inspector' } }, 'Snapshot Inspector'],
  [{ ordensServico: [{ tecnico: { nome: 'Related Inspector' } }] }, 'Related Inspector'],
  [{ ordensServico: [{ tecnicoResponsavel: 'Saved Order Inspector', tecnico: { nome: 'Renamed' } }] }, 'Saved Order Inspector'],
  [{ ordensServico: [{ tecnico: { nome: 'One' } }, { tecnico: { nome: 'Two' } }] }, ''],
  [{}, ''],
])('uses only technician evidence linked to the selected inspection: %j', async (fields, expected) => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ id: 10, jangadaId: 1, certificadoNumero: 'CERT',
    dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01', artigos: [], ...fields } as never);
  const source = await resolveSavedInspectionDocument({ jangadaId: 1, inspecaoId: 10 });
  expect(buildSavedInspectionPayload(source).quadro.technician).toBe(expected);
  expect(prisma.inspecao.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 10 }, include: expect.objectContaining({ ordensServico: expect.any(Object) }),
  }));
});
