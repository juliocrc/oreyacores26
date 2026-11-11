const XLSX = require('xlsx');

function dateValue(sheet, address) {
  const cell = sheet[address];
  if (!cell || cell.v == null || cell.v === '') return { value: null, error: 'data em falta' };
  let day, month, year;
  if (typeof cell.v === 'number') {
    const date = XLSX.SSF.parse_date_code(cell.v);
    if (!date) return { value: null, error: 'data Excel inválida' };
    ({ d: day, m: month, y: year } = date);
  } else {
    const match = String(cell.v).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!match) return { value: null, error: 'data textual não reconhecida como DD/MM/AAAA' };
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return { value: null, error: 'data inválida' };
  return { value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, error: null };
}

module.exports = { dateValue };
