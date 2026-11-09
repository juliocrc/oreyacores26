import * as React from 'react';
import ClienteJangadasPanel from './ClienteJangadasPanel';

jest.mock('react', () => ({ ...jest.requireActual('react'), useState: jest.fn(), useEffect: jest.fn(), useMemo: jest.fn() }));

const raft = { id: 163, serial: 'RAFT', brand: 'Brand', model: 'Model', capacity: 6,
  navioId: 20, navioNome: 'SHIP', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01',
  status: { label: 'Valida', color: 'green' as const, daysLeft: 100 }, diasParaProxima: 100,
  ultimoCertificadoNumero: 'AZ26-101', certificadoPdfUrl: '/certificate',
  quadroInspecaoId: 2953, quadroInspecaoData: '2026-10-01',
  quadroPdfUrl: '/api/portal/documentos?jangadaId=163&inspecaoId=2953&document=quadro&format=pdf' };
let states: unknown[];
let slot: number;

function render(input = raft) {
  slot = 0;
  const tree = ClienteJangadasPanel({ navios: [], jangadas: [input], previewClienteId: '743' });
  const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  return elements(tree);
}

beforeEach(() => {
  states = [null, null, null, null];
  jest.mocked(React.useState).mockImplementation((() => {
    const index = slot++;
    return [states[index], (value: unknown) => { states[index] = value; }];
  }) as typeof React.useState);
  jest.mocked(React.useMemo).mockImplementation(factory => factory());
});
afterEach(() => jest.restoreAllMocks());

it('does not offer a stale SOS quadro URL from historical data', () => {
  const elements = render({ ...raft, model: 'SOS' });
  expect(elements.some(element => element.props.href?.startsWith('/api/portal/documentos'))).toBe(false);
  expect(elements.some(element => element.type === 'p' && String(element.props.children).includes('apenas certificado'))).toBe(true);
});

it('intercepts the exact preview link and displays actionable server metadata without a JSON tab or fallback', async () => {
  const message = 'Nao e possivel gerar. Metadados em falta: checklistSnapshot.cylinderSerial. Solicite a estacao a recuperacao do arquivo.';
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: message, missingMetadata: ['checklistSnapshot.cylinderSerial'] }), { status: 409 }));
  const link = render().find(element => element.props.href?.startsWith('/api/portal/documentos'))!;
  const preventDefault = jest.fn();
  link.props.onClick({ preventDefault });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(preventDefault).toHaveBeenCalled();
  expect(link.props.target).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(`${raft.quadroPdfUrl}&previewClienteId=743`, { cache: 'no-store' });
  expect(render().find(element => element.props.role === 'alert')?.props.children).toBe(message);
  expect(render().some(element => element.type === 'iframe')).toBe(false);
});

it('labels the embedded saved PDF with the returned exact inspection ID and date, not a certificate date fallback', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('PDF', { headers: { 'X-Inspection-Id': '2953', 'X-Inspection-Date': '2026-09-02', 'Content-Type': 'application/pdf' } }));
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:saved-inspection');
  render().find(element => element.props.href?.startsWith('/api/portal/documentos'))!.props.onClick({ preventDefault: jest.fn() });
  await new Promise(resolve => setTimeout(resolve, 0));
  const iframe = render().find(element => element.type === 'iframe');
  expect(iframe?.props.src).toBe('blob:saved-inspection');
  expect(iframe?.props.title).toContain('#2953');
  expect(iframe?.props.title).toContain('02/09/2026');
});
