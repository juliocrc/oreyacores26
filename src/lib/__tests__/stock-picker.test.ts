import { filterStockItems, formatStockOptionLabel, getAvailableStock, getReplacementStockItems, getStockSelectionError, sortStockCandidates, isStrapStockItem } from '../stock-picker';

const rows = [
  { id: 1, referencia: 'WATER', descricao: 'Agua', lote: 'A', codigoBarras: '123456', quantidade: 9, quantidadeReservada: 2, validade: '2028-05-01' },
  { id: 2, referencia: 'WATER', descricao: 'Agua', lote: 'B', quantidade: 4, validade: null },
  { id: 3, referencia: 'OTHER', descricao: 'Outro artigo', lote: 'A', quantidade: 3 },
  { id: 4, referencia: 'WATER', descricao: 'Agua', lote: 'C', quantidade: 2, quantidadeReservada: 2 },
];

it('sorts adequate dated rows FEFO before inadequate, missing and insufficient rows without mutating input', () => {
  const candidates = [
    { id: 10, validade: '2032-01-01', quantidade: 10 },
    { id: 11, validade: '2031-07-01', quantidade: 6, quantidadeReservada: 1 },
    { id: 12, validade: '2031-01-30', quantidade: 10 },
    { id: 13, validade: '2031-08-01', quantidade: 6, quantidadeReservada: 2 },
    { id: 14, validade: null, quantidade: 10 },
  ];
  const options = { showValidade: true, requiredQuantity: 5, nextInspection: '2031-01-31' };
  expect(sortStockCandidates(candidates, options).map(item => item.id)).toEqual([11, 10, 12, 13, 14]);
  expect(candidates.map(item => item.id)).toEqual([10, 11, 12, 13, 14]);
  expect(getStockSelectionError(candidates[1], options)).toBeNull();
  expect(getStockSelectionError(candidates[2], options)).toContain('ate a proxima inspecao');
  expect(getStockSelectionError(candidates[3], options)).toContain('disponivel 4, necessita 5');
  expect(sortStockCandidates(candidates, { showValidade: false })).toBe(candidates);
});

it.each(['2027-03-03', '03/03/2027', '2027-03', '03/2027'])('accepts historical stock validity %s regardless of the current clock', validade => {
  jest.useFakeTimers();
  try {
    for (const now of ['2026-10-25T12:00:00Z', '2032-01-01T12:00:00Z']) {
      jest.setSystemTime(new Date(now));
      const options = { showValidade: true, nextInspection: '2027-03-03' };
      expect(getStockSelectionError({ id: 1, quantidade: 5, validade }, options)).toBeNull();
      expect(getStockSelectionError({ id: 1, quantidade: 5, validade: '02/03/2027' }, options)).toContain('Validade insuficiente');
    }
  } finally {
    jest.useRealTimers();
  }
});

it('uses reserved quantity and never silently permits an excessive request', () => {
  expect(getStockSelectionError(rows[0], { requiredQuantity: 8 })).toContain('disponivel 7, necessita 8');
  expect(getStockSelectionError(rows[0], { requiredQuantity: 7 })).toBeNull();
  expect(getStockSelectionError(rows[0], { requiredQuantity: NaN })).toContain('quantidade valida');
});

it('labels location and net availability without leaking lot for non-dated stock', () => {
  const label = formatStockOptionLabel({ ...rows[0], localizacao: 'A-02' });
  expect(label).toContain('WATER');
  expect(label).toContain('Localizacao: A-02');
  expect(label).toContain('Qtd: 7');
  expect(label).not.toMatch(/Lote|Val/);
});

it.each([
  { id: 10, descricao: 'Cinta de fecho MK20' },
  { id: 11, descricao: 'Container closure STRAPS' },
  { id: 12, categoria: 'CINTAS_FECHO', referencia: 'D508' },
  { id: 13, referencia: 'STRAP-20' },
  { id: 14, descricao: 'Correia de fecho' },
  { id: 15, categoria: 'Cintagem' },
])('recognizes strap stock without container model recommendations: %j', (item) => {
  expect(isStrapStockItem(item)).toBe(true);
});

