import * as XLSX from 'xlsx';

const wb2 = XLSX.readFile('C:/Users/julio/Desktop/OREYACORESDELUXE/OREY AZORES FEV17 DSB Spares Form FEV 2017.xlsx');

const ws = wb2.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('=== DSB File - First 20 rows ===');
data.slice(0, 20).forEach((row, i) => {
  console.log(`Row ${i}:`, row);
});

console.log('\n=== Looking for header row ===');
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i];
  const nonEmpty = row.filter(cell => cell !== '' && cell !== null && cell !== undefined);
  if (nonEmpty.length > 5) {
    console.log(`Row ${i} has ${nonEmpty.length} non-empty cells:`, nonEmpty.slice(0, 10));
  }
}