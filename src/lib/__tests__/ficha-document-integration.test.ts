import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { jangadaSaveChanges } from '../jangada-form';
import { getValidityCoverageStatus } from '../stock-validity';
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '../raft-document-rules';

// Execute the actual local handlers without mounting the unrelated ficha panels.
const file = ts.createSourceFile('JangadaDetailPageClient.tsx', readFileSync(join(process.cwd(),
  'src/app/jangadas/[id]/JangadaDetailPageClient.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, ts.ArrowFunction | ts.FunctionDeclaration>();
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && node.body) functions.set(node.name.text, node);
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrowFunction(node.initializer)) {
    functions.set(node.name.text, node.initializer);
  }
  ts.forEachChild(node, collect);
}
collect(file);

it.each([true, false])('send recipient uses refreshed ship contacts when available = %s', refreshed => {
  let initializer: ts.Expression | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'linkedShip') initializer = node.initializer;
    ts.forEachChild(node, find);
  }
  find(file);
  expect(initializer).toBeDefined();
  const freshShip = { id: 20, cliente: { id: 7, email: 'fresh@example.test', telmovel: '912345678' } };
  const initialShip = { id: 20, cliente: { id: 7, email: 'initial@example.test' } };
  const context = createContext({ data: { shipId: 20, shipDetails: refreshed ? freshShip : null }, ships: [initialShip] });
  const resolved = runInContext(ts.transpileModule(`(${initializer!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  expect(resolved).toBe(refreshed ? freshShip : initialShip);
  expect(resolved.cliente.email).toBe(refreshed ? 'fresh@example.test' : 'initial@example.test');
});

const handlers = [
  ['handleExportCertificadoExcel', '/api/certificados/orey?format=xlsx'],
  ['handleExportQuadroExcel', '/api/exportar-raft'],
  ['handleExportQuadroPDF', '/api/exportar-raft-pdf'],
  ['handleGerarQuadroPdf', '/api/exportar-raft-pdf'],
  ['handleGerarCertificadoCarimbado', '/api/jangadas/10/certificado-carimbado'],
] as const;

describe.each([true, false])('ficha document selectors with saved inspection = %s', saved => {
  it.each(handlers)('%s requires a saved inspection for certificates and sends its explicit selection', async (handler, url) => {
    // Stop after the HTTP request: downloads and popup navigation are not under test.
    const fetch = jest.fn().mockRejectedValue(new Error('stop after request'));
    const context = createContext({
      jangadaId: '10', lastInspecao: saved ? { id: 101 } : null,
      isSosDocumentRaft, SOS_DOCUMENT_NOTICE,
      data: { serial: 'RAFT-LOCAL', ultimoCertificadoNumero: 'LOCAL', cylinderSerial: 'LOCAL-CYL' },
      linkedShip: null, artigos: [], aGerarDoc: null, fetch,
      requireSavedChanges: () => true,
      inspectionResponsibleName: () => 'Saved technician',
      buildChecklistPayload: () => ({ local: true }),
      buildWpDerivedValues: () => ({ upper: {}, lower: {} }),
      setAGerarDoc: jest.fn(), ensureFolderPermissionNow: async () => 'granted',
      window: { open: () => ({ close: jest.fn() }) },
      appToast: { error: jest.fn(), warning: jest.fn() }, alert: jest.fn(),
    });
    for (const name of ['savedDocumentSelector', 'buildQuadroPayload', handler]) {
      const node = functions.get(name);
      expect(node).toBeDefined();
      const javascript = ts.transpileModule(`(${node!.getText(file)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
      }).outputText;
      context[name] = runInContext(javascript, context);
    }
    await context[handler]();
    if (!saved && (handler === 'handleExportCertificadoExcel' || handler === 'handleGerarCertificadoCarimbado')) {
      expect(fetch).not.toHaveBeenCalled();
      expect(context.appToast.warning).toHaveBeenCalledWith(expect.stringContaining('Guarde a inspeção'));
      return;
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const [requestedUrl, init] = fetch.mock.calls[0];
    expect(requestedUrl).toBe(url);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    if (saved) {
      expect(body).toMatchObject({ jangadaId: 10, inspecaoId: 101 });
    } else {
      expect(body).not.toHaveProperty('jangadaId');
      expect(body).not.toHaveProperty('inspecaoId');
    }
    if (handler !== 'handleGerarCertificadoCarimbado') {
      expect(body).toMatchObject({ raftSerial: 'RAFT-LOCAL', certNumber: 'LOCAL', cylinderSerial: 'LOCAL-CYL', checklist: { local: true } });
    } else if (!saved) {
      expect(body).toEqual({});
    }
  });
});

