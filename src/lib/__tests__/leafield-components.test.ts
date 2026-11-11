import { validateLeafieldComponents } from '../leafield-components';

it('accepts independently identified components and explicit firing history', () => {
  const result = validateLeafieldComponents({ cabeca: { referencia: 'GIST', dataFabrico: '2020-02-29', disparos: [{ data: '2024-04-15', observacoes: 'Ensaio' }] } });
  expect(result.error).toBeNull();
  expect(result.data?.cabeca?.disparos).toEqual([{ data: '2024-04-15', observacoes: 'Ensaio' }]);
});
it('rejects invalid dates and does not assume missing firing history', () => {
  expect(validateLeafieldComponents({ valvula: { dataInstalacao: '2024-02-30' } }).error).toBeTruthy();
  expect(validateLeafieldComponents({ valvula: {} }).data?.valvula?.disparos).toEqual([]);
});
it('rejects untrusted external photo URLs and unknown fields', () => {
  expect(validateLeafieldComponents({ cabeca: { foto: 'https://example.com/image.jpg' } }).error).toBeTruthy();
  expect(validateLeafieldComponents({ cabeca: { vencimentoAutomatico: '2025' } }).error).toBeTruthy();
});
