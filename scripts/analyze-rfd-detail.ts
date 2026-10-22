import * as XLSX from 'xlsx';

const wb1 = XLSX.readFile('C:/Users/julio/Desktop/OREYACORESDELUXE/OREY AZORES FEV 17 RFD Spares form fev 2017.xlsx');

const ws = wb1.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('=== RFD File - First 30 rows ===');
data.slice(0, 30).forEach((row, i) => {
  const nonEmpty = row.filter(cell => cell !== '' && cell !== null && cell !== undefined);
  if (nonEmpty.length > 0) {
    console.log(`Row ${i} (${nonEmpty.length} non-empty):`, nonEmpty.slice(0, 15));
  }
});

console.log('\n=== Looking for header row ===');
for (let i = 0; i < Math.min(30, data.length); i++) {
  const row = data[i];
  const nonEmpty = row.filter(cell => cell !== '' && cell !== null && cell !== undefined);
  if (nonEmpty.length > 5) {
    console.log(`Row ${i} has ${nonEmpty.length} non-empty cells:`, nonEmpty.slice(0, 15));
  }
}