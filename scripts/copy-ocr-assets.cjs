#!/usr/bin/env node
/**
 * Copia os ficheiros do Tesseract.js para `public/ocr` para que o OCR funcione
 * sem depender de CDNs (importante nas estacoes com ligacao instavel).
 *
 * Executado automaticamente no `postinstall`.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "ocr");
const langDir = path.join(outDir, "lang");

const files = [
  ["node_modules/tesseract.js/dist/tesseract.min.js", "tesseract.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  // Versao sem SIMD: mais lenta, mas compativel com WebViews antigos.
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", "lang/por.traineddata.gz"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];

function findFile(relativePath) {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute) ? absolute : null;
}

function copy() {
  fs.mkdirSync(langDir, { recursive: true });
  let copied = 0;
  let missing = 0;

  for (const [from, to] of files) {
    const source = findFile(from);
    if (!source) {
      missing += 1;
      continue;
    }
    const target = path.join(outDir, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copied += 1;
  }

  if (copied > 0) {
    console.log(`[ocr] ${copied} ficheiro(s) copiado(s) para public/ocr`);
  }
  if (missing > 0) {
    console.warn(
      `[ocr] ${missing} ficheiro(s) em falta. Execute "npm install" para restaurar as dependencias do OCR.`,
    );
  }
}

copy();
