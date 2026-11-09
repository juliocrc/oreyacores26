import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ComunicacaoInbox from "./ComunicacaoInbox";
import { prepareCommunicationAlert, takeCommunicationAlert } from "@/lib/communication-alert-draft";
import OpenWaConnection from "@/components/shared/OpenWaConnection";
import EmailSenderSelect from '@/components/shared/EmailSenderSelect';
import LocalOutlookCompose from '@/components/shared/LocalOutlookCompose';

jest.mock("@/components/shared/OpenWaConnection", () => ({ __esModule: true, default: () => null }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
jest.mock("@/lib/app-toast", () => ({ appToast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));

const status = { allowed: true, audio: { configured: true, speechConfigured: true, deliveryConfigured: true, maxMessageLength: 1500 } };
const response = (data: unknown, code = 200, headers: Record<string, string> = {}) => ({
  ok: code < 400, status: code, headers: new Headers(headers), json: async () => data,
});
const audioResponse = () => ({ ...response(null, 200, { "content-type": "audio/mpeg" }), blob: async () => new Blob(["audio"]) });

// Use the repository's Node-only component harness to exercise actual handlers and effects.
function mount() {
  const slots: any[] = [];
  const effects: { deps?: React.DependencyList; cleanup?: void | (() => void) }[] = [];
  let index = 0;
  let effectIndex = 0;
  let pending: (() => void)[] = [];
  jest.spyOn(React, "useState").mockImplementation(((initial: any) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
    return [slots[slot], (next: any) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
  }) as any);
  jest.spyOn(React, "useRef").mockImplementation(((initial: any) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = { current: initial };
    return slots[slot];
  }) as any);
  jest.spyOn(React, "useEffect").mockImplementation((effect, deps) => {
    const slot = effectIndex++;
    const previous = effects[slot];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) {
      pending.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: effect() }; });
    }
  });
  let node: React.ReactElement;
  const render = () => {
    index = 0; effectIndex = 0; pending = [];
    node = ComunicacaoInbox({});
    pending.forEach((effect) => effect());
  };
  const elements = (value: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(value).flatMap((child) => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  const find = (predicate: (el: React.ReactElement<any>) => boolean) => {
    const el = elements(node).find(predicate);
    if (!el) throw new Error("Element not found");
    return el;
  };
  const text = (el: React.ReactElement<any>) => renderToStaticMarkup(<>{el.props.children}</>);
  render();
  return {
    render,
    html: () => renderToStaticMarkup(node),
    button: (label: string) => find((el) => el.type === "button" && text(el).includes(label) && (label !== "Email" || el.props.type === "button")),
    click(label: string) {
      const el = this.button(label);
      if (el.props.disabled) throw new Error(`Disabled: ${label}`);
      el.props.onClick(); render();
    },
    channel(label: string) {
      const container = find(el => el.props["aria-label"] === "Canal de envio");
      elements(container.props.children).find(el => el.type === "button" && text(el).includes(label))!.props.onClick();
      render();
    },
    submit() {
      find(el => el.type === 'form').props.onSubmit({ preventDefault: jest.fn() }); render();
    },
    change(label: string, value: string | boolean) {
      const el = find((el) => el.props["aria-label"] === label || el.type === "label" && text(el).includes(label));
      const input = [el, ...elements(el.props.children)].find((child) => ["input", "select", "textarea"].includes(String(child.type)))!;
      if (input.props.disabled) throw new Error(`Disabled: ${label}`);
      input.props.onChange({ target: { value, checked: value } }); render();
    },
    provider(connected: boolean) {
      find((el) => el.type === OpenWaConnection).props.onStatusChange({ configured: true, connected, businessHours: { open: true } }); render();
    },
    sender(value: 'julio' | 'tecnica') {
      find(el => el.type === EmailSenderSelect).props.onChange(value); render();
    },
    localCompose: () => find(el => el.type === LocalOutlookCompose),
    settle: async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); render(); },
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}

let fetchMock: jest.Mock;
let expectedEmailPosts: number;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  expectedEmailPosts = 0;
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout, confirm: jest.fn(() => true) } });
  jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  fetchMock = jest.fn(async (url: string) => {
    if (url === "/api/whatsapp/status") return response(status);
    if (url.startsWith("/api/comunicacoes?")) return response({ items: [], total: 0 });
    if (url.endsWith("/preview")) return audioResponse();
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetchMock;
});
afterEach(() => {
  // Delivery requests are always mocked; audio tests must never submit delivery.
  const posts = fetchMock.mock.calls.filter(([url, init]) => init?.method === "POST" && !url.endsWith("/preview"));
  expect(posts).toHaveLength(expectedEmailPosts);
  for (const [url] of posts) expect(url).toBe('/api/comunicacoes');
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks(); jest.useRealTimers();
  Reflect.deleteProperty(globalThis, "window");
});