it.each(['handleExportQuadroExcel', 'handleExportQuadroPDF', 'handleGerarQuadroPdf'])('%s blocks SOS before requesting or saving a document', async handler => {
  const fetch = jest.fn();
  const info = jest.fn();
  const context = createContext({ data: { model: 'SOS' }, isSosDocumentRaft, SOS_DOCUMENT_NOTICE,
    requireSavedChanges: () => true, fetch, appToast: { info } });
  context[handler] = runInContext(ts.transpileModule(`(${functions.get(handler)!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  await context[handler]();
  expect(fetch).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith(SOS_DOCUMENT_NOTICE);
});

it.each([...handlers.map(([handler]) => handler), 'handleStartOrContinueInspection', 'openLastInspection'])('%s refuses emission or wizard entry while dirty without changing the form', async (handler) => {
  const editForm = { serial: 'LOCAL-EDIT', inspectionChecklistValues: { validade_bateria: '2030-01' } };
  const fetch = jest.fn();
  const warning = jest.fn();
  const context = createContext({ hasUnsavedChanges: true, saveInFlight: { current: false },
    appToast: { warning }, fetch, editForm });
  for (const name of ['requireSavedChanges', handler]) {
    const node = functions.get(name)!;
    context[name] = runInContext(ts.transpileModule(`(${node.getText(file)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
  }
  await context[handler]();
  expect(fetch).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledTimes(1);
  expect(context.editForm).toBe(editForm);
  expect(editForm.serial).toBe('LOCAL-EDIT');
});

it.each([false, true])('cancel discards only after confirmation = %s', confirmed => {
  let cancel: ts.ArrowFunction | undefined;
  function find(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'onClick' && node.initializer &&
      ts.isJsxExpression(node.initializer) && node.initializer.expression &&
      ts.isArrowFunction(node.initializer.expression) && node.getText(file).includes('Descartar as alterações não guardadas da ficha?')) cancel = node.initializer.expression;
    ts.forEachChild(node, find);
  }
  find(file);
  expect(cancel).toBeDefined();
  const setEditForm = jest.fn();
  const setIsEditing = jest.fn();
  const context = createContext({ hasUnsavedChanges: true, window: { confirm: () => confirmed },
    isEditingRef: { current: true }, editBaseline: { current: {} }, data: { serial: 'SAVED' }, setEditForm, setIsEditing });
  runInContext(ts.transpileModule(`(${cancel!.getText(file)})()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  if (confirmed) {
    expect(setEditForm).toHaveBeenCalledWith({ serial: 'SAVED' });
    expect(setIsEditing).toHaveBeenCalledWith(false);
  } else {
    expect(setEditForm).not.toHaveBeenCalled();
    expect(setIsEditing).not.toHaveBeenCalled();
    expect(context.isEditingRef.current).toBe(true);
  }
});

it.each([409, 500])('failed save (%s) retains the original version, baseline and all local edits', async (status) => {
  const baseline = { serial: 'SAVED', ownerDisplay: 'Owner', updatedAt: '2026-10-01T00:00:00.000Z' };
  const editForm = { ...baseline, serial: 'LOCAL', ownerDisplay: 'Display metadata' };
  const setEditForm = jest.fn();
  const fetch = jest.fn(async () => ({ ok: false, status, json: async () => ({ code: status === 409 ? 'EDIT_CONFLICT' : undefined, error: 'Failed' }) }));
  const context = createContext({ editForm, editBaseline: { current: baseline }, jangadaSaveChanges,
    saveConflict: false, setSaveConflict: jest.fn(),
    saveInFlight: { current: false }, dataRequestVersion: { current: 0 }, jangadaId: 10,
    buildWpDerivedValues: () => ({}), setSaving: jest.fn(), setSaveError: jest.fn(),
    setEditForm, fetch, appToast: { error: jest.fn() } });
  context.handleSave = runInContext(ts.transpileModule(`(${functions.get('handleSave')!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  await context.handleSave();
  expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({ serial: 'LOCAL', expectedUpdatedAt: baseline.updatedAt });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(setEditForm).not.toHaveBeenCalled();
  expect(context.editBaseline.current).toBe(baseline);
  expect(jangadaSaveChanges(editForm, baseline)).toEqual({ serial: 'LOCAL' });
  expect(context.saveInFlight.current).toBe(false);
});

it.each([
  ['2027-06', '2027-06-30', 'Cobre a próxima inspeção'],
  ['2027-06', '2027-07-01', 'Substituir antes da próxima inspeção'],
  ['', '2027-07-01', 'Cobertura por confirmar'],
  ['2028-01', '', 'Cobertura por confirmar'],
])('equipment badge checks expiry %s through %s', (expiry, reference, label) => {
  const context = createContext({ getValidityCoverageStatus });
  const badge = runInContext(ts.transpileModule(`(${functions.get('espelhoValidadeBadge')!.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  expect(badge(expiry, reference).label).toBe(label);
});
