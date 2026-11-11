// Read-only inventory. Does not connect to a database or change source files.
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { dateValue } = require('./certificate-date-2024.cjs');

const directory = path.resolve(process.argv[2] || 'certificados de 2024');
const files = fs.readdirSync(directory).filter(file => /\.xlsx?$/i.test(file)).sort((a, b) => a.localeCompare(b, 'pt'));
const records = [];
const ignored = [];
const errors = [];
const text = (sheet, cell) => String(sheet[cell]?.w ?? sheet[cell]?.v ?? '').trim();
for (const file of files) {
  try {
    const workbook = XLSX.readFile(path.join(directory, file));
    const sheet = workbook.Sheets.CERTIFICADO;
    if (!sheet) { ignored.push(file); continue; }
    const quadro = workbook.Sheets.QUADRO;
    records.push({ file, certificado: text(sheet, 'K3'), serial: text(sheet, 'I12'), modelo: text(sheet, 'C12'), capacidade: text(sheet, 'G12'), fabrico: text(sheet, 'K12'),
      dataInspecao: text(sheet, 'C47'), dataProxima: text(sheet, 'K47'), dataInspecaoValidada: dateValue(sheet, 'C47'), dataProximaValidada: dateValue(sheet, 'K47'), navio: text(sheet, 'D63'), proprietario: text(sheet, 'D65'),
      quadro: Boolean(quadro), quadroSerial: quadro ? text(quadro, 'C7') : null, quadroCertificado: quadro ? text(quadro, 'I5') : null,
      testesDeclarados: { NAP: text(sheet, 'E40'), GI: text(sheet, 'H40'), FS: text(sheet, 'J40'), DL: text(sheet, 'L40') } });
  } catch (error) { errors.push({ file, error: error.message }); }
}
const groups = new Map();
for (const record of records) {
  const key = record.certificado.toUpperCase();
  if (key) groups.set(key, [...(groups.get(key) || []), record.file]);
}
const report = { generatedAt: new Date().toISOString(), directory, records, ignored, errors,
  certificadosRepetidos: [...groups].filter(([, group]) => group.length > 1).map(([certificado, ficheiros]) => ({ certificado, ficheiros })) };
console.log(JSON.stringify(report, null, 2));
