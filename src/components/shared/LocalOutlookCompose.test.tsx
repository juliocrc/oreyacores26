import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSession } from 'next-auth/react';
import LocalOutlookCompose from './LocalOutlookCompose';

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));
const props = { recipient: 'owner@example.test', subject: 'Inspeção & raft', body: 'Olá\nObrigado', senderAccount: 'tecnica' as const, onSenderChange: jest.fn() };
const session = (email: string | null, status = 'authenticated') => jest.mocked(useSession).mockReturnValue({ data: email ? { user: { email } } : null, status } as never);
const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);

afterEach(() => jest.restoreAllMocks());

it.each(['other@orey.com', 'azores.tecnica@orey.com', null])('is hidden for non-Julio sessions (%s)', email => {
  session(email);
  expect(renderToStaticMarkup(<LocalOutlookCompose {...props} />)).toBe('');
});

it.each(['loading', 'unauthenticated'])('is hidden until authentication is confirmed (%s)', status => {
  session('julio.correia@orey.com', status);
  expect(renderToStaticMarkup(<LocalOutlookCompose {...props} />)).toBe('');
});

it('is available to normalized Julio without profile readiness and explains local limits', () => {
  session(' JULIO.CORREIA@OREY.COM ');
  const html = renderToStaticMarkup(<LocalOutlookCompose {...props} />);
  expect(html).toContain('Abrir no Outlook');
  expect(html).toContain('MAILTO');
  expect(html).toContain('sem exigir SMTP/OAuth');
  expect(html).toContain('Escolha manualmente o campo De');
  expect(html).toContain('Nenhum anexo e adicionado automaticamente');
  expect(html).toContain('nao atualiza o historico');
  expect(html).toContain('azores.tecnica@orey.com');
});

it('opens only mailto, with no fetch, write, send confirmation or draft callback', () => {
  session('julio.correia@orey.com');
  const notice = jest.fn();
  jest.spyOn(React, 'useState').mockReturnValue(['', notice] as never);
  const assign = jest.fn();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign } } });
  const fetch = jest.spyOn(globalThis, 'fetch');
  const tree = LocalOutlookCompose(props);
  elements(tree).find(el => el.type === 'button')!.props.onClick();
  expect(assign).toHaveBeenCalledWith('mailto:owner%40example.test?subject=Inspe%C3%A7%C3%A3o%20%26%20raft&body=Ol%C3%A1%0D%0AObrigado');
  expect(fetch).not.toHaveBeenCalled();
  expect(props.onSenderChange).not.toHaveBeenCalled();
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('Nada foi enviado nem registado'));
});

it('shows actionable errors without opening a truncated URI', () => {
  session('julio.correia@orey.com');
  const notice = jest.fn();
  jest.spyOn(React, 'useState').mockReturnValue(['', notice] as never);
  const assign = jest.fn();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign } } });
  const tree = LocalOutlookCompose({ ...props, body: 'x'.repeat(2000) });
  elements(tree).find(el => el.type === 'button')!.props.onClick();
  expect(assign).not.toHaveBeenCalled();
  expect(notice).toHaveBeenCalledWith(expect.stringMatching(/Reduza o texto ou copie.*Descarregue os documentos/));
});
