import { GET, POST } from '@/app/api/certificados/enviar/route';
import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { getEmailSenderAccounts, isEmailConfigured, sendEmail } from '@/lib/email-sender';
import { buildCertificatePdfBuffer } from '@/lib/certificate-pdf';
import { buildCarimbadoCertificatePdf } from '@/lib/certificate-carimbado-pdf';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { InspectionDocumentError, resolveSavedInspectionDocument } from '@/lib/saved-inspection-documents';
import { isOpenwaSelected } from '@/lib/openwa';
import { sendWhatsAppApi, sendWhatsAppDocument } from '@/lib/whatsapp-provider';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  user: { findUnique: jest.fn() }, jangada: { findUnique: jest.fn() },
  inspecao: { findFirst: jest.fn() }, navio: { findUnique: jest.fn() },
  comunicacao: { create: jest.fn(), updateMany: jest.fn() },
} }));
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/email-sender', () => ({ getEmailSenderAccounts: jest.fn(), isEmailConfigured: jest.fn(), sendEmail: jest.fn() }));
jest.mock('@/lib/certificate-pdf', () => ({ buildCertificatePdfBuffer: jest.fn(), certificatePdfFileName: () => 'local.pdf' }));
jest.mock('@/lib/certificate-carimbado-pdf', () => ({ buildCarimbadoCertificatePdf: jest.fn() }));
jest.mock('@/lib/quadro-pdf-template', () => ({ buildQuadroPDFArtifacts: jest.fn() }));
jest.mock('@/lib/saved-inspection-documents', () => ({
  InspectionDocumentError: class extends Error { constructor(message: string, public status: number) { super(message); } },
  resolveSavedInspectionDocument: jest.fn(),
  buildSavedInspectionPayload: () => ({ quadro: { raftSerial: 'SAVED' } }),
}));
jest.mock('@/lib/openwa', () => ({ isOpenwaSelected: jest.fn() }));
jest.mock('@/lib/whatsapp-provider', () => ({ sendWhatsAppApi: jest.fn(), sendWhatsAppDocument: jest.fn() }));
jest.mock('@/lib/communications', () => ({ buildWhatsAppUrl: jest.fn() }));

const input = { channel: 'email', to: 'owner@example.test', subject: 'Documents', message: 'Attached',
  jangadaId: 10, inspecaoId: 101, includeCertificate: true, includeQuadro: true,
  certificate: { certNumber: 'UNTRUSTED' }, quadro: { raftSerial: 'UNTRUSTED' }, pendingId: 42 };
const request = (body: unknown) => new Request('http://localhost/api/certificados/enviar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const source = { jangada: { id: 10, serial: 'SAVED' } };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 1, email: ' Julio.Correia@Orey.com ', isAdmin: true } as never);
  jest.mocked(isEmailConfigured).mockReturnValue(true);
  jest.mocked(getEmailSenderAccounts).mockReturnValue([
    { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true },
    { id: 'tecnica', email: 'azores.tecnica@orey.com', label: 'Tecnica', configured: false },
  ]);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'Operator' } as never);
  jest.mocked(resolveSavedInspectionDocument).mockResolvedValue(source as never);
  jest.mocked(buildCarimbadoCertificatePdf).mockResolvedValue({ buffer: Buffer.from('certificate'), fileName: 'saved.pdf' } as never);
  jest.mocked(buildQuadroPDFArtifacts).mockResolvedValue({ buffer: Buffer.from('quadro'), fileName: 'quadro.pdf' });
  jest.mocked(sendEmail).mockResolvedValue({ ok: true });
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.comunicacao.create).mockResolvedValue({ id: 43 } as never);
});

it('reports SMTP readiness without exposing secrets, rendering or sending documents', async () => {
  jest.mocked(isEmailConfigured).mockReturnValue(false);
  const res = await GET();
  expect(await res.json()).toEqual({ emailConfigured: false, emailAccounts: getEmailSenderAccounts() });
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(buildCarimbadoCertificatePdf).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

it('projects only public account metadata in configuration responses', async () => {
  jest.mocked(getEmailSenderAccounts).mockReturnValueOnce([
    { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true, refreshToken: 'secret-token' },
  ] as never);
  expect(await (await GET()).json()).toEqual({ emailConfigured: true, emailAccounts: [
    { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true },
  ] });
});

it.each([false, true])('hides and denies profiles to other users, including admin=%s', async isAdmin => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 2, email: 'other@orey.com', isAdmin } as never);
  expect(await (await GET()).json()).toEqual({ emailConfigured: true, emailAccounts: [] });
  expect(getEmailSenderAccounts).not.toHaveBeenCalled();
  for (const senderAccount of ['julio', 'tecnica']) {
    expect((await POST(request({ ...input, senderAccount }))).status).toBe(403);
  }
  expect(resolveSavedInspectionDocument).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('keeps generic SMTP available to other authenticated users', async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 2, email: 'other@orey.com', isAdmin: true } as never);
  expect((await POST(request(input))).status).toBe(200);
  expect(jest.mocked(sendEmail).mock.calls[0][0]).not.toHaveProperty('senderAccount');
});