it.each([
  { id: 20, descricao: 'Saco de vácuo', categoria: 'CINTAS_FECHO' },
  { id: 21, descricao: 'Vacuum bag with strap' },
  { id: 22, descricao: 'Autocolante', categoria: 'ACESSORIOS' },
  { id: 23, descricao: 'Selo de fecho', categoria: 'CONTENTOR' },
  { id: 24, descricao: 'Fita adesiva' },
  { id: 25, descricao: 'Strapless cover' },
  { id: 26, descricao: null, referencia: null, categoria: null },
])('excludes vacuum bags and unrelated closure stock: %j', (item) => {
  expect(isStrapStockItem(item)).toBe(false);
});

it('keeps concrete strap rows and their price when searching duplicate references', () => {
  const straps = [
    { id: 30, referencia: 'D508', descricao: 'Cinta de fecho', lote: 'A', precoVenda: 12, quantidade: 4 },
    { id: 31, referencia: 'D508', descricao: 'Cinta de fecho', lote: 'B', precoVenda: 15, quantidade: 8 },
    { id: 32, referencia: 'BAG', descricao: 'Vacuum bag', precoVenda: 5, quantidade: 2 },
  ];
  const eligible = straps.filter(isStrapStockItem);
  expect(filterStockItems(eligible, 'D508')).toEqual(straps.slice(0, 2));
  const [selected] = filterStockItems(eligible, 'D508 B');
  expect(selected).toBe(straps[1]);
  expect(selected).toMatchObject({ id: 31, precoVenda: 15, quantidade: 8 });
});

it('keeps all available batches under the original reference for generic reference scans', () => {
  expect(getReplacementStockItems(rows, 'WATER')).toEqual([rows[0], rows[1]]);
  expect(getReplacementStockItems(rows, '123456')).toEqual([rows[0]]);
  expect(getReplacementStockItems(rows, 'WATER B')).toEqual([rows[1]]);
  expect(rows[0].referencia).toBe(rows[1].referencia);
});

it('gives an exact row barcode precedence over a matching generic reference', () => {
  const referenceCollision = { id: 5, referencia: '123456', lote: 'OTHER', quantidade: 5 };
  expect(getReplacementStockItems([...rows, referenceCollision], '123456')).toEqual([rows[0]]);
});

it('keeps duplicate/shared barcode matches separate without including unrelated batches', () => {
  const shared = [rows[0], { ...rows[1], codigoBarras: '123456' }, rows[3]];
  expect(getReplacementStockItems(shared, '123456')).toEqual(shared.slice(0, 2));
});

it('does not substitute another batch when the exact barcode has no available stock', () => {
  expect(getReplacementStockItems([{ ...rows[0], quantidade: 0 }, rows[1]], '123456')).toEqual([]);
  const exhausted = { ...rows[0], quantidade: 0 };
  const collision = { ...rows[1], referencia: '123456' };
  expect(filterStockItems([exhausted, collision], '123456')).toEqual([exhausted]);
});

it('blocks expired stock even without a supplied horizon and ignores expiry for non-dated articles', () => {
  const expired = { id: 90, quantidade: 10, validade: '2000-01-01' };
  expect(getStockSelectionError(expired, { showValidade: true })).toContain('expirado');
  expect(getStockSelectionError(expired, { showValidade: false })).toBeNull();
});

it('only labels lot/expiry for expiry-controlled articles, including missing expiry', () => {
  expect(formatStockOptionLabel(rows[0])).not.toMatch(/Lote|Val/);
  expect(formatStockOptionLabel(rows[0], { showValidade: false })).not.toMatch(/Lote|Val/);
  expect(formatStockOptionLabel(rows[1], { showValidade: true })).toContain('(Validade: N/D)');
  expect(formatStockOptionLabel(rows[1], { showValidade: true })).toContain('(Lote: B)');
});

it('searches barcode and batch together and labels batch/available quantity', () => {
  expect(filterStockItems(rows, '123456 A')).toEqual([rows[0]]);
  expect(formatStockOptionLabel(rows[0], { showValidade: true })).toContain('(Lote: A)');
  expect(formatStockOptionLabel(rows[0])).toContain('(Qtd: 7)');
});

it('excludes exhausted/reserved stock, clamps negative availability, and leaves unknown validity untouched', () => {
  expect(getAvailableStock({ id: 5, quantidade: 1, quantidadeReservada: 3 })).toBe(0);
  expect(getReplacementStockItems([rows[3]])).toEqual([]);
  expect(getReplacementStockItems(rows, 'unknown')).toEqual([]);
  expect(getReplacementStockItems(rows, 'WATER')[1]).toBe(rows[1]);
  expect(rows[1].validade).toBeNull();
});
