import { POST } from '@/app/api/documentos/preview/route';
import { getAccessContext } from '@/lib/access-control';
import { buildOreyCertificatePdfBuffer } from '@/lib/orey-certificate-pdf';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { resolveSavedInspectionDocument, buildSavedInspectionPayload, InspectionDocumentError } from '@/lib/saved-inspection-documents';
import { PDFDocument } from 'pdf-lib';

jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/orey-certificate-pdf', () => ({ buildOreyCertificatePdfBuffer: jest.fn(async () => Buffer.from('PDF')) }));
jest.mock('@/lib/quadro-pdf-template', () => ({ buildQuadroPDFArtifacts: jest.fn(async () => ({ buffer: Buffer.from('PDF') })) }));
jest.mock('@/lib/saved-inspection-documents', () => ({
  resolveSavedInspectionDocument: jest.fn(), buildSavedInspectionPayload: jest.fn(),
  InspectionDocumentError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
const request = (body: unknown) => new Request('http://localhost/api/documentos/preview', { method: 'POST', body: JSON.stringify(body) });
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const buffer = Buffer.from(await pdf.save());
  jest.mocked(buildOreyCertificatePdfBuffer).mockResolvedValue(buffer);
  jest.mocked(buildQuadroPDFArtifacts).mockResolvedValue({ buffer, fileName: 'quadro.pdf' });
  jest.mocked(buildSavedInspectionPayload).mockReturnValue({ template: { inspectionDate: '2025-01-01', raftSerial: 'SAVED' },
    quadro: { inspectionDate: '2025-01-01', raftSerial: 'SAVED' } } as never);
});

it.each(['certificado', 'quadro'])('renders a draft %s without resolving saved data, despite an inspection ID', async document => {
  const response = await POST(request({ document, source: 'draft', jangadaId: 10, inspecaoId: 101,
    payload: { raftSerial: 'DRAFT', inspectionDate: '2026-10-01', verificationHash: 'forged', verificationQr: 'forged' } }));
  expect(response.status).toBe(200);
  expect(resolveSavedInspectionDocument).not.toHaveBeenCalled();
  const renderer = document === 'certificado' ? buildOreyCertificatePdfBuffer : buildQuadroPDFArtifacts;
  expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ raftSerial: 'DRAFT', verificationHash: undefined, verificationQr: undefined }));
  expect(response.headers.get('Content-Disposition')).toContain('inline');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(response.headers.get('X-Orey-Saved-Path')).toBeNull();
  expect(response.headers.get('X-Preview-Source')).toBe('draft');
  expect(response.headers.get('X-Document-Status')).toBe('preview-not-issued');
  expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBe(1);
});

it('uses the exact saved inspection and ignores caller overrides', async () => {
  const response = await POST(request({ document: 'certificado', source: 'saved', jangadaId: 10, inspecaoId: 101, payload: { raftSerial: 'FORGED' } }));
  expect(resolveSavedInspectionDocument).toHaveBeenCalledWith(expect.objectContaining({ jangadaId: 10, inspecaoId: 101 }));
  expect(buildOreyCertificatePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({ raftSerial: 'SAVED' }));
  expect(response.headers.get('X-Inspection-Id')).toBe('101');
  expect(response.headers.get('X-Inspection-Date')).toBe('2025-01-01');
});

it('preserves saved inspection access and consistency errors', async () => {
  jest.mocked(resolveSavedInspectionDocument).mockRejectedValueOnce(new InspectionDocumentError('Denied', 403));
  expect((await POST(request({ document: 'quadro', source: 'saved', jangadaId: 10, inspecaoId: 101 }))).status).toBe(403);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});

it.each([null, {}, { document: 'certificado', source: 'draft' }, { document: 'invalid', source: 'saved' }])('rejects invalid request %j', async body => {
  expect((await POST(request(body))).status).toBe(400);
});

it('requires authentication even for drafts', async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await POST(request({ document: 'quadro', source: 'draft', payload: {} }))).status).toBe(401);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
});