async function audioDraft(connected = true) {
  const ui = mount(); await ui.settle();
  ui.provider(connected);
  ui.click("Nova mensagem");
  ui.change("Destinatário", "+351912345678");
  ui.change("Enviar como áudio automático", true);
  ui.change("Aplicar modelo de mensagem", "vistoria");
  return ui;
}

it("opens the transferred inspection alert as a WhatsApp draft without sending", async () => {
  prepareCommunicationAlert({ recipient: "+351912345678", body: "Vistoria da jangada 123" });
  const ui = mount();
  await ui.settle();
  expect(ui.html()).toContain("+351912345678");
  expect(ui.html()).toContain("Vistoria da jangada 123");
  expect(takeCommunicationAlert()).toBeNull();
});

it("offers SMS next to email and submits an SMS only when requested", async () => {
  expectedEmailPosts = 1;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/whatsapp/status") return response({ ...status, sms: { configured: true } });
    if (url.startsWith("/api/comunicacoes?")) return response({ items: [], total: 0 });
    if (url === "/api/comunicacoes" && init?.method === "POST") return response({ ok: true });
    throw new Error(`Unexpected request: ${url}`);
  });
  const ui = mount(); await ui.settle();
  ui.click("Nova mensagem");
  ui.channel("SMS");
  ui.change("Destinatário", "+351912345678");
  ui.change("Mensagem", "Teste de SMS");
  expect(ui.button("Enviar SMS").props.disabled).toBe(false);
  ui.submit(); await ui.settle();
  const request = fetchMock.mock.calls.find(([url, init]) => url === "/api/comunicacoes" && init?.method === "POST");
  expect(JSON.parse(request![1].body)).toMatchObject({ tipo: "SMS", destinatario: "+351912345678", mensagem: "Teste de SMS" });
});

it('uses selected account readiness rather than global SMTP readiness in the central email composer', async () => {
  fetchMock.mockImplementation(async (url: string) => url === '/api/whatsapp/status' ? response({
    ...status, email: { configured: true, accounts: [{ id: 'julio', configured: false }, { id: 'tecnica', configured: true }] },
  }) : response({ items: [], total: 0 }));
  const ui = mount(); await ui.settle();
  ui.click('Nova mensagem');
  ui.click('Email');
  ui.change('Destinatário', 'owner@example.test');
  ui.change('Aplicar modelo de mensagem', 'vistoria');
  expect(ui.html()).toContain('julio.correia@orey.com');
  expect(ui.html()).toContain('azores.tecnica@orey.com');
  expect(ui.button('Enviar email').props.disabled).toBe(true);
  ui.sender('tecnica');
  expect(ui.button('Enviar email').props.disabled).toBe(false);
  ui.sender('julio');
  expect(ui.button('Enviar email').props.disabled).toBe(true);
  ui.unmount();
});

it('hides profiles and uses generic SMTP readiness and payload for other users', async () => {
  fetchMock.mockImplementation(async (url: string) => url === '/api/whatsapp/status' ? response({
    ...status, email: { configured: true, accounts: [] },
  }) : response({ items: [], total: 0 }));
  const ui = mount(); await ui.settle();
  ui.click('Nova mensagem'); ui.click('Email');
  ui.change('Destinatário', 'owner@example.test');
  ui.change('Aplicar modelo de mensagem', 'vistoria');
  expect(ui.button('Enviar email').props.disabled).toBe(false);
  expect(ui.html()).not.toContain('julio.correia@orey.com');
  expect(ui.html()).not.toContain('azores.tecnica@orey.com');
  expect(ui.html()).not.toContain('Conta de envio');
  expectedEmailPosts = 1;
  ui.submit(); await ui.settle();
  const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/comunicacoes' && init?.method === 'POST')!;
  expect(JSON.parse(post[1].body)).toMatchObject({ tipo: 'EMAIL', destinatario: 'owner@example.test' });
  expect(JSON.parse(post[1].body)).not.toHaveProperty('senderAccount');
  ui.unmount();
});

