/* Isolated browser regression. All API traffic is mocked; no database access.
 * Run: node scripts/check-jangada-form-ui.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { compile } = require('@tailwindcss/node');
const { Scanner } = require('@tailwindcss/oxide');

const root = path.resolve(__dirname, '..');
async function assets() {
  const bundle = await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: `import React, { Profiler } from 'react';
      import { createRoot } from 'react-dom/client';
      import Page from './src/app/jangadas/page';
      createRoot(document.getElementById('root')).render(
        <Profiler id="page" onRender={() => window.__uiTest.commits++}><Page /></Profiler>);`,
    resolveDir: root, sourcefile: 'jangada-form-harness.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: { '@': path.join(root, 'src') },
    plugins: [{ name: 'next-fixtures', setup(build) {
      build.onResolve({ filter: /^(next\/link|next\/navigation|next-auth\/react)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents:
        args.path === 'next/link' ? `import React from 'react'; export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }` :
        args.path === 'next/navigation' ? `const router = { push: (url) => window.__uiTest.navigations.push(url), refresh() {} }; export const useRouter = () => router;` :
        `export const useSession = () => ({ status: 'authenticated' });`,
      }));
    } }],
  });
  const cssPath = path.join(root, 'src/app/globals.css');
  const compiler = await compile(await fs.readFile(cssPath, 'utf8'), { base: path.dirname(cssPath), onDependency() {} });
  const sources = await Promise.all(['src/app/jangadas/page.tsx', 'src/components/shared/DataTable.tsx'].map(async file => ({
    content: await fs.readFile(path.join(root, file), 'utf8'), extension: 'tsx',
  })));
  return { js: bundle.outputFiles[0].text, css: compiler.build(new Scanner({ sources: [] }).scanFiles(sources)) };
}

const input = (page, name) => page.locator(`form input[name="${name}"]`);
async function open(page) {
  await page.getByRole('button', { name: '+ Nova Jangada', exact: true }).click();
  await expect(input(page, 'brand')).toBeVisible();
}
async function fill(page) {
  await input(page, 'brand').fill('RFD');
  await input(page, 'model').fill('SURVIVA');
  await input(page, 'serial').fill('MOCK-NEW-RAFT');
  await input(page, 'packType').fill('R');
  await input(page, 'dataFabrico').fill('2024-05');
  await input(page, 'capacity').fill('25');
}
async function retained(page) {
  await expect(input(page, 'serial')).toHaveValue('MOCK-NEW-RAFT');
  await expect(input(page, 'dataFabrico')).toHaveValue('2024-05');
  await expect(input(page, 'capacity')).toHaveValue('25');
  await expect(input(page, 'serial')).toBeEnabled();
}
async function settled(page) {
  await expect.poll(async () => {
    const before = await page.evaluate(() => window.__uiTest.commits);
    await page.waitForTimeout(600);
    return (await page.evaluate(() => window.__uiTest.commits)) - before;
  }, { timeout: 15000, message: 'The idle page must settle after debounce/deferred work, not render continuously' }).toBe(0);
}

const cases = [
  ['idle page settles and modal fields remain interactive', async ({ page }) => {
    await open(page);
    await fill(page);
    await settled(page);
    await retained(page);
    await input(page, 'serial').press('End');
    const start = Date.now();
    await input(page, 'serial').pressSequentially('-TYPED', { delay: 15 });
    await expect(input(page, 'serial')).toHaveValue('MOCK-NEW-RAFT-TYPED');
    console.log(`  Six characters typed in ${Date.now() - start}ms; idle renders in 600ms: 0`);
  }],
  ['existing table selection does not restart the render loop', async ({ page }) => {
    await page.locator('table tbody input[type="checkbox"]').first().check();
    await expect(page.getByRole('button', { name: 'Excluir selecionadas (1)', exact: true })).toBeVisible();
    await open(page); await fill(page);
    await settled(page);
    await retained(page);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(input(page, 'brand')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Excluir selecionadas (1)', exact: true })).toBeVisible();
  }],
  ['catalog suggestions settle and manual overrides survive', async ({ page }) => {
    await open(page);
    await input(page, 'brand').fill('RFD');
    await input(page, 'model').fill('SEASAVA PLUS');
    await expect(input(page, 'packType')).not.toHaveValue('');
    await expect(input(page, 'capacity')).not.toHaveValue('');
    await input(page, 'packType').fill('SOLAS A');
    await input(page, 'capacity').fill('12');
    await input(page, 'launchType').fill('Manual override');
    await page.waitForTimeout(700);
    await expect(input(page, 'packType')).toHaveValue('SOLAS A');
    await expect(input(page, 'capacity')).toHaveValue('12');
    await expect(input(page, 'launchType')).toHaveValue('Manual override');
  }],
  ['rapid brand/model changes do not overwrite explicit values', async ({ page }) => {
    await open(page);
    await fill(page);
    await input(page, 'model').fill('SURVIVA 16');
    await input(page, 'brand').fill('VIKING');
    await input(page, 'model').fill('CUSTOM MODEL');
    await input(page, 'launchType').fill('Manual launch');
    await input(page, 'packType').fill('SOLAS A');
    await input(page, 'capacity').fill('12');
    await page.waitForTimeout(800);
    for (const [name, value] of Object.entries({ brand: 'VIKING', model: 'CUSTOM MODEL', launchType: 'Manual launch', packType: 'SOLAS A', capacity: '12' })) {
      await expect(input(page, name)).toHaveValue(value);
    }
    await page.getByRole('button', { name: 'Validades dos artigos', exact: false }).click();
    await page.getByRole('button', { name: 'Dados', exact: true }).click();
    await expect(input(page, 'model')).toHaveValue('CUSTOM MODEL');
  }],
  ['slow rejected save retains data, unlocks, and can retry', async ({ page, state }) => {
    await open(page); await fill(page);
    state.mode = 'hold';
    await page.getByRole('button', { name: 'Criar Jangada', exact: true }).click();
    await expect.poll(() => state.posts.length).toBe(1);
    await expect(input(page, 'serial')).toBeDisabled();
    // Even a programmatic duplicate submission must not issue a second POST.
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(state.posts.length, 1);
    state.release();
    await expect(page.getByRole('alert')).toContainText('Mock rejected');
    await retained(page);
    state.mode = 'success';
    await page.getByRole('button', { name: 'Criar Jangada', exact: true }).click();
    await expect.poll(() => state.posts.length).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__uiTest.navigations)).toEqual(['/jangadas/99999']);
    assert.equal(state.listReads, 1, 'Creating must not wait for another full-list fetch');
  }],
  ['network failure retains editable inputs', async ({ page, state }) => {
    await open(page); await fill(page); state.mode = 'network';
    await page.getByRole('button', { name: 'Criar Jangada', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await retained(page);
    await input(page, 'serial').fill('CAN-EDIT-AFTER-FAILURE');
    await expect(input(page, 'serial')).toHaveValue('CAN-EDIT-AFTER-FAILURE');
  }],
  ['stalled save times out and releases the form lock', async ({ page, state }) => {
    await open(page); await fill(page); state.mode = 'hold';
    await page.clock.install();
    await page.getByRole('button', { name: 'Criar Jangada', exact: true }).click();
    await expect.poll(() => state.posts.length).toBe(1);
    await page.clock.fastForward(31000);
    await expect(page.getByRole('alert')).toContainText('demorou');
    await retained(page);
    assert.equal(state.posts.length, 1, 'A timed-out POST must not be retried automatically');
  }],
  ['invalid response unlocks without clearing the form', async ({ page, state }) => {
    await open(page); await fill(page); state.mode = 'invalid';
    await page.getByRole('button', { name: 'Criar Jangada', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Confirme na lista');
    await retained(page);
  }],
];

async function fixture(browser, origin, viewport, run) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const state = { mode: 'success', posts: [], listReads: 0, unexpected: [], errors: [], release: null };
  try {
    await context.addInitScript(() => { window.__uiTest = { commits: 0, navigations: [] }; });
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (url.origin === origin && request.method() === 'GET' && ['/', '/bundle.js', '/styles.css'].includes(url.pathname)) return route.continue();
      if (url.origin === origin && url.pathname === '/api/jangadas/catalog-options') return json({ options: [] });
      if (url.origin === origin && url.pathname === '/api/jangadas/pack-types') return json({ options: ['R', 'SOLAS A'] });
      if (url.origin === origin && url.pathname === '/api/jangadas') {
        if (request.method() === 'GET') {
          state.listReads++;
          return json({ items: Array.from({ length: Number(process.env.RAFT_ROWS || 50) }, (_, index) => ({
            id: index + 1, brand: 'RFD', model: 'SURVIVA', serial: `MOCK-${index}`, capacity: 25, packType: 'R', owner: 'Mock owner',
          })) });
        }
        if (request.method() === 'POST') {
          state.posts.push(request.postDataJSON());
          if (state.mode === 'hold') {
            await new Promise(resolve => { state.release = resolve; });
            return json({ error: 'Mock rejected; draft retained' }, 503);
          }
          if (state.mode === 'network') return route.abort('failed');
          if (state.mode === 'invalid') return route.fulfill({ status: 201, contentType: 'application/json', body: 'not json' });
          return json({ ...request.postDataJSON(), id: 99999 }, 201);
        }
      }
      state.unexpected.push(`${request.method()} ${url}`);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('console', message => { if (/Maximum update depth|Too many re-renders/.test(message.text())) state.errors.push(message.text()); });
    await page.goto(origin);
    await expect.poll(() => state.listReads).toBe(1);
    await run({ page, state });
    assert.deepEqual(state.errors, [], 'No render loops or browser runtime errors');
    assert.deepEqual(state.unexpected, [], 'All API calls must be mocked');
  } finally {
    if (state.release) state.release();
    await context.close();
  }
}

async function main() {
  const { js, css } = await assets();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const asset = {
      '/': ['text/html; charset=utf-8', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'],
      '/bundle.js': ['text/javascript; charset=utf-8', js], '/styles.css': ['text/css; charset=utf-8', css],
    }[pathname];
    response.writeHead(asset ? 200 : 404, { 'Content-Type': asset ? asset[0] : 'text/plain' });
    response.end(asset ? asset[1] : 'Not found');
  });
  let browser; let failures = 0; let checks = 0;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      for (const [name, run] of cases) {
        if (process.env.CASE && !name.includes(process.env.CASE)) continue;
        checks++;
        try { await fixture(browser, `http://127.0.0.1:${server.address().port}`, viewport, run); console.log(`PASS ${label}: ${name}`); }
        catch (error) { failures++; console.error(`FAIL ${label}: ${name}\n${error.stack || error}`); }
      }
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  console.log(`${checks - failures}/${checks} jangada form browser checks passed.`);
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
