import {
  MIN_REABERTURA_JUSTIFICACAO,
  isFinalizedStatus,
  isInspectionLocked,
  evaluateInspectionEdit,
} from '../inspecao-lock';

describe('isFinalizedStatus', () => {
  test('reconhece os status de fecho', () => {
    expect(isFinalizedStatus('Concluída')).toBe(true);
    expect(isFinalizedStatus('Finalizada')).toBe(true);
  });

  test('tolera acentos, maiusculas e espacos', () => {
    expect(isFinalizedStatus('concluida')).toBe(true);
    expect(isFinalizedStatus('  CONCLUÍDA ')).toBe(true);
    expect(isFinalizedStatus('finalizado')).toBe(true);
  });

  test('nao confunde rascunho com concluida', () => {
    expect(isFinalizedStatus('Rascunho')).toBe(false);
    expect(isFinalizedStatus('Pendente')).toBe(false);
    expect(isFinalizedStatus('')).toBe(false);
    expect(isFinalizedStatus(null)).toBe(false);
  });
});

describe('isInspectionLocked', () => {
  test('carimbo de integridade bloqueia, mesmo com status estranho', () => {
    expect(isInspectionLocked({ integrityHash: 'abc123', status: 'Rascunho' })).toBe(true);
  });

  test('status concluida bloqueia mesmo sem carimbo', () => {
    expect(isInspectionLocked({ status: 'Concluída' })).toBe(true);
  });

  test('rascunho sem carimbo esta livre', () => {
    expect(isInspectionLocked({ integrityHash: null, status: 'Rascunho' })).toBe(false);
    expect(isInspectionLocked({})).toBe(false);
  });

  test('aguenta entradas invalidas', () => {
    expect(isInspectionLocked(null)).toBe(false);
    expect(isInspectionLocked(undefined)).toBe(false);
    expect(isInspectionLocked('Concluída')).toBe(false);
  });
});

describe('evaluateInspectionEdit', () => {
  test('nao bloqueada: deixa passar sem reabertura', () => {
    const d = evaluateInspectionEdit({ bloqueada: false });
    expect(d.permitido).toBe(true);
    if (d.permitido) expect(d.reabertura).toBe(false);
  });

  test('bloqueada sem pedir reabertura: recusa e explica', () => {
    const d = evaluateInspectionEdit({
      bloqueada: true,
      certificadoNumero: 'AZ26-001',
      isAdmin: true,
    });
    expect(d.permitido).toBe(false);
    if (!d.permitido) {
      expect(d.motivo).toBe('pedido-de-reabertura');
      expect(d.mensagem).toContain('AZ26-001');
      expect(d.mensagem).toContain('auditoria');
    }
  });

  test('bloqueada, admin, com justificacao suficiente: permite reabrir', () => {
    const d = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: true,
      justificacao: 'Erro de digitacao no numero de serie do cilindro',
    });
    expect(d.permitido).toBe(true);
    if (d.permitido) expect(d.reabertura).toBe(true);
  });

  test('justificacao curta e recusada', () => {
    const d = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: true,
      justificacao: 'x'.repeat(MIN_REABERTURA_JUSTIFICACAO - 1),
    });
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toBe('justificacao-curta');
  });

  test('justificacao ausente ou vazia e recusada', () => {
    expect(evaluateInspectionEdit({ bloqueada: true, reabrir: true, isAdmin: true }).permitido).toBe(false);
    expect(
      evaluateInspectionEdit({ bloqueada: true, reabrir: true, isAdmin: true, justificacao: '    ' }).permitido
    ).toBe(false);
  });

  test('tecnico comum nao pode reabrir, mesmo com justificacao', () => {
    const d = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: false,
      justificacao: 'Uma justificacao perfeitamente valida e longa',
    });
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toBe('sem-permissao');
  });

  test('permissao desconhecida nao passa como admin', () => {
    const d = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      justificacao: 'Uma justificacao longa o suficiente',
    });
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toBe('sem-permissao');
  });

  test('a justificacao tem de ter o comprimento minimo', () => {
    const ok = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: true,
      justificacao: 'a'.repeat(MIN_REABERTURA_JUSTIFICACAO),
    });
    expect(ok.permitido).toBe(true);
  });
});