it("preserves audio when applying a predefined template and requires preview and consent with a ready provider", async () => {
  const ui = await audioDraft();
  expect(ui.html()).toContain("agendar a vistoria");
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  expect(ui.html()).toContain("Gere a pre-escuta antes de enviar");
  ui.click("Ouvir antes de enviar"); await ui.settle();
  expect(ui.html()).toContain('src="blob:preview"');
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  ui.change("Confirmo a pre-escuta", true);
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(false);
  ui.change("Aplicar modelo de mensagem", "certificado");
  expect(ui.html()).not.toContain('src="blob:preview"');
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  ui.unmount();
});

it("allows preview without a WhatsApp session, but never enables sending", async () => {
  const ui = await audioDraft(false);
  ui.click("Ouvir antes de enviar"); await ui.settle();
  ui.change("Confirmo a pre-escuta", true);
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  expect(ui.html()).toContain("Ligue a sessao WhatsApp");
  ui.provider(true);
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(false);
  ui.unmount();
});

it.each([
  [503, { code: "AUDIO_RATE_LIMIT_UNAVAILABLE", error: "Unavailable" }, {}, "configurar o limitador de pedidos"],
  [429, { error: "Limite de pre-escutas atingido." }, { "Retry-After": "37" }, "dentro de 37 segundos"],
  [400, { error: "Texto ou voz invalidos." }, {}, "Texto ou voz invalidos."],
  [503, {}, {}, "verificar a configuracao do servico"],
])("shows actionable HTTP %s preview failures without allowing consent or sending", async (code, data, headers, expected) => {
  const ui = await audioDraft();
  fetchMock.mockResolvedValueOnce(response(data, code as number, headers as Record<string, string>));
  ui.click("Ouvir antes de enviar"); await ui.settle();
  expect(ui.html()).toContain(expected as string);
  expect(ui.html()).not.toContain("<audio");
  expect(() => ui.change("Confirmo a pre-escuta", true)).toThrow("Disabled");
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  ui.unmount();
});

it("recovers from timeout even if fetch ignores abort, and ignores the late response", async () => {
  const ui = await audioDraft();
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  ui.click("Ouvir antes de enviar");
  jest.advanceTimersByTime(40_000); await ui.settle();
  expect(ui.html()).toContain("demorou demasiado");
  ui.click("Ouvir antes de enviar"); await ui.settle();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  finish(audioResponse()); await ui.settle();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  ui.unmount();
});

it("does not switch an email draft to WhatsApp when applying a template", async () => {
  const ui = mount(); await ui.settle(); ui.click("Nova mensagem");
  const channelButton = ui.button("Email"); channelButton.props.onClick(); ui.render();
  ui.change("Aplicar modelo de mensagem", "pagamento");
  expect(ui.html()).toContain("Enviar email");
  expect(ui.html()).not.toContain("Enviar como áudio automático");
  ui.unmount();
});

it('offers the local composer only for EMAIL, with the unchanged draft and no configured profiles', async () => {
  const ui = mount(); await ui.settle(); ui.click('Nova mensagem');
  expect(() => ui.localCompose()).toThrow('Element not found');
  ui.click('Email');
  ui.change('Destinatário', 'owner@example.test');
  ui.change('Assunto', 'Inspection & certificate');
  ui.change('Mensagem', 'Hello\nDocuments');
  expect(ui.button('Enviar email').props.disabled).toBe(true);
  expect(ui.localCompose().props).toMatchObject({ recipient: 'owner@example.test', subject: 'Inspection & certificate', body: 'Hello\nDocuments', senderAccount: 'julio' });
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  ui.unmount();
});

it("keeps sending blocked when the audio provider configuration is not ready", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...status, audio: { ...status.audio, configured: false, deliveryConfigured: false } }));
  const ui = await audioDraft();
  ui.click("Ouvir antes de enviar"); await ui.settle();
  ui.change("Confirmo a pre-escuta", true);
  expect(ui.button("Enviar áudio confirmado").props.disabled).toBe(true);
  expect(ui.html()).toContain("Configuracao do servico de audio por confirmar");
  ui.unmount();
});

it("does not expose raw network errors and permits an explicit preview retry", async () => {
  const ui = await audioDraft();
  fetchMock.mockRejectedValueOnce(new Error("SECRET upstream credentials"));
  ui.click("Ouvir antes de enviar"); await ui.settle();
  expect(ui.html()).not.toContain("SECRET");
  expect(ui.html()).toContain("Nenhum audio foi enviado");
  ui.click("Ouvir antes de enviar"); await ui.settle();
  expect(ui.html()).toContain('src="blob:preview"');
  ui.unmount();
});
