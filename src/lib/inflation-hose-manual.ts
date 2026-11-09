/** Evidence from Marine MK IV M269-00 appendix A-14 p. 2 (PDF 668). */
export function inflationHoseManualDetails(code: string | null | undefined) {
  const part = String(code || '').trim().toUpperCase();
  if (part !== '08718009' && part !== '08255009') return null;
  return {
    part,
    description: part === '08718009' ? 'GIST dupla, 800 mm' : 'GIST simples, 800 mm',
    adapters: part === '08718009' ? ['08719009', '08203009'] : ['08719009'],
    source: 'Marine MK IV M269-00, apêndice A-14, p. 1–3',
    notice: 'Confirmar sistema Leafield, edição do manual e publicação M-07-UM-1HOSE. A vida útil de cinco anos depende do desenho e da data de fabrico ou instalação; há exceções. Não calcular sem esses dados.',
  };
}
