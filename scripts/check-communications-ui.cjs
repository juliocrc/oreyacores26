/* Isolated UI regression: node scripts/check-communications-ui.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { compile } = require('@tailwindcss/node');
const { Scanner } = require('@tailwindcss/oxide');

const root = path.resolve(__dirname, '..');
const incoming = {
  id: 101, tipo: 'WHATSAPP', destinatario: '+351912345678',
  mensagem: 'Please confirm the raft inspection.', status: 'recebido',
  enviadoPor: 'remetente:Test Customer', enviadoEm: '2026-10-20T10:00:00Z',
  clienteId: 21, jangadaId: 31, ordemServicoId: 41,
  refTipo: 'ordemServico', refId: 41,
};
const older = {
  ...incoming, id: 90, destinatario: '+351923456789',
  enviadoPor: 'remetente:Older Customer', mensagem: 'Older history marker',
  enviadoEm: '2026-10-19T10:00:00Z',
};

async function assets() {
  const bundle = await esbuild.build({
    absWorkingDir: root,
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import ComunicacaoInbox from './src/modules/ComunicacaoInbox';
        createRoot(document.getElementById('root')).render(<ComunicacaoInbox />);`,
      resolveDir: root, sourcefile: 'communications-ui-harness.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: { '@': path.join(root, 'src') },
  });
  const component = await fs.readFile(path.join(root, 'src/modules/ComunicacaoInbox.tsx'), 'utf8');
  const cssPath = path.join(root, 'src/app/globals.css');
  const compiler = await compile(await fs.readFile(cssPath, 'utf8'), {
    base: path.dirname(cssPath), onDependency() {},
  });
  const candidates = new Scanner({ sources: [] }).scanFiles([{ content: component, extension: 'tsx' }]);
  return { js: bundle.outputFiles[0].text, css: compiler.build(candidates) };
}

async function fixture(browser, origin, viewport, run) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const state = {
    items: [{ ...incoming }], older: [], nextCursor: null,
    status: { canSend: true, allowed: true, provider: 'Mock API',
      sms: { configured: true }, email: { configured: true }, voice: { configured: false },
      audio: { configured: true, speechConfigured: true, deliveryConfigured: true, maxMessageLength: 1500 } },
    posts: [], history: [], statusReads: 0, unexpected: [], errors: [],
    failSend: false, audioPosts: [], apiRequests: [], dialogs: [], confirmAudio: false,
    failAudio: false, delayAudio: false, releaseAudio: null, previews: [],
  };
  try {
    await context.addInitScript(() => {
      window.__uiTest = { opens: [], toasts: [] };
      window.__urls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { const url = create(blob); window.__urls.created.push(url); return url; };
      URL.revokeObjectURL = (url) => { window.__urls.revoked.push(url); revoke(url); };
      window.open = (...args) => { window.__uiTest.opens.push(args); return null; };
      window.addEventListener('app:toast', (event) => window.__uiTest.toasts.push(event.detail));
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (url.pathname.startsWith('/api/')) state.apiRequests.push(`${method} ${url}`);
      if (url.origin === origin && url.pathname === '/api/whatsapp/status' && method === 'GET') {
        state.statusReads++;
        return json(state.status);
      }
      if (url.origin === origin && url.pathname === '/api/comunicacoes/whatsapp-audio/preview' && method === 'POST') {
        state.previews.push(request.postDataJSON());
        return route.fulfill({ contentType: 'audio/mpeg', body: Buffer.from([0xff, 0xf3, 0x64, 0, 1, 2, 3, 4]) });
      }
      if (url.origin === origin && url.pathname === '/api/comunicacoes/whatsapp-audio' && method === 'POST') {
        const body = request.postDataJSON();
        state.audioPosts.push(body);
        if (state.delayAudio) await new Promise((resolve) => { state.releaseAudio = resolve; });
        const id = 300 + state.audioPosts.length;
        state.items = [...state.items, {
          ...body, id, tipo: 'WHATSAPP', canal: 'infinireach-audio', status: 'pendente',
          erro: state.failAudio ? 'Mock audio acceptance uncertain; verify before retrying' : null,
          enviadoEm: '2026-10-24T12:00:00Z',
        }];
        return state.failAudio
          ? json({ ok: false, error: 'Mock audio acceptance uncertain; verify before retrying', comunicacaoId: id }, 502)
          : json({ ok: true, status: 'pendente', providerId: `mock-audio-${id}`, comunicacaoId: id });
      }
      if (url.origin === origin && url.pathname === '/api/comunicacoes') {
        if (method === 'GET') {
          state.history.push(url.search);
          const cursor = url.searchParams.get('cursor');
          if (url.searchParams.get('limite') !== '500' || (cursor !== null && cursor !== '90')) {
            state.unexpected.push(`${method} ${url}`);
            return json({ error: 'Unexpected history query' }, 400);
          }
          return json({ items: cursor === null ? state.items : state.older,
            nextCursor: cursor === null ? state.nextCursor : null,
            total: state.items.length + state.older.length, permissions: { canDelete: false } });
        }
        if (method === 'POST') {
          const body = request.postDataJSON();
          state.posts.push(body);
          state.items = [...state.items, {
            ...body, id: 200 + state.posts.length, status: state.failSend ? 'falhou' : 'enviado',
            erro: state.failSend ? 'Mock provider rejected send' : null,
            enviadoEm: '2026-10-24T12:00:00Z',
          }];
          return state.failSend
            ? json({ error: 'Mock provider rejected send' }, 502)
            : json({ success: true, id: 200 + state.posts.length, provider: 'Mock API' });
        }
      }
      if (url.origin === origin && method === 'GET' && ['/', '/bundle.js', '/styles.css'].includes(url.pathname)) {
        return route.continue();
      }
      state.unexpected.push(`${method} ${url}`);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('dialog', async (dialog) => {
      state.dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (state.confirmAudio && dialog.type() === 'confirm') await dialog.accept();
      else await dialog.dismiss();
    });
    page.on('pageerror', (error) => state.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('502 (Bad Gateway)')) {
        state.errors.push(message.text());
      }
    });
    // Freeze the clock before mounting so polling cannot interfere with other cases.
    await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-24T12:00:00Z'));
    await page.goto(origin);
    await expect(page.getByRole('button', { name: 'Atualizar', exact: true })).toBeEnabled();
    await expect.poll(() => state.statusReads).toBe(1);
    await expect(page.getByRole('button', { name: /Test Customer/ })).toBeVisible();
    await run({ page, state });
    assert.deepEqual(state.unexpected, [], 'All unexpected requests must be blocked and fail the test');
    assert.deepEqual(state.errors, [], 'No browser runtime/console errors');
    assert.equal(context.pages().length, 1, 'No manual WhatsApp popup');
    assert.deepEqual(await page.evaluate(() => window.__uiTest.opens), [], 'No window.open calls');
  } finally {
    if (state.releaseAudio) state.releaseAudio();
    await context.close();
  }
}

const detail = (page) => page.getByRole('region', { name: 'Detalhe da conversa', exact: true });
const message = (page) => detail(page).getByRole('textbox', { name: 'Mensagem', exact: true });
const sendButton = (page) => detail(page).getByRole('button', { name: 'Enviar WhatsApp', exact: true });
const audioCheckbox = (page) => detail(page).getByRole('checkbox', { name: 'Enviar como áudio automático', exact: true });
const audioSend = (page) => detail(page).getByRole('button', { name: 'Gerar e enviar áudio', exact: true });
const previewButton = (page) => detail(page).getByRole('button', { name: 'Ouvir antes de enviar', exact: true });
async function prepareAudio(page) {
  await previewButton(page).click();
  await expect(detail(page).locator('audio')).toHaveCount(1);
  await detail(page).getByRole('checkbox', { name: /Confirmo a pre-escuta/ }).check();
}
async function refreshStatus(page, state) {
  const reads = state.statusReads;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect.poll(() => state.statusReads).toBe(reads + 1);
  await expect(page.getByRole('button', { name: 'Atualizar', exact: true })).toBeEnabled();
}
async function backToList(page, mobile) {
  if (mobile) {
    await page.getByRole('button', { name: 'Voltar às conversas' }).click();
    await expect(detail(page)).toBeHidden();
  }
}
async function newDraft(page, body) {
  await page.getByRole('button', { name: 'Nova mensagem', exact: true }).first().click();
  await detail(page).getByRole('button', { name: 'WhatsApp', exact: true }).click();
  await detail(page).getByRole('textbox', { name: 'Destinatário', exact: true }).fill('+351934567890');
  await message(page).fill(body);
}

const cases = [
  ['new-message draft is discoverable in Rascunhos', async ({ page, state }, mobile) => {
    await newDraft(page, 'Unsent local draft marker');
    await backToList(page, mobile);
    await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
    const draft = page.getByRole('button', { name: /Rascunho de nova mensagem/ });
    await expect(draft).toContainText('Unsent local draft marker');
    await draft.click();
    await expect(message(page)).toHaveValue('Unsent local draft marker');
    await expect(detail(page).getByRole('textbox', { name: 'Destinatário', exact: true })).toHaveValue('+351934567890');
    assert.equal(state.posts.length, 0, 'Editing/navigating must not send');
  }],
  ['failed send preserves draft and reloads failed history', async ({ page, state }, mobile) => {
    state.failSend = true;
    await page.getByRole('button', { name: /Test Customer/ }).click();
    await message(page).fill('Failed send draft marker');
    const reads = state.history.length;
    await sendButton(page).click();
    await expect.poll(() => state.posts.length).toBe(1);
    await expect.poll(() => state.history.length).toBe(reads + 1);
    const failed = detail(page).getByRole('article', { name: 'Mensagem de saída por WhatsApp' });
    await expect(failed).toContainText('Falhou');
    await expect(failed).toContainText('Mock provider rejected send');
    await expect(failed).toContainText('Failed send draft marker');
    await expect(message(page)).toHaveValue('Failed send draft marker');
    await expect(sendButton(page)).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.__uiTest.toasts.some(
      (toast) => toast.severity === 'error' && toast.message.includes('Rascunho preservado')))).toBe(true);
    await backToList(page, mobile);
    await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
    await expect(page.getByRole('button', { name: /Test Customer/ })).toContainText('Rascunho local');
    assert.equal(state.posts.length, 1, 'No automatic send retry');
  }],
  ['WhatsApp API success clears draft without manual URL', async ({ page, state }, mobile) => {
    await newDraft(page, 'API success marker');
    const reads = state.history.length;
    await sendButton(page).click();
    await expect.poll(() => state.posts.length).toBe(1);
    await expect.poll(() => state.history.length).toBe(reads + 1);
    await expect(message(page)).toHaveValue('');
    await expect(sendButton(page)).toBeDisabled();
    await expect(page.getByText('Envio não confirmado.', { exact: false })).toHaveCount(0);
    assert.equal(state.posts[0].tipo, 'WHATSAPP');
    await expect.poll(() => page.evaluate(() => window.__uiTest.toasts.some(
      (toast) => toast.severity === 'success'))).toBe(true);
    await backToList(page, mobile);
    await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
    await expect(page.getByRole('button', { name: /Rascunho de nova mensagem/ })).toHaveCount(0);
  }],
  ['reply POST retains client, raft and work-order references', async ({ page, state }) => {
    await page.getByRole('button', { name: /Test Customer/ }).click();
    await detail(page).getByRole('button', { name: 'Responder', exact: true }).click();
    await expect(detail(page).getByText('A responder a #101', { exact: false })).toBeVisible();
    await message(page).fill('Reply with original references');
    await sendButton(page).click();
    await expect.poll(() => state.posts.length).toBe(1);
    assert.deepEqual(state.posts[0], {
      tipo: 'WHATSAPP', destinatario: incoming.destinatario, mensagem: 'Reply with original references',
      responderA: 101, clienteId: 21, jangadaId: 31, ordemServicoId: 41,
      refTipo: 'ordemServico', refId: 41,
    });
    await expect(message(page)).toHaveValue('');
    await expect(detail(page).getByRole('button', { name: 'Cancelar referência de resposta' })).toHaveCount(0);
  }],
  ['load older follows nextCursor and renders older messages', async ({ page, state }) => {
    state.older = [{ ...older }];
    state.nextCursor = 90;
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Carregar mensagens anteriores', exact: true }).click();
    await expect(page.getByRole('button', { name: /Older Customer/ })).toBeVisible();
    assert(state.history.includes('?limite=500&cursor=90'), 'Must request the supplied nextCursor');
    await expect(page.getByRole('button', { name: 'Carregar mensagens anteriores', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Older Customer/ }).click();
    await expect(detail(page).getByRole('article')).toContainText('Older history marker');
  }],
  ['denied WhatsApp permission disables button and keyboard sending', async ({ page, state }) => {
    state.status = { ...state.status, allowed: false };
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect.poll(() => state.statusReads).toBe(2);
    await newDraft(page, 'Permission-denied draft');
    await expect(detail(page).getByText('A sua conta não tem permissão', { exact: false })).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();
    await message(page).press('Control+Enter');
    await page.clock.runFor(1000);
    assert.equal(state.posts.length, 0);
    await expect(message(page)).toHaveValue('Permission-denied draft');
  }],
  ['polls at 30 seconds and keeps an unsent draft', async ({ page, state }) => {
    await newDraft(page, 'Draft survives polling');
    assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
    await page.clock.runFor(29999);
    assert.equal(state.history.length, 1, 'No early history poll');
    assert.equal(state.statusReads, 1, 'No early status poll');
    state.items = [...state.items, { ...older }];
    await page.clock.runFor(1);
    await expect.poll(() => state.history.length).toBe(2);
    await expect.poll(() => state.statusReads).toBe(2);
    await expect(page.getByText('Histórico · 2 de 2 mensagens', { exact: false })).toBeVisible();
    await expect(message(page)).toHaveValue('Draft survives polling');
    await page.clock.runFor(30000);
    await expect.poll(() => state.history.length).toBe(3);
    assert.equal(state.posts.length, 0, 'Polling must never send');
  }],
  ['audio requires configuration and WhatsApp permission', async ({ page, state }) => {
    await newDraft(page, 'Audio configuration draft');
    const configured = { ...state.status.audio };
    for (const audio of [undefined,
      { ...configured, configured: false, speechConfigured: false },
      { ...configured, configured: false, deliveryConfigured: false },
    ]) {
      state.status.audio = audio;
      await refreshStatus(page, state);
      await expect(audioCheckbox(page)).toBeDisabled();
      await expect(audioCheckbox(page)).not.toBeChecked();
      await expect(detail(page).getByText('Áudio indisponível:', { exact: false })).toBeVisible();
    }
    state.status.audio = configured;
    state.status.allowed = false;
    await refreshStatus(page, state);
    await expect(audioCheckbox(page)).toBeDisabled();
    await expect(sendButton(page)).toBeDisabled();
    state.status.allowed = true;
    await refreshStatus(page, state);
    await expect(audioCheckbox(page)).toBeEnabled();
    assert.equal(state.audioPosts.length, 0);
    assert.equal(state.posts.length, 0);
  }],
  ['audio confirmation cancel performs no network request', async ({ page, state }) => {
    await newDraft(page, 'Cancelled audio transcript');
    await audioCheckbox(page).check();
    await prepareAudio(page);
    const requests = state.apiRequests.length;
    await audioSend(page).click();
    await expect.poll(() => state.dialogs.length).toBe(1);
    assert.equal(state.dialogs[0].type, 'confirm');
    assert.match(state.dialogs[0].message, /\+351934567890/);
    assert.match(state.dialogs[0].message, /Cancelled audio transcript/);
    assert.match(state.dialogs[0].message, /custo/);
    await page.clock.runFor(1000);
    assert.equal(state.apiRequests.length, requests, 'Cancel must not even refresh history');
    assert.equal(state.audioPosts.length, 0);
    assert.equal(state.posts.length, 0);
    await expect(message(page)).toHaveValue('Cancelled audio transcript');
    await expect(audioCheckbox(page)).toBeChecked();
    await expect(audioSend(page)).toBeEnabled();
  }],
  ['audio normalized reply queues acceptance without claiming delivery', async ({ page, state }) => {
    // Use a national-format incoming contact to test normalization without cancelling reply refs.
    state.items = [{ ...incoming, destinatario: '912 345 678' }];
    await refreshStatus(page, state);
    await page.getByRole('button', { name: /Test Customer/ }).click();
    await detail(page).getByRole('button', { name: 'Responder', exact: true }).click();
    await message(page).fill('Audio reply transcript marker');
    await audioCheckbox(page).check();
    await detail(page).getByRole('combobox', { name: 'Voz do audio' }).selectOption('pt-PT-DuarteNeural');
    await prepareAudio(page);
    state.confirmAudio = true;
    const reads = state.history.length;
    await audioSend(page).click();
    await expect.poll(() => state.audioPosts.length).toBe(1);
    assert.deepEqual(state.audioPosts[0], {
      destinatario: '+351912345678', mensagem: 'Audio reply transcript marker', voice: 'pt-PT-DuarteNeural', confirmed: true,
      responderA: 101, clienteId: 21, jangadaId: 31, ordemServicoId: 41,
      refTipo: 'ordemServico', refId: 41,
    });
    await expect.poll(() => state.history.length).toBe(reads + 1);
    await expect(message(page)).toHaveValue('');
    await expect(audioSend(page)).toBeDisabled();
    const article = detail(page).getByRole('article', { name: 'Mensagem de saída por WhatsApp' });
    await expect(article).toContainText('Áudio WhatsApp');
    await expect(article).toContainText('voz sintética em português');
    await expect(article).toContainText('Audio reply transcript marker');
    await expect(article).toContainText('Pendente');
    await expect(article.getByText(/^(Enviado|Entregue|Lido)$/)).toHaveCount(0);
    const toasts = await page.evaluate(() => window.__uiTest.toasts);
    assert.equal(toasts.filter((toast) => toast.severity === 'success').length, 1);
    assert.match(toasts[0].message, /colocado em fila/);
    assert.match(toasts[0].message, /Entrega ainda não confirmada/);
    assert.equal(state.posts.length, 0, 'Audio must not fall back to the text endpoint');
    assert.equal(state.dialogs.length, 1);
  }],
  ['audio double click sends once while response is delayed', async ({ page, state }) => {
    await newDraft(page, 'Delayed audio transcript');
    await audioCheckbox(page).check();
    await prepareAudio(page);
    state.confirmAudio = true;
    state.delayAudio = true;
    const reads = state.history.length;
    await audioSend(page).dblclick({ delay: 40 });
    await expect.poll(() => state.audioPosts.length).toBe(1);
    await expect(detail(page).getByRole('button', { name: 'A processar…', exact: true })).toBeDisabled();
    await expect(message(page)).toBeDisabled();
    await expect(audioCheckbox(page)).toBeDisabled();
    // A keyboard submit during the in-flight request must also be ignored.
    await detail(page).locator('form').press('Control+Enter');
    await page.clock.runFor(30000);
    assert.equal(state.audioPosts.length, 1);
    assert.equal(state.dialogs.length, 1);
    assert.equal(state.history.length, reads, 'Polling must wait while sending');
    state.releaseAudio();
    await expect(message(page)).toHaveValue('');
    await expect.poll(() => state.history.length).toBe(reads + 1);
    assert.equal(state.audioPosts.length, 1);
    assert.equal(state.posts.length, 0);
  }],
  ['uncertain audio 502 preserves draft and reloads audio history', async ({ page, state }, mobile) => {
    await page.getByRole('button', { name: /Test Customer/ }).click();
    await message(page).fill('Uncertain audio transcript');
    await audioCheckbox(page).check();
    await prepareAudio(page);
    state.confirmAudio = true;
    state.failAudio = true;
    const reads = state.history.length;
    await audioSend(page).click();
    await expect.poll(() => state.audioPosts.length).toBe(1);
    await expect.poll(() => state.history.length).toBe(reads + 1);
    await expect(message(page)).toHaveValue('Uncertain audio transcript');
    await expect(audioCheckbox(page)).toBeChecked();
    await expect(audioSend(page)).toBeDisabled();
    const article = detail(page).getByRole('article', { name: 'Mensagem de saída por WhatsApp' });
    await expect(article).toContainText('Áudio WhatsApp');
    await expect(article).toContainText('Uncertain audio transcript');
    await expect(article).toContainText('Mock audio acceptance uncertain');
    await expect.poll(() => page.evaluate(() => window.__uiTest.toasts.some((toast) =>
      toast.severity === 'error' && toast.message.includes('Rascunho preservado') &&
      toast.message.includes('Verifique o histórico')))).toBe(true);
    await backToList(page, mobile);
    await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
    await page.getByRole('button', { name: /Test Customer/ }).click();
    await expect(message(page)).toHaveValue('Uncertain audio transcript');
    await expect(audioCheckbox(page)).toBeChecked();
    await page.clock.runFor(30000);
    await expect.poll(() => state.history.length).toBe(reads + 2);
    assert.equal(state.audioPosts.length, 1, 'No automatic retry of an uncertain paid operation');
    assert.equal(state.posts.length, 0, 'No text fallback on audio failure');
  }],
  ['switching to SMS clears audio mode and sends text only', async ({ page, state }) => {
    await newDraft(page, 'Switch channel transcript');
    await audioCheckbox(page).check();
    await detail(page).getByRole('button', { name: 'SMS', exact: true }).click();
    await expect(audioCheckbox(page)).toHaveCount(0);
    await expect(detail(page).getByRole('button', { name: 'Enviar SMS', exact: true })).toBeEnabled();
    await detail(page).getByRole('button', { name: 'WhatsApp', exact: true }).click();
    await expect(audioCheckbox(page)).not.toBeChecked();
    await expect(sendButton(page)).toBeEnabled();
    await detail(page).getByRole('button', { name: 'SMS', exact: true }).click();
    await detail(page).getByRole('button', { name: 'Enviar SMS', exact: true }).click();
    await expect.poll(() => state.posts.length).toBe(1);
    assert.deepEqual(state.posts[0], {
      tipo: 'SMS', destinatario: '+351934567890', mensagem: 'Switch channel transcript',
    });
    assert.equal(state.audioPosts.length, 0);
    assert.equal(state.dialogs.length, 0);
    await expect(message(page)).toHaveValue('');
  }],
  ['audio transcript enforces 10 to 1500 character limits', async ({ page, state }) => {
    await newDraft(page, 'Too short');
    await audioCheckbox(page).check();
    await expect(audioSend(page)).toBeDisabled();
    await message(page).fill('a'.repeat(10));
    await expect(previewButton(page)).toBeEnabled();
    await expect(audioSend(page)).toBeDisabled();
    await message(page).fill('a'.repeat(1500));
    await expect(previewButton(page)).toBeEnabled();
    await message(page).fill('a'.repeat(1501));
    await expect(audioSend(page)).toBeDisabled();
    await message(page).press('Control+Enter');
    assert.equal(state.audioPosts.length, 0);
    assert.equal(state.posts.length, 0);
    assert.equal(state.dialogs.length, 0);
  }],
  ['preview never sends and edits revoke old audio and confirmation', async ({ page, state }) => {
    await newDraft(page, 'Preview lifecycle original text');
    await audioCheckbox(page).check();
    await prepareAudio(page);
    assert.equal(state.audioPosts.length, 0);
    assert.equal(state.posts.length, 0);
    assert.deepEqual(state.previews[0], { mensagem: 'Preview lifecycle original text', voice: 'pt-BR-AntonioNeural' });
    await expect(audioSend(page)).toBeEnabled();
    await message(page).fill('Preview lifecycle edited text');
    await expect(detail(page).locator('audio')).toHaveCount(0);
    await expect(audioSend(page)).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__urls.revoked.length)).toBe(1);
    await prepareAudio(page);
    await detail(page).getByRole('combobox', { name: 'Voz do audio' }).selectOption('pt-PT-DuarteNeural');
    await expect(detail(page).locator('audio')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__urls.revoked.length)).toBe(2);
    await prepareAudio(page);
    await page.getByRole('button', { name: 'Nova mensagem', exact: true }).first().click();
    await detail(page).getByRole('button', { name: 'SMS', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__urls.revoked.length)).toBe(3);
    assert.equal(state.audioPosts.length, 0);
  }],
];

async function main() {
  const { js, css } = await assets();
  let browser;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const asset = {
      '/': ['text/html; charset=utf-8', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'],
      '/bundle.js': ['text/javascript; charset=utf-8', js],
      '/styles.css': ['text/css; charset=utf-8', css],
    }[pathname];
    response.writeHead(asset ? 200 : 404, { 'Content-Type': asset ? asset[0] : 'text/plain' });
    response.end(asset ? asset[1] : 'Not found');
  });
  let failures = 0;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const [label, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      for (const [name, run] of cases) {
        try {
          await fixture(browser, origin, viewport, (args) => run(args, label === 'mobile'));
          console.log(`PASS ${label}: ${name}`);
        } catch (error) {
          failures++;
          console.error(`FAIL ${label}: ${name}\n${error.stack || error}`);
        }
      }
    }
  } finally {
    try { if (browser) await browser.close(); }
    finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }));
    }
  }
  console.log(`\n${cases.length * 2 - failures}/${cases.length * 2} communications UI checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
