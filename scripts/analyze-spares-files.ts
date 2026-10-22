import * as XLSX from 'xlsx';

const wb1 = XLSX.readFile('C:/Users/julio/Desktop/OREYACORESDELUXE/OREY AZORES FEV 17 RFD Spares form fev 2017.xlsx');
const wb2 = XLSX.readFile('C:/Users/julio/Desktop/OREYACORESDELUXE/OREY AZORES FEV17 DSB Spares Form FEV 2017.xlsx');

console.log('=== RFD File ===');
console.log('Sheets:', wb1.SheetNames);
wb1.SheetNames.forEach(name => {
  const ws = wb1.Sheets[name];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  console.log('Sheet:', name, 'Range:', ws['!ref'], 'Rows:', range.e.r + 1, 'Cols:', range.e.c + 1);
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('First 5 rows:', JSON.stringify(data.slice(0, 5), null, 2));
});

console.log('');
console.log('=== DSB File ===');
console.log('Sheets:', wb2.SheetNames);
wb2.SheetNames.forEach(name => {
  const ws = wb2.Sheets[name];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  console.log('Sheet:', name, 'Range:', ws['!ref'], 'Rows:', range.e.r + 1, 'Cols:', range.e.c + 1);
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('First 5 rows:', JSON.stringify(data.slice(0, 5), null, 2));
});