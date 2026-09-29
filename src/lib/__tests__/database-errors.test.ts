import { extractErrorMessage } from '../database-errors';

describe('extractErrorMessage', () => {
  const fallback = 'Erro inesperado.';

  test('surfaces clean business error messages', () => {
    expect(extractErrorMessage(new Error('Stock insuficiente para REF-X.'), fallback)).toBe(
      'Stock insuficiente para REF-X.'
    );
    expect(extractErrorMessage(new Error('O número de certificado ABC-1 já foi utilizado na respetiva jangada.'), fallback)).toBe(
      'O número de certificado ABC-1 já foi utilizado na respetiva jangada.'
    );
  });

  test('falls back for internal/prisma/stack-like messages', () => {
    expect(extractErrorMessage(new Error('Invalid prisma.inspecao.create() invocation'), fallback)).toBe(fallback);
    expect(extractErrorMessage(new Error('Invalid input: expected string, received number\n at line 1 column 9'), fallback)).toBe(fallback);
    expect(extractErrorMessage(new Error(`at Object.<anonymous> (/repo/src/actions.ts:42:9)
    at processTicksAndRejections (node:internal:process/task_queues:processTicksAndRejections:91:11)`), fallback)).toBe(fallback);
    expect(extractErrorMessage(new Error('  '), fallback)).toBe(fallback);
    expect(extractErrorMessage(new Error('x'.repeat(600)), fallback)).toBe(fallback);
  });

  test('falls back for non-Error inputs', () => {
    expect(extractErrorMessage('plain string', fallback)).toBe(fallback);
    expect(extractErrorMessage(undefined, fallback)).toBe(fallback);
    expect(extractErrorMessage(null, fallback)).toBe(fallback);
    expect(extractErrorMessage({ code: 42 }, fallback)).toBe(fallback);
  });
});