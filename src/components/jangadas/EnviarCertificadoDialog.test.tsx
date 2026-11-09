import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EnviarCertificadoDialog from './EnviarCertificadoDialog';
import { appToast } from '@/lib/app-toast';

jest.mock('@/lib/app-toast', () => ({ appToast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

const props = { isOpen: true, onClose: jest.fn(), jangadaId: 10, inspecaoId: 101,
  clienteId: 7, pendingId: 42, defaultTo: 'owner@example.test',
  certificate: { certNumber: 'AZ-101', raftSerial: 'RAFT' }, quadro: { raftSerial: 'RAFT' } };

function dialog(overrides: Record<number, unknown> = {}, input = props) {
  const values: unknown[] = ['email', props.defaultTo, '', 'Documents', 'Attached', true, true, true, false, '', [{ id: 'julio', configured: true }, { id: 'tecnica', configured: false }], 'julio', null, null];
  const setters = values.map(() => jest.fn());
  let index = 0;
  jest.spyOn(React, 'useState').mockImplementation((() => {
    const current = index++;
    return [Object.hasOwn(overrides, current) ? overrides[current] : values[current], setters[current]];
  }) as never);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useRef').mockReturnValue({ current: false });
  const tree = EnviarCertificadoDialog(input)!;
  const buttons: React.ReactElement<{ onClick: () => Promise<void>; disabled?: boolean; children?: React.ReactNode }>[] = [];
  function visit(node: React.ReactNode) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
      if (child.type === 'button') buttons.push(child as typeof buttons[number]);
      visit(child.props.children);
    });
  }
  visit(tree);
  return { tree, setters, buttons, send: buttons[buttons.length - 1] };
}

afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

it.each([false, null])('explains unavailable SMTP (%s) and disables email sending', configured => {
  const { tree, send } = dialog({ 10: configured === null ? null : [{ id: 'julio', configured }] });
  expect(send.props.disabled).toBe(true);
  expect(renderToStaticMarkup(tree)).toContain(configured === false ? 'Conta de email nao configurada' : 'A confirmar configuracao');
});

it('explains a missing owner email instead of leaving an unexplained disabled button', () => {
  const { tree, send } = dialog({ 1: '' });
  expect(send.props.disabled).toBe(true);
  expect(renderToStaticMarkup(tree)).toContain('Indique o email do armador');
});

it('sends the explicit inspection, recipient and queue IDs only after the user clicks', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'enviado' }) } as never);
  const { send } = dialog();
  expect(fetch).not.toHaveBeenCalled();
  expect(send.props.disabled).toBe(false);
  await send.props.onClick();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({
    jangadaId: 10, inspecaoId: 101, clienteId: 7, pendingId: 42,
    to: props.defaultTo, senderAccount: 'julio', includeCertificate: true, includeQuadro: true,
  });
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('shows both profiles and blocks the selected unconfigured account despite a ready alternative', () => {
  const { tree, send } = dialog({ 11: 'tecnica' });
  expect(send.props.disabled).toBe(true);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('julio.correia@orey.com');
  expect(html).toContain('azores.tecnica@orey.com');
  expect(html).toContain('Conta de email nao configurada');
});

it('sends from tecnica only when its own configuration is ready', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'enviado' }) } as never);
  const { send } = dialog({ 10: [{ id: 'julio', configured: false }, { id: 'tecnica', configured: true }], 11: 'tecnica' });
  expect(send.props.disabled).toBe(false);
  await send.props.onClick();
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ senderAccount: 'tecnica', inspecaoId: 101, includeQuadro: true });
});

it('hides profiles and sends without a selection when only generic SMTP is available', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'enviado' }) } as never);
  const { tree, send } = dialog({ 10: [], 12: true });
  const html = renderToStaticMarkup(tree);
  expect(html).not.toContain('<select');
  expect(html).not.toContain('julio.correia@orey.com');
  expect(html).not.toContain('azores.tecnica@orey.com');
  expect(send.props.disabled).toBe(false);
  await send.props.onClick();
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).not.toHaveProperty('senderAccount');
});

it('keeps the dialog open and exposes server errors without losing the draft', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Sessao obrigatoria.' }) } as never);
  const { send, setters } = dialog();
  await send.props.onClick();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(setters[9]).toHaveBeenCalledWith('Sessao obrigatoria.');
  expect(appToast.error).toHaveBeenCalledWith('Sessao obrigatoria.');
  for (const index of [1, 2, 3, 4]) expect(setters[index]).not.toHaveBeenCalled();
});

it('uses the same inspection for both document previews', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Preview stopped' }) } as never);
  const { buttons } = dialog();
  const previews = buttons.filter(button => renderToStaticMarkup(button).includes('Ver PDF'));
  expect(previews).toHaveLength(2);
  for (const preview of previews) await preview.props.onClick();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/certificados/pdf', '/api/exportar-raft-pdf']);
  for (const [, init] of fetch.mock.calls) {
    expect(JSON.parse(init!.body as string)).toMatchObject({ jangadaId: 10, inspecaoId: 101 });
  }
});

it('shows certificate-only SOS selection and ignores a stale quadro selection when sending', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'enviado' }) } as never);
  const { tree, send, buttons } = dialog({}, { ...props, certificate: { ...props.certificate, raftModel: 'SOS' } } as typeof props);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('apenas certificado');
  expect(html).not.toContain('Quadro de inspeção');
  expect(buttons.filter(button => renderToStaticMarkup(button).includes('Ver PDF'))).toHaveLength(1);
  expect(send.props.disabled).toBe(false);
  await send.props.onClick();
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ inspecaoId: 101, includeCertificate: true, includeQuadro: false });
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).not.toHaveProperty('quadro');
});

it('uses ficha identity for Arimar AO rafts even when the certificate still has a legacy model', () => {
  const { tree } = dialog({}, { ...props, raft: { brand: 'ARIMAR', model: 'Legacy', serial: 'AO123' } } as typeof props);
  expect(renderToStaticMarkup(tree)).toContain('apenas certificado');
  expect(renderToStaticMarkup(tree)).not.toContain('Quadro de inspeção');
});

it('downloads selected documents via authorized PDF endpoints with the explicit inspection, without sending', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => new Blob(['pdf']) } as never);
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
  const link = { href: '', download: '', click: jest.fn(), remove: jest.fn() };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: jest.fn(() => link), body: { appendChild: jest.fn() } } });
  jest.useFakeTimers();
  try {
    const { buttons } = dialog({ 10: [], 12: false });
    const downloads = buttons.filter(button => renderToStaticMarkup(button).includes('Descarregar'));
    expect(downloads).toHaveLength(2);
    for (const button of downloads) await button.props.onClick();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/certificados/pdf', '/api/exportar-raft-pdf']);
    for (const [, init] of fetch.mock.calls) expect(JSON.parse(init!.body as string)).toMatchObject({ jangadaId: 10, inspecaoId: 101 });
    expect(link.click).toHaveBeenCalledTimes(2);
    expect(props.onClose).not.toHaveBeenCalled();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('offers no quadro download for SOS and no downloads for deselected documents', () => {
  const sos = dialog({}, { ...props, raft: { model: 'SOS' } } as typeof props);
  expect(sos.buttons.filter(button => renderToStaticMarkup(button).includes('Descarregar'))).toHaveLength(1);
  jest.restoreAllMocks();
  const deselected = dialog({ 5: false, 6: false });
  expect(deselected.buttons.filter(button => renderToStaticMarkup(button).includes('Descarregar'))).toHaveLength(0);
});
