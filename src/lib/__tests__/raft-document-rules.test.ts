import { isSosDocumentRaft } from '@/lib/raft-document-rules';
import { buildQuadroInspectionArtifacts } from '@/lib/quadro-template';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { buildInspectionCertificateDoc } from '@/lib/inspection-certificate';

it.each([
  { model: 'SOS' }, { raftModel: 'Plastimo SOS' }, { brand: 'SOS' },
  { brand: 'ARIMAR', serial: 'AO-123', model: 'Legacy' },
])('detects existing SOS aliases and rejects direct quadro builders: %j', async raft => {
  expect(isSosDocumentRaft(raft)).toBe(true);
  await expect(buildQuadroInspectionArtifacts(raft)).rejects.toThrow('apenas certificado');
  await expect(buildQuadroPDFArtifacts(raft)).rejects.toThrow('apenas certificado');
});

it('does not treat ordinary brands or a missing pack as SOS', () => {
  expect(isSosDocumentRaft({ brand: 'VIKING', model: 'SOLAS', packType: 'Sem pack' })).toBe(false);
});

it('does not print historical test results on the generic SOS certificate', () => {
  const input = { raftModel: 'SOS', checklist: { aprovacao_wp: 'APROVADO' } };
  const sosPdf = buildInspectionCertificateDoc(input).output();
  expect(sosPdf).toContain('apenas certificado');
  expect(sosPdf).not.toContain('RESULTADO WP');
  expect(buildInspectionCertificateDoc({ ...input, raftModel: 'SOLAS' }).output()).toContain('RESULTADO WP');
});
