/* Isolated browser verification: real React/Leaflet, mocked fleet/history, no external requests. */
const { build } = require("esbuild");
const { chromium } = require("playwright");
const http = require("node:http");
const assert = require("node:assert/strict");

async function main() {
  const result = await build({
    stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import Client from "./src/modules/globalfishazores/GlobalFishAzoresClient"; createRoot(document.getElementById("root")).render(<Client/>);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outdir: "map-browser-check", jsx: "automatic", loader: { ".png": "dataurl" },
    plugins: [{ name: "dynamic-client-harness", setup(builder) {
      builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: "dynamic", namespace: "harness" }));
      builder.onLoad({ filter: /.*/, namespace: "harness" }, () => ({ contents: 'import React from "react"; export default function dynamic(loader, options) { const C = React.lazy(loader); return props => React.createElement(React.Suspense, {fallback: React.createElement(options.loading)}, React.createElement(C, props)); }', resolveDir: process.cwd() }));
    } }],
  });
  const js = result.outputFiles.find((file) => file.path.endsWith(".js")).text;
  const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text;
  const server = http.createServer((req, res) => {
    if (req.url === "/app.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/app.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0}*{box-sizing:border-box}main{padding:16px}select,input{display:block;width:100%;min-width:0}section{margin:16px 0}header{padding:16px}button{padding:12px}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let mode = "points";
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (!url.startsWith(base)) return route.abort();
        if (url.includes("/api/navios")) return route.fulfill({ json: [{ id: 7, nome: "Test fleet vessel", mmsi: "204201560", imo: "9207223" }] });
        if (url.includes("/api/globalfishazores/history")) {
          if (mode === "error") return route.fulfill({ status: 502, json: { error: "Provider unavailable" } });
          return route.fulfill({ json: { vesselId: 7, mmsi: "204201560", imo: "9207223", source: "Mocked OpenWaters", from: "2026-10-22T12:00:00Z", to: "2026-10-24T12:00:00Z", discarded: 0,
            points: mode === "empty" ? [] : [{ lat: 38, lng: -25, time: "2026-10-24T10:00:00Z" }, { lat: 38.1, lng: -25.1, time: "2026-10-24T11:00:00Z" }] } });
        }
        return route.continue();
      });
      await page.goto(base);
      await page.locator("select").selectOption("7");
      await page.getByRole("button", { name: "Consultar historico de 48h" }).click();
      await page.getByText("2 posicoes validas", { exact: false }).waitFor();
      await page.locator(".leaflet-overlay-pane svg path").first().waitFor();
      assert.equal(await page.locator(".leaflet-interactive").count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const map = await page.locator(".leaflet-container").boundingBox();
      assert.ok(map.width <= width && map.height >= 320);
      mode = "empty";
      await page.getByRole("button", { name: "Consultar historico de 48h" }).click();
      await page.getByText("Sem dados validos nas ultimas 48h.", { exact: false }).waitFor();
      assert.equal(await page.locator(".leaflet-interactive").count(), 0);
      mode = "error";
      await page.getByRole("button", { name: "Consultar historico de 48h" }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /Provider unavailable/);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: real Leaflet markers/track, empty/error states, no overflow or browser errors`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
