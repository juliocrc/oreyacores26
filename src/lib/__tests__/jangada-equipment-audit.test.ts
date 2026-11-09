import { articleSnapshot, auditEquipment, equipmentChanges, equipmentSnapshot } from '../jangada-equipment-audit';

jest.mock('../prisma', () => ({ __esModule: true, default: {} }));

it('ignores regenerated article IDs, order, timestamps and absent/empty optional fields', () => {
  const before = equipmentSnapshot({ owner: 'A', updatedAt: 'old' }, [
    { id: 1, name: 'Water', referencia: 'W', quantidade: 2, validade: new Date('2030-01-01T00:00:00Z') },
    { id: 2, name: 'Food', quantidade: 1, referencia: '' },
  ]);
  const after = equipmentSnapshot({ owner: 'B', updatedAt: 'new' }, [
    { id: 50, name: 'Food', quantidade: 1, referencia: null },
    { id: 51, name: 'Water', referencia: 'W', quantidade: 2, validade: '2030-01-01' },
  ]);
  expect(equipmentChanges(before, after)).toEqual([]);
});

it('keeps false, zero, reference and validity changes', () => {
  expect(equipmentChanges({ enabled: true, qtd: 1, ref: 'A', validade: '2030-01-01' },
    { enabled: false, qtd: 0, ref: 'B', validade: null })).toEqual(expect.arrayContaining([
    { campo: 'enabled', antes: true, depois: false }, { campo: 'qtd', antes: 1, depois: 0 },
    { campo: 'ref', antes: 'A', depois: 'B' }, { campo: 'validade', antes: '2030-01-01', depois: null },
  ]));
});

it('records only changes with raft identity and session author on the supplied transaction', async () => {
  const db = { auditoria: { create: jest.fn() } };
  await auditEquipment(db as never, { jangadaId: 7, usuario: 'ana@orey.pt', origem: 'Ficha',
    antes: { hruReferencia: 'OLD', hruValidade: '2028-01-01' }, depois: { hruReferencia: 'NEW', hruValidade: '2028-01-01' },
  });
  expect(db.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    tabela: 'JangadaEquipment', idRegisto: 7, usuario: 'ana@orey.pt',
    dadosAntes: '{"hruReferencia":"OLD"}', dadosDepois: '{"hruReferencia":"NEW"}',
  }) });
  db.auditoria.create.mockClear();
  await auditEquipment(db as never, { jangadaId: 7, usuario: 'ana@orey.pt', origem: 'Ficha', antes: { qtd: 0 }, depois: { qtd: 0 } });
  expect(db.auditoria.create).not.toHaveBeenCalled();
});

it('does not swallow audit failures inside a transaction', async () => {
  const db = { auditoria: { create: jest.fn().mockRejectedValue(new Error('Audit failed')) } };
  await expect(auditEquipment(db as never, { jangadaId: 7, usuario: 'ana@orey.pt', origem: 'Artigo',
    antes: { artigo: null }, depois: { artigo: articleSnapshot({ name: 'Water', quantidade: 1 }) },
  })).rejects.toThrow('Audit failed');
});
