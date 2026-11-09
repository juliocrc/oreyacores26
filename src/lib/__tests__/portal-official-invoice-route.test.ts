import { GET } from '@/app/api/portal/faturas/[id]/oficial/route';
import prisma from '@/lib/prisma';
import { requirePortalClienteId, InspectionDocumentError } from '@/lib/saved-inspection-documents';
import { readOfficialPdf, OfficialInvoiceError } from '@/lib/invoice-official-storage';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { fatura: { findFirst: jest.fn() } } }));
jest.mock('@/lib/saved-inspection-documents', () => ({ requirePortalClienteId: jest.fn(),
  InspectionDocumentError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
jest.mock('@/lib/invoice-official-storage', () => ({ readOfficialPdf: jest.fn(),
  OfficialInvoiceError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
const pdf = { storage: 'encrypted-blob', key: 'private-locator', filename: 'official.pdf', size: 9 };
const invoice = { id: 10, clienteId: 7, numeroFatura: 'INTERNAL', metadados: JSON.stringify({ numeroFaturaOficial: 'NAV-10', pdfOficial: pdf }) };
const request = (id = '10') => GET(new Request('https://example.test/api/portal/faturas/' + id + '/oficial?clienteId=99&previewClienteId=99'), { params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requirePortalClienteId).mockResolvedValue(7);
  (prisma.fatura.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => where.clienteId === invoice.clienteId && where.id === invoice.id ? invoice : null);
  jest.mocked(readOfficialPdf).mockResolvedValue(Buffer.from('%PDF-test'));
});

it.each([401, 403])('uses existing portal auth and stops before querying for denied sessions (%s)', async status => {
  jest.mocked(requirePortalClienteId).mockRejectedValue(new InspectionDocumentError('Denied', status));
  expect((await request()).status).toBe(status);
  expect(prisma.fatura.findFirst).not.toHaveBeenCalled();
  expect(readOfficialPdf).not.toHaveBeenCalled();
});

it('streams only the owned uploaded PDF, ignoring supplied client/preview selectors, without redirect or locator', async () => {
  const response = await request();
  expect(prisma.fatura.findFirst).toHaveBeenCalledWith({ where: { id: 10, clienteId: 7 } });
  expect(requirePortalClienteId).toHaveBeenCalledWith();
  expect(readOfficialPdf).toHaveBeenCalledWith(10, pdf);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('%PDF-test');
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Location')).toBeNull();
  expect(JSON.stringify([...response.headers])).not.toContain(pdf.key);
});

it('returns indistinguishable 404 for a different owner or missing invoice without accessing storage', async () => {
  jest.mocked(requirePortalClienteId).mockResolvedValue(8);
  expect((await request()).status).toBe(404);
  jest.mocked(requirePortalClienteId).mockResolvedValue(7);
  expect((await request('999')).status).toBe(404);
  expect(readOfficialPdf).not.toHaveBeenCalled();
});

it.each(['0', '-1', '10junk', '9007199254740992'])('rejects invalid id %s', async id => {
  expect((await request(id)).status).toBe(400);
  expect(prisma.fatura.findFirst).not.toHaveBeenCalled();
});

it.each([{}, { numeroFaturaOficial: 'NAV-10' }, { pdfOficial: pdf }])('never substitutes an internal document for incomplete official metadata %j', async metadata => {
  jest.mocked(prisma.fatura.findFirst).mockResolvedValue({ ...invoice, metadados: JSON.stringify(metadata) } as never);
  expect((await request()).status).toBe(404);
  expect(readOfficialPdf).not.toHaveBeenCalled();
});

it('does not fall back to a proforma if official storage fails', async () => {
  jest.mocked(readOfficialPdf).mockRejectedValue(new OfficialInvoiceError('PDF indisponivel.', 503));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('INTERNAL');
});

it('does not expose server configuration or provider details in storage failures', async () => {
  jest.mocked(readOfficialPdf).mockRejectedValue(new OfficialInvoiceError('Configure INVOICE_PDF_ENCRYPTION_KEY and private storage locator.', 503));
  const response = await request();
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ error: 'PDF oficial temporariamente indisponivel. Contacte a oficina.' });
});
