// Selected-head references documented in raftModelData.ts (not model defaults).
const HEAD_BY_REFERENCE: Record<string, string> = {
  '06721009': 'DK94',
  '08008009': 'DK99',
  Z63127: 'DK99',
  Z5943: 'DK96',
  '08211009': 'GIST',
  R08211009: 'GIST',
  '08426009': 'GIST',
  // Confirmed catalogue description: "Head, Operating, GIST-outlet Leafield".
  '30410046': 'GIST',
  '10388043': 'VTE99',
};

export type FiringHeadSource = {
  cylinderCabecaDisparoRef?: unknown;
  cylinderCabecaDisparoDescricao?: unknown;
  cylinderSistema?: unknown;
};

export function resolveFiringHeadDesignation(source: FiringHeadSource, fallback?: unknown): string {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const designation = (value: string) => {
    const matches = value.toUpperCase().match(/\b(?:GISTW?|DK[\s/-]*\d+|VTE[\s/-]*\d+)\b/g) || [];
    const heads = [...new Set(matches.map((match) => match.replace(/[\s/-]/g, '')))];
    return heads.length === 1 ? heads[0] : '';
  };
  const description = text(source.cylinderCabecaDisparoDescricao);
  const reference = text(source.cylinderCabecaDisparoRef);
  if (description) return designation(description) || description;
  const selected = HEAD_BY_REFERENCE[reference.toUpperCase()] || designation(reference);
  if (selected) return selected;
  const existing = text(fallback);
  // Persisted checklist heads are more specific than a generic inflation system.
  if (existing) return HEAD_BY_REFERENCE[existing.toUpperCase()] || designation(existing) || existing;
  if (reference) return reference;
  // A named system plus an alternative brand is still ambiguous (GIST / THANNER).
  const systemText = text(source.cylinderSistema).replace(/\b(DK|VTE)[\s/-]*(\d+)\b/gi, '$1$2');
  const system = /[/,+]|\b(?:ou|or|legacy)\b/i.test(systemText) ? '' : designation(systemText);
  return system;
}
