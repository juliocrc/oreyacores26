import { writeInspectionChecklistValues } from '../inspection-checklist-store';
import { readAuditoriaJson, writeAuditoriaJson } from '../auditorias-storage';
import prisma from '../prisma';

jest.mock('../prisma', () => ({ __esModule: true, default: { auditoria: { create: jest.fn() } } }));
jest.mock('../auditorias-storage', () => ({ readAuditoriaJson: jest.fn(), writeAuditoriaJson: jest.fn() }));
jest.mock('../auditoria', () => ({ logAuditoria: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readAuditoriaJson).mockResolvedValue({ '7': { ref_luz: 'OLD', qtd_luz: 1, validade_luz: '2028-01' } });
});

it('records actual checklist fields with the session actor, including zero quantities and cleared validity', async () => {
  await writeInspectionChecklistValues(7, { ref_luz: 'NEW', qtd_luz: 0, validade_luz: '' }, 'ana@orey.pt');
  expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    tabela: 'JangadaEquipment', idRegisto: 7, usuario: 'ana@orey.pt',
    dadosAntes: '{"checklist.qtd_luz":1,"checklist.ref_luz":"OLD","checklist.validade_luz":"2028-01"}',
    dadosDepois: '{"checklist.qtd_luz":0,"checklist.ref_luz":"NEW","checklist.validade_luz":null}',
  }) });
});

it('does not write storage or an event for an unchanged checklist, regardless of key order', async () => {
  await writeInspectionChecklistValues(7, { validade_luz: '2028-01', qtd_luz: 1, ref_luz: 'OLD' }, 'ana@orey.pt');
  expect(writeAuditoriaJson).not.toHaveBeenCalled();
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('does not emit success audit when external storage rejects the write', async () => {
  jest.mocked(writeAuditoriaJson).mockRejectedValueOnce(new Error('Storage failed'));
  await expect(writeInspectionChecklistValues(7, {}, 'ana@orey.pt')).rejects.toThrow('Storage failed');
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});
