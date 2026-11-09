import { defaultChecklist, evaluateOverallResult, FATO_CHECKLIST_ITEMS } from '../fatos-imersao-checklist';
import { buildVerificacaoPayload, parseChecklistJson, parseInspectionTrace } from '../fatos-imersao-service';

describe('segurança da inspeção de fatos de imersão', () => {
  it('não condena automaticamente um fato por reprovação no ensaio', () => {
    expect(evaluateOverallResult({}, 'Reprovado')).toBe('REPARAR');
    expect(evaluateOverallResult({}, 'BER')).toBe('BER');
    expect(evaluateOverallResult({}, 'Reprovado', '4')).toBe('BER');
  });

  it('não apresenta validade de luz ou condenação do fecho como regra universal', () => {
    expect(FATO_CHECKLIST_ITEMS.find(item => item.key === 'luz')?.desc).not.toContain('≥5');
    expect(FATO_CHECKLIST_ITEMS.find(item => item.key === 'fecho')?.desc).not.toContain('= BER');
  });

  it('exige checklist completa e ensaio aprovado', () => {
    const completed = Object.fromEntries(FATO_CHECKLIST_ITEMS.map(item => [item.key, 'OK']));
    expect(defaultChecklist()).toEqual({});
    expect(evaluateOverallResult({}, 'OK')).toBe('REPARAR');
    expect(evaluateOverallResult(completed, '')).toBe('REPARAR');
    expect(evaluateOverallResult(completed, 'OK')).toBe('REPARAR');
    expect(evaluateOverallResult(completed, 'OK', '', 'N/A', 'soap_air')).toBe('OK');
    expect(evaluateOverallResult({ ...completed, impermeabilidade: 'N/A' }, 'OK', '', 'N/A', 'soap_air')).toBe('REPARAR');
  });

  it('não aprova uma reparação ou reensaio pendente', () => {
    const checklist = Object.fromEntries(FATO_CHECKLIST_ITEMS.map(item => [item.key, 'OK']));
    checklist.fecho = 'R';
    expect(buildVerificacaoPayload({ checklist, leakMetodo: 'soap_air', leakResultado: 'OK', leakReTest: 'Pendente' }).resultadoGeral).toBe('REPARAR');
    expect(buildVerificacaoPayload({ checklist, leakMetodo: 'soap_air', leakResultado: 'OK', leakReTest: 'OK' }).resultadoGeral).toBe('OK');
  });

  it('guarda rastreabilidade com a verificação sem a confundir com itens da checklist', () => {
    const trace = { manualReferencia: 'Manual A', manualRevisao: 'Rev 1', equipamentoEnsaio: 'Dispositivo 42', reparacoes: 'Punho: remendo' };
    const payload = buildVerificacaoPayload({ checklist: { fecho: 'OK' }, trace });
    expect(parseInspectionTrace(payload.checklistJson)).toEqual(trace);
    expect(parseChecklistJson(payload.checklistJson)).toEqual({ fecho: 'OK' });
    expect(parseInspectionTrace('{"fecho":"OK"}')).toBeNull();
    expect(parseInspectionTrace('inválido')).toBeNull();
  });
});
