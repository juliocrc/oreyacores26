/* Isolated shelves UI regression, no API or database: node scripts/check-stock-shelves-ui.cjs [screenshot-directory] */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { compile } = require('@tailwindcss/node');
const { Scanner } = require('@tailwindcss/oxide');

async function main() {
  const root = path.resolve(__dirname, '..');
  const screenshotDirectory = process.argv[2];
  if (screenshotDirectory) assert((await fs.stat(screenshotDirectory)).isDirectory());
  const bundle = await esbuild.build({
    absWorkingDir: root,
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import WarehouseMapDialog from './src/components/stock/WarehouseMapDialog';
        const items = [
          { id: 1, nome: 'Cabo de seguranca', descricao: 'Cabo para equipamento', referencia: 'REF-2', lote: 'BATCH-10', localizacao: 'A2', quantidade: 10, quantidadeReservada: 3, unit: 'm' },
          { id: 2, nome: 'Luz de emergencia', referencia: 'LIGHT', lote: 'L2', localizacao: 'A2', quantidade: 4, quantidadeReservada: 1, unit: 'un' },
          { id: 3, nome: 'Cabo de seguranca', referencia: 'REF-2', lote: 'BATCH-2', localizacao: 'A2', quantidade: 2, quantidadeReservada: 0, unit: 'm' },
          { id: 4, nome: 'Valvula', referencia: 'VALVE', localizacao: 'A10', quantidade: 2, quantidadeReservada: 5, unit: 'un' },
          { id: 5, nome: 'Artigo por localizar', quantidade: -2, quantidadeReservada: 1 },
          { id: 6, nome: 'Ferramenta', referencia: 'TOOL', localizacao: 'Oficina', quantidade: 3, unit: 'un' },
        ];
        window.selectedLocations = [];
        createRoot(document.getElementById('root')).render(<WarehouseMapDialog isOpen onClose={() => {}} items={items}
          mode={location.search ? 'select' : 'view'} onSelectLocation={loc => window.selectedLocations.push(loc)} />);`,
      resolveDir: root, sourcefile: 'shelves-ui-harness.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: { '@': path.join(root, 'src') },
    plugins: [{ name: 'isolated-link', setup(build) {
      build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next/link', namespace: 'test-link' }));
      build.onLoad({ filter: /.*/, namespace: 'test-link' }, () => ({ contents: `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`, loader: 'js', resolveDir: root }));
    } }],
  });
  const cssPath = path.join(root, 'src/app/globals.css');
  const compiler = await compile(await fs.readFile(cssPath, 'utf8'), { base: path.dirname(cssPath), onDependency() {} });
  const source = await Promise.all(['StockShelvesMap.tsx', 'WarehouseMapDialog.tsx'].map(file => fs.readFile(path.join(root, 'src/components/stock', file), 'utf8')));
  const candidates = new Scanner({ sources: [] }).scanFiles(source.map(content => ({ content, extension: 'tsx' })));
  const css = compiler.build(candidates);
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/bundle.js"></script></body></html>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      const apiRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', req => { if (req.url().includes('/api/')) apiRequests.push(req.url()); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await page.goto(origin);
      const nav = page.getByRole('navigation', { name: 'Localizações do stock' });
      const labels = await nav.getByRole('button').allTextContents();
      assert(labels.findIndex(text => text.startsWith('A2')) < labels.findIndex(text => text.startsWith('A10')));
      await expect(nav.getByRole('button', { name: /^A2 / })).toContainText('2 produtos · 3 registos');
      await expect(nav.getByRole('button', { name: /^A2 / })).toContainText('9 m · 3 un');
      await expect(page.getByRole('region', { name: 'A10', exact: true })).toContainText('Disponível: 0 un');
      await expect(page.getByRole('region', { name: 'Sem localização', exact: true })).toContainText('Quantidade: -2');
      const search = page.getByRole('textbox', { name: 'Pesquisar stock nas prateleiras' });
      for (const query of ['BATCH-10', 'REF-2', 'equipamento', 'Oficina']) {
        await search.fill(query);
        await expect(page.getByRole('region')).toHaveCount(1);
      }
      await search.fill('inexistente');
      await expect(page.getByText('Sem resultados para esta pesquisa.')).toBeVisible();
      await search.fill('');
      await nav.getByRole('button', { name: /^A10 / }).click();
      await expect(page.getByRole('region')).toHaveCount(1);
      await expect(page.getByRole('link', { name: /Valvula/ })).toHaveAttribute('href', '/stock/4');
      await nav.getByRole('button', { name: 'Todas as localizações' }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.getByRole('region').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)));
      if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `stock-shelves-${viewport.width}.png`), fullPage: true });
      await page.goto(`${origin}/?select`);
      await page.getByRole('combobox', { name: 'Escolher localização' }).selectOption('Oficina');
      assert.deepEqual(await page.evaluate(() => window.selectedLocations), []);
      await page.getByRole('button', { name: 'Confirmar localização' }).click();
      assert.deepEqual(await page.evaluate(() => window.selectedLocations), ['Oficina']);
      assert.deepEqual(apiRequests, []);
      assert.deepEqual(errors, []);
      console.log(`PASS shelves ${viewport.width}x${viewport.height}: sorting, search, availability, navigation, explicit selection, no overflow or API requests`);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
