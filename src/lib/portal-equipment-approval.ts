import type { Prisma } from '@prisma/client';
import { canonicalizeRaftBrand, canonicalizeRaftModel } from '@/lib/text-normalization';
import { isKnownPackTypeName } from '@/lib/custom-pack-types';
import { PortalEquipmentError, type PortalAssociationItem, type SavedPortalAssociationItem } from './portal-equipment-proposal';

type DB = Pick<Prisma.TransactionClient, 'jangada' | 'colete' | 'fatoImersao' | 'epirb' | 'extintor' | 'navio'>;
const conflict = () => new PortalEquipmentError('O equipamento ou a titularidade do navio mudou. Reveja e submeta uma nova proposta.', 409, 'ASSOCIATION_CONFLICT');

export async function preparePortalAssociation(db: DB, item: PortalAssociationItem, clienteId: number, checkOnly = false): Promise<SavedPortalAssociationItem> {
  const select = { id: true, shipId: true, updatedAt: true };
  const query = { where: { serial: item.serial }, select, take: 2 };
  const rows = item.tipoEquipamento === 'jangada' ? await db.jangada.findMany({ ...query, select: { ...select, owner: true } })
    : item.tipoEquipamento === 'colete' ? await db.colete.findMany(query)
    : item.tipoEquipamento === 'fato' ? await db.fatoImersao.findMany(query)
    : item.tipoEquipamento === 'epirb' ? await db.epirb.findMany({ ...query, select: { ...select, ownerName: true } })
    : await db.extintor.findMany(query);
  if (rows.length > 1) throw new PortalEquipmentError('Serial duplicado no sistema. Contacte a estacao.', 409, 'DUPLICATE_SERIAL');
  const found = rows[0];
  if (found) {
    if (found.shipId != null) {
      const ship = await db.navio.findUnique({ where: { id: found.shipId }, select: { clienteId: true } });
      if (!ship || ship.clienteId !== clienteId) throw new PortalEquipmentError('Equipamento indisponivel para associacao. Contacte a estacao.', 403);
    } else if (('owner' in found && found.owner) || ('ownerName' in found && found.ownerName)) {
      // A manual owner name is not proof of client identity, even if it matches the session name.
      throw new PortalEquipmentError('Equipamento com proprietario manual. Contacte a estacao para confirmar a titularidade.', 403);
    }
    if (item.novoEquipamento !== undefined) throw new PortalEquipmentError('O serial ja existe. Remova a ficha nova e proponha apenas a associacao.', 409, 'SERIAL_EXISTS');
    return { ...item, modo: 'existente', existente: { id: found.id, shipId: found.shipId, updatedAt: found.updatedAt.toISOString() } };
  }
  if (!checkOnly) {
    if (item.novoEquipamento === undefined) throw new PortalEquipmentError('Serial nao registado. Preencha a ficha do novo equipamento.', 400, 'EQUIPMENT_DETAILS_REQUIRED');
    if (item.tipoEquipamento === 'jangada' && !await isKnownPackTypeName(String(item.novoEquipamento.packType))) throw new PortalEquipmentError('Tipo de pack invalido.');
  }
  return { ...item, modo: 'novo' };
}

export async function applyPortalAssociation(db: DB, item: SavedPortalAssociationItem, clienteId: number, shipId: number, owner: string, serviceStationId: number | null) {
  const current = await preparePortalAssociation(db, item, clienteId, item.modo === 'existente');
  if (current.modo !== item.modo || (item.modo === 'existente' && (current.existente?.id !== item.existente?.id
    || current.existente?.shipId !== item.existente?.shipId || current.existente?.updatedAt !== item.existente?.updatedAt))) throw conflict();
  if (item.modo === 'novo') {
    const fields = item.novoEquipamento!;
    const data = { ...fields, shipId, serial: item.serial, dataProxInspecao: item.dataProxInspecao };
    if (item.tipoEquipamento === 'jangada') {
      await db.jangada.create({ data: {
        ...data, brand: canonicalizeRaftBrand(fields.brand), model: canonicalizeRaftModel(fields.model, fields.brand, fields.packType, item.serial),
        capacity: Number(fields.capacity), dataFabrico: String(fields.dataFabrico).split('-').reverse().join('/'), packType: String(fields.packType), owner, serviceStationId,
      } });
    }
    if (item.tipoEquipamento === 'colete') await db.colete.create({ data });
    if (item.tipoEquipamento === 'fato') await db.fatoImersao.create({ data });
    if (item.tipoEquipamento === 'epirb') await db.epirb.create({ data: { ...data, ownerName: owner } });
    if (item.tipoEquipamento === 'extintor') {
      const { dataProxInspecao, ...rest } = data;
      await db.extintor.create({ data: { ...rest, dataProxRecarga: dataProxInspecao } });
    }
    return;
  }
  const snapshot = item.existente!;
  if (snapshot.shipId != null && snapshot.shipId !== shipId) {
    const source = await db.navio.updateMany({ where: { id: snapshot.shipId, clienteId }, data: { clienteId } });
    if (source.count !== 1) throw conflict();
  }
  const where = { id: snapshot.id, shipId: snapshot.shipId, updatedAt: new Date(snapshot.updatedAt) };
  const data = { shipId, dataProxInspecao: item.dataProxInspecao };
  const result = item.tipoEquipamento === 'jangada' ? await db.jangada.updateMany({ where, data })
    : item.tipoEquipamento === 'colete' ? await db.colete.updateMany({ where, data })
    : item.tipoEquipamento === 'fato' ? await db.fatoImersao.updateMany({ where, data })
    : item.tipoEquipamento === 'epirb' ? await db.epirb.updateMany({ where, data })
    : await db.extintor.updateMany({ where, data: { shipId, dataProxRecarga: item.dataProxInspecao } });
  if (result.count !== 1) throw conflict();
}
