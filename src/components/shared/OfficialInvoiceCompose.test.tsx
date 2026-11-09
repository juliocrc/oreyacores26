import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSession } from 'next-auth/react';
import { useWhatsAppAllowed } from '@/lib/use-whatsapp-allowed';
import OfficialInvoiceCompose from './OfficialInvoiceCompose';
import LocalOutlookCompose from './LocalOutlookCompose';

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/use-whatsapp-allowed', () => ({ useWhatsAppAllowed: jest.fn() }));
const props = { invoiceId: 100, officialNumber: 'NAV-2026/100', clientName: 'Cliente real', portalUrl: 'https://portal.example.test/area-cliente#faturas' };
const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);

beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { email: 'julio.correia@orey.com' } }, status: 'authenticated' } as never);
  jest.mocked(useWhatsAppAllowed).mockReturnValue({ allowed: true } as never);
});
afterEach(() => { jest.restoreAllMocks(); Reflect.deleteProperty(globalThis, 'window'); });

it('provides official-reference templates, client portal link, explicit manual PDF download and Julio local Outlook', () => {
  const html = renderToStaticMarkup(<OfficialInvoiceCompose {...props} />);
  expect(html).toContain(props.officialNumber);
  expect(html).toContain(props.clientName);
  expect(html).toContain(props.portalUrl);
  expect(html).toContain('href="/api/faturas/100/oficial"');
  expect(html).toContain('anexe-o manualmente');
  expect(html).toContain('Abrir no Outlook');
  expect(html).toContain('Preparar nao envia nem regista envio ou entrega');
  expect(html).not.toContain('fatura-pdf');
});

it('keeps the local Outlook and WhatsApp restrictions for other users', () => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { email: 'other@orey.com' } }, status: 'authenticated' } as never);
  jest.mocked(useWhatsAppAllowed).mockReturnValue({ allowed: false } as never);
  const html = renderToStaticMarkup(<OfficialInvoiceCompose {...props} />);
  expect(html).not.toContain('Abrir no Outlook');
  expect(html).not.toContain('Preparar no WhatsApp');
  expect(html).toContain('Modelo de email / WhatsApp');
});

it('opens text-only WhatsApp with a usable client portal URL, never the admin PDF URL, without sends or writes', () => {
  const setState = jest.fn();
  jest.spyOn(React, 'useState').mockImplementation(((initial?: unknown) => [initial, setState]) as typeof React.useState);
  const open = jest.fn();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open } });
  const fetch = jest.spyOn(globalThis, 'fetch');
  const tree = elements(OfficialInvoiceCompose(props));
  const email = tree.find(el => el.type === LocalOutlookCompose)!;
  expect(email.props.body).toContain(props.portalUrl);
  expect(email.props.body).not.toContain('/api/faturas');
  tree.find(el => el.type === 'button')!.props.onClick();
  const url = new URL(open.mock.calls[0][0]);
  expect(url.origin).toBe('https://wa.me');
  expect(url.searchParams.get('text')).toContain(props.officialNumber);
  expect(url.searchParams.get('text')).toContain(props.portalUrl);
  expect(url.searchParams.get('text')).not.toContain('/api/');
  expect(fetch).not.toHaveBeenCalled();
  expect(setState).toHaveBeenCalledWith(expect.stringContaining('Nada foi enviado nem registado'));
});
