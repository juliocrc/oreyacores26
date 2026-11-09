import { inspectionStatus } from '@/lib/fatos-imersao-certificate-status';

it('não usa certificado antigo para aprovar inspeção posterior', () => {
  expect(inspectionStatus({ certificadoResultado: 'Aprovado', certificadoData: new Date('2025-01-01'), verificacaoResultado: 'OK', verificacaoData: new Date('2026-01-01') })).toBe('NOT OK');
});
it('não mascara verificação pendente com certificado anterior', () => {
  expect(inspectionStatus({ certificadoResultado: 'Aprovado', certificadoData: new Date('2026-01-01'), verificacaoResultado: 'REPARAR', verificacaoData: new Date('2026-01-01') })).toBe('NOT OK');
});
