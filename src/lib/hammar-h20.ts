import { parseMonthYearValue } from '@/lib/date-utils';

// Only the explicitly confirmed H20 R catalogue reference; never infer an RX
// or another Hammar product from the manufacturer name.
export function isHammarH20RReference(value: unknown): boolean {
  return String(value ?? '').trim() === '20701002';
}

/** Month/year of replacement, 24 months after the verified installation. */
export function hammarH20RExpiry(installation: unknown): string {
  const parsed = parseMonthYearValue(typeof installation === 'string' ? installation : '');
  if (!parsed || parsed.year < 1900 || parsed.year > 9997) return '';
  return `${String(parsed.month).padStart(2, '0')}/${parsed.year + 2}`;
}

/** A stock expiry is not evidence of an installed unit's replacement date. */
export function installedHruDue(reference: unknown, installation: unknown): string {
  return isHammarH20RReference(reference) ? hammarH20RExpiry(installation) : '';
}

export function validateHammarH20R(data: {
  verified?: unknown; installation?: unknown; expiry?: unknown; inspectionDate?: unknown;
}): string | null {
  const installation = parseMonthYearValue(typeof data.installation === 'string' ? data.installation : '');
  const inspection = parseMonthYearValue(typeof data.inspectionDate === 'string' ? data.inspectionDate : '');
  const expiry = parseMonthYearValue(typeof data.expiry === 'string' ? data.expiry : '');
  const maximum = parseMonthYearValue(hammarH20RExpiry(data.installation));
  if (data.verified !== true || !installation || !inspection || !maximum || installation.year * 12 + installation.month > inspection.year * 12 + inspection.month) {
    return 'Confirme o modelo H20 R, fabrico e armazenamento e indique o mês real de instalação, não posterior à inspeção.';
  }
  if (!expiry || expiry.year * 12 + expiry.month > maximum.year * 12 + maximum.month) {
    return 'Confirme uma validade que não ultrapasse 24 meses após a instalação e marque-a na unidade.';
  }
  return null;
}
