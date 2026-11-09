import { portalInspectionMetadata } from '../portal-inspection-documents';

const inspection = { id: 1, certificadoNumero: 'AZ-1', status: 'Concluída', dataInspecao: '2025-10-25', dataProxInspecao: '2026-10-25' };

it('uses an explicit reference date, inclusive expiry and supersession before expiry', () => {
  expect(portalInspectionMetadata(inspection, 1, '2026-10-25')).toEqual({ documentStatus: 'valido', referenceDate: '2026-10-25', downloadable: true });
  expect(portalInspectionMetadata(inspection, 1, '2026-10-26').documentStatus).toBe('expirado');
  expect(portalInspectionMetadata(inspection, 2, '2026-10-26').documentStatus).toBe('substituido');
});

it('never presents drafts as valid certificates', () => {
  expect(portalInspectionMetadata({ ...inspection, status: 'Rascunho' }, 1, '2026-10-25')).toMatchObject({ documentStatus: 'indisponivel', downloadable: false });
});