it('fails before rendering, sending or updating the pending record when SMTP is missing', async () => {
  jest.mocked(isEmailConfigured).mockReturnValue(false);
  const res = await POST(request(input));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  expect(resolveSavedInspectionDocument).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('uses the same saved inspection for both PDFs instead of generating a throwaway local certificate', async () => {
  const res = await POST(request(input));
  expect(res.status).toBe(200);
  expect(resolveSavedInspectionDocument).toHaveBeenCalledWith(expect.objectContaining({ jangadaId: 10, inspecaoId: 101 }));
  expect(buildCertificatePdfBuffer).not.toHaveBeenCalled();
  expect(buildCarimbadoCertificatePdf).toHaveBeenCalledWith(source);
  expect(buildQuadroPDFArtifacts).toHaveBeenCalledWith({ raftSerial: 'SAVED' });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: input.to, attachments: [
    { filename: 'saved.pdf', content: Buffer.from('certificate'), contentType: 'application/pdf' },
    { filename: 'quadro.pdf', content: Buffer.from('quadro'), contentType: 'application/pdf' },
  ] }));
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 42, jangadaId: 10, status: 'por_enviar' },
    data: expect.objectContaining({ status: 'enviado' }),
  }));
});

it.each(['julio', 'tecnica'])('delivers both saved attachments with selected account %s without persisting account or credentials', async senderAccount => {
  const res = await POST(request({ ...input, senderAccount, from: 'attacker@example.test', password: 'secret' }));
  expect(res.status).toBe(200);
  expect(isEmailConfigured).toHaveBeenCalledWith(senderAccount);
  expect(sendEmail).toHaveBeenCalledWith({ to: input.to, subject: input.subject, text: input.message, senderAccount, attachments: [
    { filename: 'saved.pdf', content: Buffer.from('certificate'), contentType: 'application/pdf' },
    { filename: 'quadro.pdf', content: Buffer.from('quadro'), contentType: 'application/pdf' },
  ] });
  const write = jest.mocked(prisma.comunicacao.updateMany).mock.calls[0][0].data;
  for (const key of ['senderAccount', 'from', 'password']) expect(write).not.toHaveProperty(key);
});

it.each(['other', 'julio.correia@orey.com', '', null, {}, ['julio']])('rejects invalid account %p before any document work', async senderAccount => {
  expect((await POST(request({ ...input, senderAccount }))).status).toBe(400);
  expect(resolveSavedInspectionDocument).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('does not fall back to global SMTP when an explicit account is unconfigured', async () => {
  jest.mocked(isEmailConfigured).mockImplementation(account => account !== 'tecnica');
  expect((await POST(request({ ...input, senderAccount: 'tecnica' }))).status).toBe(503);
  expect(isEmailConfigured).toHaveBeenCalledWith('tecnica');
  expect(resolveSavedInspectionDocument).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it.each([400, 403, 404, 409])('preserves the saved-document error (%s) and never sends a current-data fallback', async status => {
  jest.mocked(resolveSavedInspectionDocument).mockRejectedValue(new InspectionDocumentError('Saved document unavailable', status));
  const res = await POST(request(input));
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ error: 'Saved document unavailable' });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('does not send a partial set when the selected quadro is missing', async () => {
  const res = await POST(request({ ...input, inspecaoId: undefined, quadro: undefined }));
  expect(res.status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

it('never generates or sends a certificate from an unsaved payload or just a raft ID', async () => {
  const response = await POST(request({ ...input, inspecaoId: undefined, includeQuadro: false }));
  expect(response.status).toBe(400);
  expect(buildCertificatePdfBuffer).not.toHaveBeenCalled();
  expect(buildCarimbadoCertificatePdf).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('requires authentication for configuration and sending', async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(request(input))).status).toBe(401);
  expect(sendEmail).not.toHaveBeenCalled();
});

it('retains the OpenWA document guard without text fallback or queue writes', async () => {
  jest.mocked(isOpenwaSelected).mockReturnValue(true);
  expect((await POST(request({ ...input, channel: 'whatsapp' }))).status).toBe(501);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(sendWhatsAppDocument).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('records a real SMTP failure rather than claiming success', async () => {
  jest.mocked(sendEmail).mockResolvedValue({ ok: false, error: 'SMTP authentication failed' });
  const res = await POST(request(input));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'SMTP authentication failed' });
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'falhou' }),
  }));
});

it('sends only the saved SOS certificate without building or requiring a quadro', async () => {
  jest.mocked(resolveSavedInspectionDocument).mockResolvedValue({ jangada: { ...source.jangada, model: 'SOS' } } as never);
  const res = await POST(request({ ...input, senderAccount: 'julio', includeQuadro: false, quadro: undefined }));
  expect(res.status).toBe(200);
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ senderAccount: 'julio', attachments: [
    expect.objectContaining({ filename: 'saved.pdf' }),
  ] }));
});

it.each([true, false])('rejects an explicit SOS quadro before sending (certificate selected: %s)', async includeCertificate => {
  jest.mocked(resolveSavedInspectionDocument).mockResolvedValue({ jangada: { ...source.jangada, model: 'SOS' } } as never);
  const res = await POST(request({ ...input, includeCertificate }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: expect.stringContaining('apenas certificado') });
  expect(buildQuadroPDFArtifacts).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
});
