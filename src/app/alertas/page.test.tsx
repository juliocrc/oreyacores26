import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertasPage from './page';

afterEach(() => {
  jest.restoreAllMocks();
});

it('offers only WhatsApp, SMS and email and keeps their notification actions', async () => {
  const alert = { tipo: 'inspecao', id: 1, referencia: 'J-1', clienteTelefone: '+351912345678', clienteEmail: 'cliente@example.com' };
  const slots: unknown[] = [];
  let cursor = 0;
  jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = slot === 0 ? false : initial && typeof initial === 'object' && 'alertas' in initial
      ? { ...initial, total: 1, alertas: [alert] } : initial;
    return [slots[slot], (next: unknown) => { slots[slot] = next; }];
  }) as typeof React.useState);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  const render = () => { cursor = 0; return AlertasPage(); };
  const click = async (label: string) => {
    const button = elements(render()).find(el => el.type === 'button' && renderToStaticMarkup(<>{el.props.children}</>).replace(/<[^>]*>/g, '').trim() === label);
    expect(button).toBeDefined();
    expect(button!.props.disabled).not.toBe(true);
    await button!.props.onClick();
  };
  const open = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open } });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  try {
    await click('Notificar');
    const html = renderToStaticMarkup(render());
    expect(html).toContain('WhatsApp');
    expect(html).toContain('SMS');
    expect(html).toContain('E-mail');
    expect(html).not.toMatch(/Twilio|Chamada|guião|Ligação telefónica/i);
    await click('Enviar WhatsApp');
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/351912345678?text='), '_blank');
    await click('SMS');
    await click('Enviar SMS');
    expect(fetchMock).toHaveBeenCalledWith('/api/notificar-sms', expect.objectContaining({ method: 'POST' }));
    await click('E-mail');
    await click('Abrir E-mail');
    expect(open).toHaveBeenCalledWith(expect.stringContaining('mailto:cliente@example.com?subject='), '_blank');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
