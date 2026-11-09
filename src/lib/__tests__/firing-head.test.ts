import { resolveFiringHeadDesignation } from '@/lib/firing-head';
import { buildQuadroChecklistPayload } from '@/lib/quadro-payload';
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import { useJangadaWizardStore } from '@/modules/JangadaWizard/store/useJangadaWizardStore';
import { buildChecklistInitialValues, buildInspectionChecklistFromQuadro } from '@/modules/inspectionChecklist';

describe('firing head designation', () => {
  it.each([
    ['06721009', 'DK94'], ['08008009', 'DK99'], ['Z63127', 'DK99'],
    ['Z5943', 'DK96'], ['08211009', 'GIST'], ['R08211009', 'GIST'],
    ['08426009', 'GIST'], ['30410046', 'GIST'], ['10388043', 'VTE99'],
  ])('resolves selected reference %s without guessing from a raft model', (reference, expected) => {
    expect(resolveFiringHeadDesignation({ cylinderCabecaDisparoRef: reference })).toBe(expected);
  });

  it.each([
    ['Head, operating, Thanner DK94', 'DK94'],
    ['Head DK99', 'DK99'], ['Leafield GIST operating head', 'GIST'],
    ['Operating head VTE/99-ISO/TSV', 'VTE99'], ['GISTW', 'GISTW'], ['Slave head DK96', 'DK96'],
    ['Special operating head ABC', 'Special operating head ABC'],
    ['DK94, DK99 ou GISTW', 'DK94, DK99 ou GISTW'],
    ['LOGISTICS DK9999X', 'LOGISTICS DK9999X'],
  ])('keeps the selected description ahead of a conflicting system: %s', (description, expected) => {
    expect(resolveFiringHeadDesignation({
      cylinderCabecaDisparoDescricao: description, cylinderSistema: 'Leafield GIST',
    }, 'VTE99')).toBe(expected);
  });

  it.each(['THANNER', 'LEAFIELD', 'THANNER DK99 / DK96', 'DK94, DK99 ou GISTW', 'VTE/99-ISO / VTE/87-PED', 'GIST / THANNER', 'GIST ou THANNER'])('does not infer a head from ambiguous system %s', (system) => {
    expect(resolveFiringHeadDesignation({ cylinderSistema: system }, 'saved head')).toBe('saved head');
  });

  it('uses persisted checklist data before falling back to an unambiguous system', () => {
    expect(resolveFiringHeadDesignation({ cylinderSistema: 'VTE/99-ISO' }, 'old')).toBe('old');
    expect(resolveFiringHeadDesignation({ cylinderSistema: 'VTE/99-ISO' })).toBe('VTE99');
    expect(resolveFiringHeadDesignation({}, '08008009')).toBe('DK99');
    expect(resolveFiringHeadDesignation({}, 'Unknown head')).toBe('Unknown head');
    expect(resolveFiringHeadDesignation({})).toBe('');
    expect(resolveFiringHeadDesignation({ cylinderCabecaDisparoRef: '06721009', cylinderSistema: 'GIST' })).toBe('DK94');
  });

  it('preserves an unknown selected description even with a known reference', () => {
    expect(resolveFiringHeadDesignation({
      cylinderCabecaDisparoDescricao: 'Special operating head ABC',
      cylinderCabecaDisparoRef: '08426009',
      cylinderSistema: 'GIST',
    })).toBe('Special operating head ABC');
    expect(resolveFiringHeadDesignation({
      cylinderCabecaDisparoRef: 'CUSTOM-HEAD', cylinderSistema: 'GIST',
    })).toBe('CUSTOM-HEAD');
  });

  it('resolves history from saved snapshot fields independently of the current raft', () => {
    const current = { cylinderCabecaDisparoRef: '08426009', cylinderSistema: 'GIST' };
    const snapshot = { cylinderCabecaDisparoRef: '06721009', cylinderSistema: 'THANNER' };
    expect(buildQuadroChecklistPayload(current).cabeca_disparo).toBe('GIST');
    expect(buildQuadroChecklistPayload({
      ...snapshot, inspectionChecklistValues: { cabeca_disparo: 'old' },
    }).cabeca_disparo).toBe('DK94');
    expect(buildQuadroChecklistPayload({ inspectionChecklistValues: { cabeca_disparo: '10388043' } }).cabeca_disparo).toBe('VTE99');
    expect(buildQuadroChecklistPayload({
      cylinderSistema: current.cylinderSistema,
      inspectionChecklistValues: { cabeca_disparo: '06721009' },
    }).cabeca_disparo).toBe('DK94');
  });

  it('auto-fills a designation rather than a reference', () => {
    const raft = { model: 'SURVIVA MKIII', cylinderCabecaDisparoRef: '08008009', cylinder: { sistema: 'THANNER' } };
    expect(buildChecklistInitialValues(buildInspectionChecklistFromQuadro(raft), raft).cabeca_disparo).toBe('DK99');
  });

  it('carries selected head and system through actual wizard initialization into exports', () => {
    const store = useJangadaWizardStore;
    const previous = store.getState();
    try {
      store.getState().initializeWizard({ cylinderCabecaDisparoRef: '06721009', cylinderSistema: 'GIST' });
      const data = store.getState().inspectionData;
      expect(buildCertificatePayload(data).checklist.cabeca_disparo).toBe('DK94');
      expect(buildCertificatePayload({ ...data, cylinderCabecaDisparoRef: '', cylinder: { ...data.cylinder, sistema: 'VTE/99-ISO' } }).checklist.cabeca_disparo).toBe('VTE99');
    } finally {
      store.setState(previous, true);
    }
  });
});
