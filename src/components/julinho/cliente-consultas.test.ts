import { formatClientInspections, formatClientRequests } from './cliente-consultas';

it('orders recorded inspection dates and includes overdue dates', () => {
  const result = formatClientInspections([{ nome: 'Navio', jangadas: [
    { serial: 'B', dataProxInspecao: '2030-01-02' }, { serial: 'A', dataProxInspecao: '2025-01-02' },
    { serial: 'C', dataProxInspecao: null },
  ] }]);
  expect(result).toContain('inclui datas vencidas');
  expect(result.indexOf('jangada A')).toBeLessThan(result.indexOf('jangada B'));
  expect(result).not.toContain('jangada C');
});
it('shows request status without copying descriptions', () => {
  const result = formatClientRequests([{ id: 1, tipoAssistencia: 'Inspeção', estado: 'novo', descricao: 'privado' }]);
  expect(result).toContain('#1 · Inspeção · novo');
  expect(result).not.toContain('privado');
});
import { clientCertificateLinks } from './cliente-consultas';

it('lists the latest available certificate for each raft with the protected portal endpoint', () => {
  expect(clientCertificateLinks([{ nome: 'Navio', jangadas: [{ id: 4, serial: 'S1', inspecoes: [
    { id: 9, certificadoNumero: 'AZ26-1', downloadable: false },
    { id: 8, certificadoNumero: 'AZ25-2', downloadable: true },
    { id: 7, certificadoNumero: 'AZ24-3', downloadable: true },
  ] }] }])).toEqual([{ label: 'Navio · jangada S1 · certificado AZ25-2', href: '/api/portal/documentos?jangadaId=4&inspecaoId=8&document=certificado&format=pdf' }]);
  expect(clientCertificateLinks([{ jangadas: [{ id: 4, inspecoes: [{ id: 9, downloadable: false }] }] }])).toEqual([]);
});
