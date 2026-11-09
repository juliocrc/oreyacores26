import React from 'react';
import Step4 from './Step4_PackMascara';
import Step3 from './Step3_Componentes';
import { ReplacementStockPicker, ReplacementStockSelect } from '@/components/shared/ReplacementStockPicker';
import { getMandatoryPackItemsForRaft } from '../rafts/mandatoryPack';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

jest.mock('./store/useJangadaWizardStore', () => ({ useJangadaWizardStore: jest.fn() }));
jest.mock('../rafts/mandatoryPack', () => ({
  getMandatoryPackItemsForRaft: jest.fn(() => [{ checklistName: 'validade_agua', label: 'Agua', quantity: 2, quantityLabel: '2', validityFieldName: 'agua', stockReferences: ['WATER'] }]),
  findMatchingArticleForPackItem: (_item: unknown, articles: unknown[]) => articles[0],
  VALIDITY_REQUIRED_PACK_NAMES: new Set(['validade_agua']),
}));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

const stock = { id: 42, referencia: 'WATER', descricao: 'Agua', lote: 'NEW', quantidade: 10, validade: null };
const setInspectionData = jest.fn();
let data: any;

beforeEach(() => {
  data = {
    brand: '', model: '', packType: '', capacity: 2, dataInspecao: '2026-01-01', dataProxInspecao: '2027-01-01',
    globalStock: [stock], artigos: [],
    packItems: { validade_agua: { referencia: 'WATER', quantidade: 0, validade: '01/2025', validadeOriginal: '01/2025', lote: 'OLD' } },
  };
  setInspectionData.mockClear();
  (useJangadaWizardStore as unknown as jest.Mock).mockImplementation(() => ({ inspectionData: data, setInspectionData }));
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('opening Substituir Agora and cancelling do not mutate quantity or replacement fields', () => {
  const setDialog = jest.fn();
  jest.spyOn(React, 'useState').mockReturnValue([null, setDialog]);
  const tree = elements(Step4());
  tree.find(el => el.type === 'button' && el.props.children === 'Substituir Agora')!.props.onClick();
  expect(setDialog).toHaveBeenCalledWith('validade_agua');
  expect(setInspectionData).not.toHaveBeenCalled();
  jest.mocked(React.useState).mockReturnValue(['validade_agua', setDialog]);
  elements(Step4()).find(el => el.type === ReplacementStockPicker)!.props.onClose();
  expect(setInspectionData).not.toHaveBeenCalled();
  expect(data.packItems.validade_agua.quantidade).toBe(0);
});

it('confirmation applies the exact row identity, quantity and lot, without old validity fallback', () => {
  jest.spyOn(React, 'useState').mockReturnValue(['validade_agua', jest.fn()]);
  elements(Step4()).find(el => el.type === ReplacementStockPicker)!.props.onSelect(stock);
  expect(setInspectionData).toHaveBeenCalledWith({ packItems: { validade_agua: expect.objectContaining({ stockId: 42, referencia: 'WATER', lote: 'NEW', quantidade: 2, validade: '' }) } });
});

it('automatically copies the selected batch expiry even when the raft already had another date', () => {
  jest.spyOn(React, 'useState').mockReturnValue(['validade_agua', jest.fn()]);
  const picker = elements(Step4()).find(el => el.type === ReplacementStockPicker)!;
  expect(picker.props.showValidade).toBe(true);
  picker.props.onSelect({ ...stock, validade: '2030-08-01' });
  expect(setInspectionData).toHaveBeenCalledWith({ packItems: { validade_agua: expect.objectContaining({ validade: '08/2030', lote: 'NEW' }) } });
});

it('uses pack metadata, not a populated stock date, to hide and clear non-dated lot/expiry fields', () => {
  (getMandatoryPackItemsForRaft as jest.Mock).mockReturnValueOnce([{ checklistName: 'validade_agua', label: 'Fole', quantity: 1, quantityLabel: '1', stockReferences: ['WATER'] }]);
  jest.spyOn(React, 'useState').mockReturnValue(['validade_agua', jest.fn()]);
  const tree = elements(Step4());
  const picker = tree.find(el => el.type === ReplacementStockPicker)!;
  expect(picker.props.showValidade).toBe(false);
  expect(tree.some(el => el.type === 'input' && el.props.placeholder === 'MM/AAAA')).toBe(false);
  expect(tree.some(el => el.type === 'label' && el.props.children === 'Lote Manual')).toBe(false);
  picker.props.onSelect({ ...stock, validade: '2030-08-01' });
  expect(setInspectionData).toHaveBeenCalledWith({ packItems: { validade_agua: expect.objectContaining({ validade: '', lote: '', stockId: 42 }) } });
});

it.each([false, true])('component selection respects explicit expiry control=%s and never inherits the prior date', expiryControlled => {
  data.componentes = [{ id: 'comp', type: 'Valvula', reference: '', serialLote: 'OLD', validade: '01/2025', expiryControlled }];
  data.globalStock = [{ ...stock, descricao: 'Valvula', validade: '2030-08-01' }];
  const tree = elements(Step3());
  const picker = tree.find(el => el.type === ReplacementStockSelect && el.props.placeholder === 'Selecionar peça do armazém...')!;
  expect(picker.props.showValidade).toBe(expiryControlled);
  picker.props.onSelect(data.globalStock[0]);
  expect(setInspectionData).toHaveBeenLastCalledWith({ componentes: [expect.objectContaining({ validade: expiryControlled ? '08/2030' : '', serialLote: expiryControlled ? 'NEW' : '', stockId: 42 })] });
  data.globalStock[0].validade = null;
  picker.props.onSelect(data.globalStock[0]);
  expect(setInspectionData).toHaveBeenLastCalledWith({ componentes: [expect.objectContaining({ validade: '' })] });
});

it('initialization uses the associated stockId, not the raft article id or an invented reference/lot', () => {
  data.packItems = {};
  data.artigos = [{ id: 999, stockId: 42, referencia: 'WATER', quantidade: 2 }];
  const effects: Array<() => void> = [];
  jest.mocked(React.useEffect).mockImplementation(effect => { effects.push(effect as () => void); });
  jest.spyOn(React, 'useState').mockReturnValue([null, jest.fn()]);
  Step4();
  effects.forEach(effect => effect());
  expect(setInspectionData).toHaveBeenCalledWith({ packItems: { validade_agua: expect.objectContaining({ stockId: 42, referencia: 'WATER', lote: '', validade: '' }) } });
});
