"use strict";

const test = globalThis.test || require("node:test").test;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { checkRuntimeDatabase } = require("./check-runtime-database.cjs");

function database(failure) {
  const calls = [];
  const read = name => async args => {
    calls.push({ name, args });
    if (name === failure) throw new Error("synthetic database failure");
    return null;
  };
  return { calls, prisma: {
    $queryRaw: read("connection"),
    cliente: { findFirst: read("cliente") },
    stock: { findFirst: read("stock") },
    declaracaoIsencaoIva: { findFirst: read("iva") },
    $disconnect: read("disconnect"),
  } };
}

test("startup gate only reads required fields and always disconnects", async () => {
  const { prisma, calls } = database();
  await checkRuntimeDatabase(prisma);
  assert.deepEqual(calls.map(call => call.name), ["connection", "cliente", "stock", "iva", "disconnect"]);
  assert.equal(calls[0].args[0], "SELECT 1");
  assert.equal(calls[3].args.select.pdfAssinadoMeta, true);
  assert.equal(calls[3].args.select.snapshotJson, true);
});

for (const failure of ["connection", "cliente", "stock", "iva"]) {
  test(`startup gate propagates ${failure} failures and never continues to later reads`, async () => {
    const { prisma, calls } = database(failure);
    await assert.rejects(checkRuntimeDatabase(prisma), /synthetic database failure/);
    assert.equal(calls.at(-1).name, "disconnect");
    assert.equal(calls.at(-2).name, failure);
  });
}

test("both container entrypoints stop on failed checks, without migrations or data-loss fallbacks", () => {
  for (const file of ["docker-entrypoint.sh", "docker-entrypoint-cloudrun.sh"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(source, /^set -e$/m);
    assert.match(source, /^node \/app\/scripts\/check-runtime-database\.cjs$/m);
    assert.doesNotMatch(source, /--accept-data-loss|npx prisma|^\s*psql\s/m);
    assert(source.indexOf("check-runtime-database.cjs") < source.indexOf("exec node server.js"));
  }
  for (const file of ["Dockerfile", "Dockerfile.cloudrun"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /COPY[^\n]+\/app\/scripts\/check-runtime-database\.cjs/);
  }
});
