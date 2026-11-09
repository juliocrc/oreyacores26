import React from 'react';
import { signIn, useSession } from 'next-auth/react';
import { markAppSessionOpen } from '@/app/session-idle-timeout';
import AreaClienteLoginPage from './page';

jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signIn: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/app/session-idle-timeout', () => ({ markAppSessionOpen: jest.fn() }));

const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);

function harness(initial: unknown[] = []) {
  const states = [...initial];
  let cursor = 0;
  jest.spyOn(React, 'useState').mockImplementation(((value: unknown) => {
    const index = cursor++;
    if (!(index in states)) states[index] = value;
    return [states[index], (next: unknown) => { states[index] = next; }];
  }) as never);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  return {
    states,
    render: () => { cursor = 0; return elements(AreaClienteLoginPage()); },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSession).mockReturnValue({ status: 'unauthenticated', data: null } as never);
});
afterEach(() => jest.restoreAllMocks());

it('keeps code request and login on one page without links to a second portal or staff login', () => {
  const ui = harness();
  const tree = ui.render();
  const action = tree.find(element => element.props.children === 'Pedir Código de Acesso')!;
  expect(action.props.type).toBe('submit');
  expect(action.props.fullWidth).toBe(true);
  expect(tree.filter(element => element.props.component === 'form')).toHaveLength(2);
  expect(tree.some(element => element.props.href === '/portal-cliente' || element.props.href === '/login')).toBe(false);
});

it.each([
  ['owner@example.test', { email: 'owner@example.test' }],
  ['+351912345678', { phone: '+351912345678' }],
])('requests a code and signs into the same area using the requested contact (%s)', async (contact, expected) => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
  const ui = harness(['', '99999', null, false, contact]);
  await ui.render().find(element => element.props.id === 'pedir-codigo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/client-code', expect.objectContaining({ body: JSON.stringify(expected) }));
  expect(ui.states[1]).toBe('');
  expect(ui.states[5]).toBe(contact);
  expect(ui.states[7]).toEqual(expect.stringContaining('A entrega pode estar pendente'));
  ui.states[1] = '12345';
  jest.mocked(signIn).mockResolvedValue(undefined as never);
  const forms = ui.render().filter(element => element.props.component === 'form');
  await forms[1].props.onSubmit({ preventDefault: jest.fn() });
  expect(signIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ loginType: 'client', ...expected, code: '12345', callbackUrl: '/area-cliente', redirect: false }));
  expect(markAppSessionOpen).not.toHaveBeenCalled();
});

it('keeps NIF login available for a code issued by the administrator', async () => {
  const ui = harness(['501117334', '12345']);
  jest.mocked(signIn).mockResolvedValue(undefined as never);
  const forms = ui.render().filter(element => element.props.component === 'form');
  await forms[1].props.onSubmit({ preventDefault: jest.fn() });
  expect(signIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ nif: '501117334', code: '12345' }));
  expect(ui.states[2]).toEqual(expect.stringContaining('inválidos'));
  expect(markAppSessionOpen).not.toHaveBeenCalled();
});

it('retains an existing verification contact when a new code request fails', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Envio indisponivel.' }) } as Response);
  const ui = harness(['', '12345', null, false, 'new@example.test', 'old@example.test']);
  await ui.render().find(element => element.props.id === 'pedir-codigo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(ui.states[2]).toBe('Envio indisponivel.');
  expect(ui.states[5]).toBe('old@example.test');
  expect(ui.states[6]).toBe(false);
});

it('confirms the assistance request even when automatic code delivery fails', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({
    error: 'Envio indisponivel.', assistanceRequested: true, message: 'A equipa recebeu o seu pedido.',
  }) } as Response);
  const ui = harness(['', '', null, false, 'owner@example.test']);
  await ui.render().find(element => element.props.id === 'pedir-codigo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(ui.states[2]).toBe('Envio indisponivel.');
  expect(ui.states[7]).toBe('A equipa recebeu o seu pedido.');
  expect(ui.states[5]).toBe('');
});

it('cannot verify an incomplete code or submit while a request is pending', async () => {
  const ui = harness(['501117334', '123', null, false, '', '', true]);
  const form = ui.render().filter(element => element.props.component === 'form')[1];
  await form.props.onSubmit({ preventDefault: jest.fn() });
  expect(signIn).not.toHaveBeenCalled();
});

it('switches back to NIF verification without requesting a replacement code', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const ui = harness(['501117334', '12345', null, false, 'owner@example.test', 'owner@example.test', false, 'Notice']);
  ui.render().find(element => element.props.children === 'Já tenho outro código: entrar com NIF')!.props.onClick();
  expect(ui.states[5]).toBe('');
  expect(ui.states[1]).toBe('');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('opens registration details when the contact is not found', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Contacto nao encontrado.', registrationRequired: true }) } as Response);
  const ui = harness(['', '', null, false, 'owner@example.test']);
  await ui.render().find(element => element.props.id === 'pedir-codigo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(ui.states[8]).toBe(true);
  expect(ui.states[9]).toMatchObject({ email: 'owner@example.test', phone: '' });
  expect(ui.render().some(element => element.props.id === 'dados-registo')).toBe(true);
});

it('explains manual assistance rather than claiming a code was sent to a client without email', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: false, manualDelivery: true, assistanceRequested: true }) } as Response);
  const ui = harness(['', '', null, false, '912345678']);
  await ui.render().find(element => element.props.id === 'pedir-codigo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(ui.states[5]).toBe('');
  expect(ui.states[7]).toEqual(expect.stringContaining('A equipa vai validar o acesso'));
  expect(ui.states[7]).not.toContain('Pedido de envio aceite');
});

it('submits a registration without email and preserves manual-code login', async () => {
  const registration = { nome: 'Owner', nif: '501117334', email: '', phone: '912345678' };
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: false, manualDelivery: true, assistanceRequested: true }) } as Response);
  const ui = harness(['', '', null, false, '', '', false, '', true, registration]);
  await ui.render().find(element => element.props.id === 'dados-registo')!.props.onSubmit({ preventDefault: jest.fn() });
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/client-registration', expect.objectContaining({ body: JSON.stringify(registration) }));
  expect(ui.states[0]).toBe(registration.nif);
  expect(ui.states[5]).toBe('');
  expect(ui.states[8]).toBe(false);
  expect(ui.states[7]).toEqual(expect.stringContaining('codigo fornecido pela equipa'));
});
